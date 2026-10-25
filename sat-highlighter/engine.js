/* Headline Highlighter — content recognition engine.

   Finds the headline, caption and hashtags in a post, labelled or not, and
   says how sure it is. Shared by the Canva panel, the Claude/ChatGPT pages and
   the tests, so everything here is plain functions with no page access (except
   collectBlocks, which reads a reply's structure in the browser).

   The work is done in stages:
     1. collect    — lines, with what each one looks like (heading, bold, list,
                     label, hashtags only, chatter, notes)
     2. structure  — labelled sections, numbered options, paragraphs
     3. classify   — how much each block reads like a headline or a caption
     4. score      — confidence for every field, from labels, structure and
                     how far the winner is ahead of the runner-up
     5. validate   — duplicates, boundaries, missing parts, odd lengths
     6. recover    — a different strategy when one fails or looks wrong
     7. output     — separate, editable fields, never invented text

   Strategies, tried in order: labels, structure, layout, semantic. */

(function (root) {
  "use strict";

  const VERSION = "4.0.0";

  /* ---------- vocabulary ---------- */

  // Label words, as people and chatbots write them. "weak" labels only count
  // when no stronger label for the same field is present.
  const LABELS = {};
  const addLabels = (field, words, extra) => words.forEach(w => { LABELS[w] = Object.assign({ field }, extra || {}); });
  addLabels("headline", ["headline", "title", "hook", "header", "heading", "main headline", "short headline",
    "post title", "headline text", "cover text", "text on image", "on image text", "overlay text",
    "image text", "thumbnail text", "banner text", "big text", "news headline", "story headline",
    // Spanish, Portuguese, French, Italian, German, Indonesian
    "titular", "título", "titulo", "encabezado", "manchete", "titre", "titolo", "titel", "überschrift",
    "schlagzeile", "judul",
    // Swedish, Danish/Norwegian, Dutch, Polish, Czech, Turkish, Romanian, Hungarian,
    // Finnish, Tagalog, Malay, Russian/Ukrainian
    "rubrik", "overskrift", "kopregel", "nagłówek", "tytuł", "nadpis", "titulek", "başlık", "titlu", "cím",
    "otsikko", "pamagat", "tajuk", "заголовок", "назва", "kop",
    // Khmer, Vietnamese, Hindi, Thai, Chinese, Japanese, Korean
    "ចំណងជើង", "tiêu đề", "tít", "शीर्षक", "हेडलाइन", "พาดหัว", "หัวข้อ", "标题", "標題", "見出し", "タイトル",
    "ヘッドライン", "제목", "헤드라인"]);
  addLabels("caption", ["caption", "description", "long caption", "short caption", "full caption", "main caption",
    "caption long", "post caption", "instagram caption", "ig caption", "facebook caption", "fb caption",
    "tiktok caption", "caption text", "caption and hashtags", "caption hashtags", "caption with hashtags",
    "description and hashtags", "story caption",
    "texto", "descripción", "descripcion", "leyenda", "pie de foto", "legenda", "légende", "legende", "texte",
    "beschreibung", "bildunterschrift", "didascalia", "keterangan",
    "bildtext", "billedtekst", "bildetekst", "bijschrift", "onderschrift", "podpis", "opis", "popisek", "açıklama",
    "descriere", "képaláírás", "kuvateksti", "kapsyen", "deskripsyon", "paglalarawan", "подпись", "описание", "підпис", "опис",
    "អត្ថបទ", "ការពិពណ៌នា", "chú thích", "mô tả", "कैप्शन", "विवरण", "คำบรรยาย", "แคปชั่น", "文案", "配文",
    "キャプション", "本文", "캡션", "본문"]);
  addLabels("caption", ["body", "story", "post", "post text", "copy", "text", "summary", "main text", "content"], { weak: true });
  addLabels("capx", ["cta", "call to action", "closing", "closing line", "sign off", "sign-off"]);
  addLabels("tags", ["hashtags", "hashtag", "tags", "tag", "keywords", "hashtag set", "suggested hashtags",
    "hashtag list", "relevant hashtags", "etiquetas", "mots clés", "mots-clés", "schlagwörter",
    "हैशटैग", "แฮชแท็ก", "话题", "標籤", "标签", "ハッシュタグ", "해시태그"]);
  addLabels("alt", ["alternative headlines", "alternative headline", "other headlines", "headline options",
    "alt headlines", "more headlines", "backup headlines", "headline ideas", "alternatives"]);
  // Notes about the post, left out of it. "soft" ones are also everyday words:
  // "Tip:", "Photo:", "Disclaimer:" stay caption text inside a caption, and
  // the assistant's own ("Note:", "Why:", "Angle:", "Tone:") do only in the
  // middle of a paragraph; starting a paragraph or a line of their own after
  // the story, they're the assistant talking, as 3.4 read them.
  addLabels("drop", ["sources", "source", "references", "reference", "credit", "credits", "links", "link",
    "rating", "rated", "why it works", "image prompt", "prompt", "visual idea", "image idea", "image description",
    "photo idea", "alt text", "character count", "characters", "word count", "posting time",
    "best time to post", "engagement tip", "fact check"]);
  addLabels("drop", ["angle", "tone", "format", "visual", "visuals", "length", "reasoning", "score"], { soft: true, meta: "always" });
  addLabels("drop", ["notes", "note", "why", "image", "explanation", "说明", "說明", "설명"], { soft: true, meta: "check" });
  addLabels("drop", ["via", "photo", "tip", "tips", "disclaimer"], { soft: true });

  // The label words 3.4 knew. A story sent from a chat page on its own
  // (Automation) needs a headline and a caption labelled with these.
  const CHAT_HEAD = new Set(["headline", "title", "hook", "short headline", "main headline"]);
  const CHAT_CAP = new Set(["caption", "long caption", "short caption", "full caption", "main caption", "body", "story"]);

  const FIELDS_SHOWN = ["headline", "caption", "tags"];

  // Hashtags: a # straight after a space or the start, holding at least one
  // letter. "#1" is a rank, "C#" a language, "page.html#top" a link.
  // Marks (\p{M}) and joiners keep Khmer, Thai and Devanagari tags whole.
  const TAG_RE = /(?<![\p{L}\p{M}\p{N}_&\/#])#(?=[\p{L}\p{M}\p{N}_\u200c\u200d]*\p{L})[\p{L}\p{M}\p{N}_\u200c\u200d]+/gu;
  // In a hashtag list anything after a # counts: #2024, #911, #a#b#c.
  const TAG_LOOSE = /#[\p{L}\p{M}\p{N}_\u200c\u200d]+/gu;

  // Chat before a post: "Sure! Here's your post:", "Absolutely, here are three options".
  // Openers like "Yes, you read that right." also match, so this only ever
  // decides unlabelled text, never a labelled caption.
  const INTRO_RE = /^(?:(?:sure(?: thing)?|okay|ok|absolutely|of course|certainly|alright|all right|got it|perfect|no problem|definitely|yes|yep|awesome|great(?: question| idea| choice)?|happy to help|done|love (?:it|this|that)|sounds good|you got it|will do)(?:\s*[!,.:;—–]|\s+(?:here|this|i|i'm|i’m|i've|i’ve|let)\b)|here(?:'s|’s| is| are)(?: (?:your|a|an|the|my|some|two|three|four|five|\d+))?(?: [\w’'-]+){0,3}? (?:post|posts|draft|drafts|caption|captions|version|versions|headline|headlines|story|stories|rewrite|take|option|options|idea|ideas|copy|text)\b|here you go|here it is|below (?:is|are)|i(?:'ve|’ve| have) (?:written|created|made|drafted|put together|prepared|come up with|rewritten)|i (?:wrote|made|created|drafted|rewrote)|this (?:is|was) (?:a|an|the|your|my) (?:post|caption|version|draft|headline|rewrite|take|shorter|longer|punchier)|this (?:post|version|draft)\b|let me\b|happy to\b|as requested|thanks for\b|thank you for\b|good (?:call|catch))/i;
  // The assistant's own follow-up offers, the only chat trimmed off the end of
  // a caption (the same short list 3.4 used, plus a few close cousins).
  const OFFER_RE = /^(?:let me know|want me to|would you like|if you(?:'d|’d| would) like|i can also|happy to|shall i|do you want|i hope this helps|hope this helps|feel free to (?:tweak|adjust|edit|change|modify|use)|(?:want|need) (?:a|an|another) (?:shorter|longer|different|new|punchier|alternative)?\s*(?:version|one|take|caption|headline|draft)|i can (?:make|write|create|adjust|shorten|tweak|turn|rewrite)|should i (?:make|write|create|adjust|shorten|rewrite))\b/i;
  // An offer about the text itself ("Want me to make it shorter?", "Let me
  // know if you'd like any changes!"). A post's own call to action ("Let me
  // know in the comments", "Would you like to see more?") doesn't name the
  // writing, so it stays.
  // Asked of you, not of the readers: "Want me to…", "Would you like me to…",
  // "If you'd like, I can…", "Shall I…". Or an offer that names the writing
  // ("Should I make it shorter?", "Need another version?").
  const ASSIST_RE = /^(?:(?:do you (?:want|need) |would you like |want |need )me to\b|if you(?:'d|’d| would)? (?:like|want),? i (?:can|could)\b|i can also (?:make|write|create|add|turn|translate|give|do|adjust|shorten|draft|suggest|include)\b|i could also\b|let me know if you(?:'d|’d| would)? (?:like|want|need) (?:me to|a|an|another|any|it)\b|shall i\b|(?:should i|i can|happy to|feel free to)\b[^\n]{0,60}?\b(?:versions?|captions?|headlines?|drafts?|shorter|longer|punchier|catchier|simpler|tone|emojis?|hashtags|changes|tweak|edit|adjust\w*|rewrite|rephrase|shorten|lengthen|tighten|variations?|alternatives?|call to action|cta|source|image|prompt|title|translation)\b|(?:want|need|would you like) (?:a|an|another) (?:[\w-]+ ){0,2}(?:version|caption|headline|draft|take|one)\b)/i;
  const OUTRO_RE = /^(?:let me know|want me to|would you like|if you(?:'d|’d| would| want| need)|i can also|i could also|happy to|shall i|do you want|feel free|hope (?:this|that|you)|need (?:any|more|another)|should i|tell me|any (?:changes|tweaks|edits)|want (?:a|another|more|it|me)|can i|would it help|or (?:would|do|should) you|which (?:one|version|option)|just say|ready (?:for|when)|enjoy|what would you like|what do you want|how can i help|anything else)\b/i;
  // A reaction to the story, not the story: "This is so wild.", "Some people never learn."
  const REACTION_RE = /^(?:this is|this was|that'?s|that is|wow|omg|oh my|so\b|what a|can you believe|unbelievable|insane|crazy|wild|honestly|imagine|lol|haha|yikes|ugh|amazing|incredible|some people|people are|i can'?t|i love|i hate|no way|you won'?t believe)\b/i;
  const META_RE = [
    /^\(?\s*\d+\s*(?:characters?|chars?|words?|letters?)(?:\s*(?:long|total))?\s*\)?\.?$/i,
    /^(?:character|word|char)s?\s*count\b/i,
    /^\(?\s*(?:rated?|score)\s*[:\s]\s*[\d.]+/i,
    /^\(?\s*(?:rated\s*)?\d+(?:\.\d+)?\s*\/\s*10\s*\)?\.?$/i,
    /^(?:https?:\/\/|www\.)\S+$/i,
    /^\[\d+\]\s*\S+/
  ];
  // Interface text a chat page or a web page puts around content.
  const NOISE = new Set(["plaintext", "markdown", "md", "html", "css", "javascript", "json", "python", "bash", "shell",
    "typescript", "yaml", "xml", "sql", "csv", "txt",
    "copy", "copied", "copy code", "edit", "share", "retry", "regenerate", "like", "dislike",
    "good response", "bad response", "read aloud", "more", "show more", "show less", "chatgpt said",
    "you said", "claude said", "claude", "chatgpt", "searched the web", "sources", "reply", "send", "menu", "home",
    "search", "sign in", "log in", "sign up", "subscribe", "advertisement", "share this article",
    "read more", "click here", "skip to content", "back", "next", "previous", "close", "open", "save",
    "download", "print", "follow", "followers", "following", "view all", "load more"]);
  // "BREAKING:", "WATCH:" open news headlines; "Police:" attributes one.
  const KICKER_RE = /^(?:breaking(?: news)?|update[ds]?|watch|exclusive|opinion|analysis|report|live|video|photos?|just in|developing|new|review|explainer|editorial|poll|quiz|interview|podcast|alert|urgent|official|confirmed|revealed|warning|study|survey|op-ed|fact check|explained|recap|preview|listen|look|viral|trending|heartwarming|good news)$/i;
  const PREFIX_RE = /^([\p{L}\p{M}][\p{L}\p{M}'’ -]{0,24}?)\s?[:：]\s*\S/u;
  // A critique of a headline, not a headline: "Strong hook, but…", "8/10",
  // "Consider a stronger verb", "I'd cut the last line".
  const CRIT_RE = /(?:\b(?:strong|good|great|solid|nice|weak) (?:hook|overall|opening|headline)\b[^.!?\n]{0,40}\bbut\b|\b(?:consider|try) (?:cutting|changing|adding|removing|swapping|using|making|leading with)\b[^.!?\n]{0,12}\b(?:(?:the|this|that) (?:headline|hook|verb|word|caption|number|line|ending|opening|title)\b|it\b)|\bconsider (?:a|an) (?:more |less )?(?:specific|stronger|shorter|different|punchier|active) (?:verb|word|hook|headline|opening|title)\b|\bi'?d (?:cut|change|swap|tighten|trim|drop|rewrite|lead with|go with)\b|\btoo (?:long|wordy|short) by (?:about |around |~)?\d|\brepeats the headline\b)/i;
  // Critiques quote a word or two of the headline: "Try cutting “after viral
  // video”", "“stunned” is overused".
  const CRIT_QUOTE_RE = /\b(?:consider|try) (?:cutting|changing|adding|removing|swapping|using|leading with)\b[^.!?\n]{0,12}["“'‘]|["”'’] (?:is|feels|sounds) overused\b/i;
  const CRIT_NUM_RE = /^\s*[-–—•*]?\s*\d+(?:\.\d)?\s*\/\s*10\b|\b\d+\s*(?:characters|chars)\b[^.!?\n]{0,30}\b(?:cut|under|over|limit|too long)\b/i;
  // Quoted speech is someone in the story, not the assistant, so it's left
  // out, except where a critique quotes the words it's about.
  const critique = (s, numbers) => {
    const t = flat(s), said = t.replace(/["“][^"”]*["”]/g, " ");
    return CRIT_RE.test(said) || CRIT_QUOTE_RE.test(t) || (!!numbers && CRIT_NUM_RE.test(said));
  };
  const NOISE_RE = /^(?:thought for \d+|searched \d+|analy[sz]ed|reasoned for|\d+\s*\/\s*\d+$|claude can make mistakes|chatgpt can make mistakes|message (?:claude|chatgpt))/i;

  // Past-tense news verbs and named things: small evidence that a line is news.
  const TRIGGERS = `rejected refused denied banned blocked fired sacked arrested charged
    sentenced convicted sued quit walked stormed broke collapsed crashed diverted grounded
    canceled cancelled stranded exploded strangled str*ngled fractured paralyzed paralysed
    hospitalized hospitalised survived saved donated raised inherited humiliated betrayed
    abandoned adopted reunited discovered revealed confessed admitted apologized apologised
    escaped vanished disappeared stunned shocked ignored mocked evicted deported bankrupt
    homeless viral k*lled murd*r murd*red st*bbed d£ath di£d`.trim().split(/\s+/);
  const TRIGGER_SET = new Set(TRIGGERS);
  const ENTITIES = new Set(`tsa fbi cia nasa faa ntsb doj dhs cdc irs fda sec epa
    nypd lapd ceo cfo coo cto cbs nbc abc bbc cnn nfl nba mlb nhl fifa nato eu un ufc
    delta united frontier spirit southwest jetblue alaska ryanair easyjet lufthansa
    emirates qatar boeing airbus embraer tesla spacex amazon google apple meta netflix
    disney walmart microsoft nvidia openai twitter facebook instagram tiktok youtube uber
    precheck congress senate parliament pentagon`.trim().split(/\s+/));
  const SMALL_WORDS = new Set(`a an the and or but of to in on at for with from by as is was were are be
    its it his her their than so if vs via per into onto off up out`.trim().split(/\s+/));

  /* ---------- small text helpers ---------- */

  const clean = (s) => String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[   ]/g, " ");
  const flat = (s) => String(s || "").replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  const lenOf = (s) => [...String(s || "")].length;
  const norm = (s) => flat(s).toLowerCase()
    .replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-");
  const wordsOf = (s) => (String(s || "").match(/[\p{L}\p{N}*£$%'’.-]+/gu) || [])
    .map(w => w.replace(/^[^\p{L}\p{N}*£$]+|[^\p{L}\p{N}*£$%]+$/gu, "")).filter(Boolean);
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const round2 = (x) => Math.round(x * 100) / 100;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // Hashtags you typed or asked for: anything after a # counts, #2024 too.
  function hashtags(text) {
    const out = [], seen = new Set();
    (String(text || "").match(TAG_LOOSE) || []).forEach(t => {
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(t); }
    });
    return out;
  }

  // Only hashtags (and commas, dots or bars between them) on this line.
  function tagOnly(s) {
    const t = String(s || "").trim();
    const found = t.match(TAG_LOOSE) || [];
    if (!found.length || t.replace(TAG_LOOSE, "").replace(/[\s,.;|•·/\\-]+/g, "").length) return false;
    // "#1" alone is a rank; a line of tags with at least one word, or several, is a hashtag list.
    return found.length >= 2 || /\p{L}/u.test(found[0]);
  }

  // Splits hashtags written onto the end of a line: "...for good. #a #b".
  function cutTrailingTags(s) {
    const m = String(s || "").match(/(?:^|\s)((?:#[\p{L}\p{M}\p{N}_\u200c\u200d]+[\s,]*){1,})$/u);
    if (!m || !tagOnly(m[1])) return { text: s, tags: [] };
    const keep = s.slice(0, s.length - m[1].length).replace(/\s+$/, "");
    return { text: keep, tags: m[1].match(TAG_LOOSE) || [] };
  }

  // Common abbreviations end in a dot without ending a sentence.
  const ABBR_RE = /\b(?:[A-Za-z]\.){2,}|\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|No|Inc|Ltd|Co|Mt|Ft|Gen|Sen|Rep|Gov|Lt|Col|Capt|Sgt|Prof|Ave|approx|e\.g|i\.e)\./g;
  function sentenceCount(s) {
    const t = flat(s).replace(ABBR_RE, "ABBR").replace(/\d\.\d/g, "0,0");
    const ends = t.match(/[.!?…]+["'”’)\]]*(?=\s+["'“‘(]?[\p{Lu}\p{N}]|\s*$)/gu) || [];
    return Math.max(ends.length, t.trim() ? 1 : 0);
  }
  const endsSentence = (s) => /[.!?…]["'”’)\]]*$/.test(flat(s));

  function caseShape(s) {
    const up = (s.match(/\p{Lu}/gu) || []).length, low = (s.match(/\p{Ll}/gu) || []).length;
    const ws = wordsOf(s).filter(w => /\p{L}/u.test(w));
    const big = ws.filter(w => !SMALL_WORDS.has(w.toLowerCase()));
    const titled = big.filter(w => /^\p{Lu}/u.test(w)).length;
    return {
      caps: up + low ? up / (up + low) : 0,
      title: big.length ? titled / big.length : 0,
      words: ws.length
    };
  }

  // **bold**, __bold__, *italic*, `code`. Censored words keep their stars:
  // "k*lled" has no space before its star, so it is never read as italics.
  function stripEmphasis(s) {
    return String(s)
      .replace(/\*\*(?=\S)(.+?)\*\*/g, "$1")
      .replace(/__(?=\S)(.+?)__/g, "$1")
      .replace(/(^|[\s(\["'])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?=[\s).,;:!?"'\]]|$)/g, "$1$2")
      .replace(/(^|[\s(\["'])_(?=[^\s_])([^_\n]*?[^\s_])_(?=[\s).,;:!?"'\]]|$)/g, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1");
  }

  /* ---------- stage 1: collect ---------- */

  function labelKey(name) {
    return String(name || "").normalize("NFC").toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{M}\p{N}+&' -]/gu, " ")
      .replace(/\s*[+&]\s*/g, " and ").replace(/\s+/g, " ").trim();
  }

  function lookupLabel(name) {
    let k = labelKey(name);
    let idx = 0;
    const num = k.match(/^(.*?)\s*#?\s*(\d{1,2})$/);
    if (num && LABELS[num[1]]) { k = num[1]; idx = +num[2]; }
    const hit = LABELS[k] || LABELS[k.replace(/ and /g, " ")];
    return hit ? Object.assign({ name: k, idx }, hit) : null;
  }

  // "Headline:", "**Caption:** text", "## Hashtags", "📰 Title (68 chars): text",
  // "Headline 2:", "Caption - text". Returns null for ordinary text.
  function parseLabel(display) {
    const lead = display.replace(/^[^\p{L}]+/u, "");
    if (!lead) return null;
    let m = lead.match(/^([\p{L}][\p{L}\p{M}\p{N} '’&+\/#-]{0,34}?)\s*(?:\(([^)]{0,48})\)|\[([^\]]{0,48})\])?\s*[:：]\s*([\s\S]*)$/u);
    if (m) {
      const hit = lookupLabel(m[1]);
      if (hit) return Object.assign(hit, { rest: m[4].trim(), standalone: !m[4].trim(), note: (m[2] || m[3] || "").trim() });
    }
    m = lead.match(/^(headline|title|caption|hashtags|tags)\s*[-–—]\s+(.+)$/i);
    if (m) {
      const hit = lookupLabel(m[1]);
      if (hit) return Object.assign(hit, { rest: m[2].trim(), standalone: false, note: "" });
    }
    const bare = lead.replace(/[\s:*_.\-]+$/, "").replace(/\s*\(([^)]{0,48})\)$/, "");
    // "Why?" and "Tips!" are sentences, not labels.
    if (!/[?!]/.test(bare) && bare.split(/\s+/).length <= 4) {
      const hit = lookupLabel(bare);
      if (hit) return Object.assign(hit, { rest: "", standalone: true, note: "" });
    }
    return null;
  }

  // "OPTION 1 (Rated 9/10)", "Option B: Emotional", "Version 2" — a header on a
  // line of its own, never "Take a moment…" or "Version 2 of the app is out".
  const OPTION_RE = /^(?:option|version|variation|variant)\s*#?\s*(\d{1,2}|[a-e])(?![\p{L}\p{N}])(\s*[:.)\-–—]\s*)?(.*)$/iu;
  function optionMark(t, L) {
    if (L.label || lenOf(t) > 120) return null;
    const s = t.replace(/^\s*(?:[-*•·+]|\d{1,2}[.)])\s+/, "").replace(/^[^\p{L}]+/u, "");
    const m = s.match(OPTION_RE);
    if (!m) return null;
    const rest = m[3].trim();
    const plain = !rest || /^[(\[]/.test(rest) || /^(?:rated|score)\b/i.test(rest);
    const n = m[1].toUpperCase();
    if (!L.bullet && lenOf(t) <= 80 && (plain || (!!m[2] && lenOf(rest) <= 60 && sentenceCount(rest) <= 1 && !/\.\s*$/.test(rest)))) return { n, note: rest };
    // "- Option 1:", "Option 1 - Emotional angle.", "Option 1 Emotional": a
    // header only if every option turns out to have its own labels.
    if (plain || !!m[2] || (rest.split(/\s+/).length <= 3 && !/[.!?]$/.test(rest))) return { n, note: rest, loose: true };
    return null;
  }

  function makeLine(raw, hint) {
    const h = hint || {};
    let t = clean(raw).replace(/\s+$/, "");
    const L = { raw: t, heading: h.heading || 0, bold: !!h.bold, bullet: false, quote: false, sep: false, cell: !!h.cell };
    if (/^\s*([-*_=~])(?:\s*\1){2,}\s*$/.test(t)) { L.sep = true; L.text = ""; L.blank = true; return L; }
    const hm = t.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (hm) { L.heading = L.heading || hm[1].length; t = hm[2]; }
    if (/^\s{0,3}>\s?/.test(t)) { L.quote = true; t = t.replace(/^\s{0,3}>\s?/, ""); }
    if (/^\s*(\*\*|__)(?=\S)(.+?)\1\s*[:.]?\s*$/.test(t)) L.bold = true;
    L.bullet = /^\s*(?:[-*•·+]|\d{1,2}[.)])\s+\S/.test(t);
    t = stripEmphasis(t).trim();
    L.text = t;
    L.blank = !t;
    if (L.blank) return L;
    // Table cells ("Title | Author | Description") are never labels.
    L.label = L.cell ? null : parseLabel(t);
    const om = optionMark(t, L);
    if (om && om.loose) L.optionLoose = om;
    else if (om) L.option = om;
    L.tagOnly = tagOnly(t);
    const low = t.toLowerCase();
    L.noise = NOISE.has(low.replace(/[.:!]+$/, "")) || NOISE_RE.test(t) || (h.ui === true);
    L.meta = META_RE.some(r => r.test(t));
    if (!L.label && !L.tagOnly) {
      const bare = t.replace(/^[^\p{L}]+/u, "");
      if (OUTRO_RE.test(bare)) L.chatter = "outro";
      else if (INTRO_RE.test(bare) && (/[:!]\s*$/.test(t) || lenOf(t) < 140)) L.chatter = "intro";
    }
    return L;
  }

  // Stage 1. Text, or blocks read from a page (see collectBlocks), become lines.
  function collect(input) {
    const lines = [];
    if (input && Array.isArray(input.blocks) && input.blocks.length) {
      input.blocks.forEach((b, bi) => {
        if (bi && lines.length && !lines[lines.length - 1].blank) lines.push(makeLine("", null));
        const head = /^h[1-6]$/i.test(b.tag || "") ? +String(b.tag).slice(1) : 0;
        const cell = /^t[dh]$/i.test(b.tag || "");
        clean(b.text).split("\n").forEach(l => lines.push(makeLine(l, { heading: head, bold: !!b.bold, ui: !!b.ui, cell })));
      });
    } else {
      const text = typeof input === "string" ? input : (input && input.text) || "";
      clean(text).split("\n").forEach(l => lines.push(makeLine(l, null)));
    }
    // "CREDIT: FIREFIGHTERS SAVE KITTEN AGAIN" or "Note: Firefighters Warn About
    // Storm Drains" opening a post is its headline, not a note. Only there:
    // "Sources: CNN, ABC News" at the end is still a source list.
    const first = lines.find(l => !l.blank && !l.noise && !l.meta && !l.chatter);
    if (first && first.label && first.label.field === "drop" && first.label.rest && !/,/.test(first.label.rest)
      && wordsOf(first.label.rest).length >= 3) {
      const sh = caseShape(first.label.rest);
      if (sh.caps >= 0.6 || sh.title >= 0.6) first.label = null;
    }
    let p = 0, prevBlank = true;
    lines.forEach((l, i) => {
      l.i = i;
      if (l.blank) { if (!prevBlank) p++; prevBlank = true; l.para = -1; return; }
      prevBlank = false;
      l.para = p;
    });
    return lines;
  }

  /* ---------- stage 2: structure ---------- */

  function paragraphs(lines) {
    const out = [];
    let cur = null;
    lines.forEach(l => {
      if (l.blank) { cur = null; return; }
      if (!cur) { cur = []; out.push(cur); }
      cur.push(l);
    });
    return out;
  }

  const joinLines = (ls) => ls.map(l => l.text).join("\n").trim();
  const joinParas = (ps) => ps.map(joinLines).filter(Boolean).join("\n\n");

  function splitOptionLines(lines) {
    const marks = [];
    lines.forEach((l, i) => { if (l.option || l.optionLoose) marks.push(i); });
    if (marks.length < 2) return null;
    return marks.map((at, k) => {
      const end = k + 1 < marks.length ? marks[k + 1] : lines.length;
      const body = lines.slice(at + 1, end);
      while (body.length && (body[body.length - 1].blank || body[body.length - 1].sep)) body.pop();
      const o = lines[at].option || lines[at].optionLoose;
      const rated = (o.note.match(/(?:rated|score)?[\s:(]*([\d.]+\s*\/\s*\d+)/i) || [])[1] || "";
      return { label: "Option " + o.n, n: o.n, rating: rated.replace(/\s+/g, ""), note: o.note, lines: body, loose: !!o.loose };
    });
  }

  // Labelled sections. Inside a caption, everyday note words ("Tip:", "Why?",
  // "Photo:") and weak caption words ("Story:") are just caption text. A note
  // label written inline ("Sources: CNN") drops only its own line; one on its
  // own line drops what follows, up to the next label.
  // Is a note the assistant's? "Angle:", "Tone:" always are. "Note:", "Why:",
  // "Image:" are when what follows talks about the writing or is a list;
  // "Why:\n\nBecause her daughter asked…" is the post.
  function assistantNote(lab, lines, k) {
    if (lab.meta === "always") return true;
    const said = [lab.rest || ""];
    for (let j = k + 1; j < lines.length && said.length < 8; j++) {
      const x = lines[j];
      if (x.label) break;
      if (x.blank) { if (lab.rest) break; continue; }
      said.push(x.raw);
    }
    const t = said.join("\n");
    return /^\s*(?:[-*•·]|\d{1,2}[.)])\s/m.test(t)
      || /\b(?:caption|headline|hashtags?|characters?|words?|emojis?|tone|hook|version|draft|i kept|i used|i added|i chose|i made|i wrote|i went with|feel free|you can|swap)\b/i.test(t)
      // the same, said in Chinese or Korean ("我把标题写得更短", "제목을 더 짧게")
      || /标题|標題|文案|话题|話題|标签|標籤|字数|字數|表情|语气|語氣|版本|我(?:把|用|加|保留|选|写|改)|제목|캡션|해시태그|글자|이모지|버전|어조/.test(t);
  }

  function labelSections(lines) {
    const sections = [], pre = [];
    let cur = null, prevBlank = true, dropPara = false;
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      const startsPara = prevBlank;
      prevBlank = !!l.blank;
      if (dropPara) { if (!l.blank && !l.label) continue; dropPara = false; }
      if (l.label) {
        const lab = l.label;
        const inCaption = cur && (cur.field === "caption" || cur.field === "capx");
        const asText = lab.field === "drop" && lab.soft && (!lab.meta || (!startsPara && !lab.standalone) || !assistantNote(lab, lines, k));
        if (inCaption && (asText || (lab.field === "caption" && lab.weak && !cur.weak))) {
          cur.lines.push(Object.assign({}, l, { label: null }));
          continue;
        }
        // "Note: I kept it short." starting a paragraph: that paragraph goes.
        if (lab.field === "drop" && !lab.standalone) { if (startsPara && lab.meta) dropPara = true; continue; }
        cur = { field: lab.field, name: lab.name, weak: !!lab.weak, idx: lab.idx, note: lab.note, lines: [], at: l.i };
        if (lab.rest) cur.lines.push(makeLine(lab.rest, { heading: l.heading, bold: l.bold }));
        sections.push(cur);
        continue;
      }
      if (cur) cur.lines.push(l);
      else pre.push(l);
    }
    return { sections, pre };
  }

  /* ---------- stage 3: classify ---------- */

  // How much a block reads like a headline. Each point of evidence is small;
  // no single trait — first line, capitals, bold, length — decides it.
  function headlineScore(text, f) {
    f = f || {};
    const one = flat(text);
    const len = lenOf(one);
    const why = [];
    let s = 0;
    if (!one) return { s: -99, why };
    if (len < 8) s -= 4;
    else if (len < 16) s -= 1.2;
    else if (len <= 150) { s += 2; }
    else if (len <= 230) s += 0.4;
    else { s -= 3.5; why.push("too long for a headline"); }

    const shape = caseShape(one);
    if (shape.words >= 4 && shape.words <= 30) s += 1;
    else if (shape.words < 3) s -= 1.5;
    else if (shape.words > 40) s -= 1.5;

    const sc = sentenceCount(one);
    if (sc <= 1) s += 1.4; else if (sc === 2) s -= 1.6; else { s -= 2.6; why.push("reads like several sentences"); }
    if (/:\s*$/.test(one)) s -= 3;
    else if (/\.\s*$/.test(one) && !/\.\.\.$|…$/.test(one)) s -= 0.7;
    else if (!/[.!?]\s*$/.test(one)) s += 0.7;

    if (shape.caps >= 0.85 && shape.words >= 3) { s += 1.2; why.push("set in capitals"); }
    else if (shape.title >= 0.6 && shape.words >= 3) { s += 0.9; why.push("title case"); }

    if (f.heading) { s += 2.4; why.push("marked as a heading"); }
    else if (f.bold) { s += 1.4; why.push("bold on its own line"); }
    if (f.bullet) s -= 1;
    if (f.alone) s += 0.4;
    if (f.only) { s += 1.2; why.push("the only text given"); }
    if (f.first) { s += 0.7; why.push("comes first"); }
    if (f.followedByBody) { s += 1.6; why.push("the story follows it"); }
    if (f.precededByBody) s -= 0.8;

    const ws = wordsOf(one).map(w => w.toLowerCase());
    if (/\d/.test(one)) s += 0.4;
    if (/["“”]/.test(one)) s += 0.3;
    if (ws.some(w => TRIGGER_SET.has(w))) s += 0.5;
    if (ws.some(w => ENTITIES.has(w))) s += 0.3;

    // When it's all you pasted, an opening like "Here's why…" is the headline itself.
    if (!f.only) {
      if (f.chatter || INTRO_RE.test(one) || OUTRO_RE.test(one)) { s -= 6; why.push("reads like chat around the post"); }
      else if (REACTION_RE.test(one) && len < 70) { s -= 3; why.push("reads like a reaction, not news"); }
    }
    if (f.meta || META_RE.some(r => r.test(one))) s -= 6;
    const tagN = (one.match(TAG_RE) || []).length;
    if (tagN && tagN / Math.max(1, shape.words) > 0.4) s -= 5;
    if (/https?:\/\/|www\./i.test(one)) s -= 3;
    if (!/[\p{L}\p{N}]/u.test(one)) s -= 6;
    return { s, why };
  }

  function captionScore(text) {
    const one = flat(text);
    const len = lenOf(one);
    if (!one) return -99;
    let s = 0;
    if (len >= 60) s += 2; else if (len >= 25) s += 0.8; else s -= 1;
    const sc = sentenceCount(one);
    if (sc >= 2) s += 2; else if (endsSentence(one)) s += 0.8;
    const shape = caseShape(one);
    if (shape.caps < 0.5) s += 0.8;
    if (OUTRO_RE.test(one) || INTRO_RE.test(one)) s -= 6;
    if (META_RE.some(r => r.test(one))) s -= 6;
    if (tagOnly(one)) s -= 6;
    return s;
  }

  // A paragraph is body text when it reads as sentences.
  const isBody = (ls) => captionScore(joinLines(ls)) >= 2.6;

  /* ---------- stage 4/5: scoring and validation ---------- */

  // mode: "keep"   a labelled caption closed by a later label: every paragraph stays
  //       "offers" a labelled caption at the end, or one under its headline:
  //                only the assistant's follow-up offers are trimmed off the end
  //       "nohead" text with no headline: chat before and after it is trimmed
  // Hashtags in anything trimmed are kept, and hashtags written onto the end
  // of the last line move to the tags.
  function finishCaption(paras, tags, warnings, mode) {
    const out = [];
    // Paragraphs before the post's own hashtags are the post's, whatever
    // they say; after them, it's the assistant again.
    let boundary = 0;
    paras.forEach(p => {
      const keep = [];
      let tagged = false;
      p.forEach(l => {
        if (l.tagOnly) { tags.push(...(l.text.match(TAG_LOOSE) || [])); tagged = true; return; }
        if (l.meta || l.noise || l.sep) return;
        if (l.label && l.label.standalone) return;
        keep.push(l);
      });
      if (keep.length) out.push(keep);
      if (tagged || (keep.length && cutTrailingTags(keep[keep.length - 1].text).tags.length)) boundary = out.length;
    });
    let dropped = 0;
    const drop = (p) => { dropped++; p.forEach(l => { const c = cutTrailingTags(l.text); tags.push(...(c.text.match(TAG_RE) || []), ...c.tags); }); };
    const bare = (l) => l.text.replace(/^[^\p{L}]+/u, "").replace(/[\s\p{Extended_Pictographic}\u200d\ufe0f]+$/u, "");
    const assist = (l) => ASSIST_RE.test(bare(l));
    const offer = (l) => assist(l) || OFFER_RE.test(bare(l));
    if (mode === "keep") {
      while (out.length > 1 && out[out.length - 1].every(assist)) drop(out.pop());
    } else {
      const tail = (k) => mode === "nohead" ? (l) => offer(l) || l.chatter === "outro"
        : boundary > 0 && k >= boundary ? offer : assist;
      while (out.length > 1 && out[out.length - 1].every(tail(out.length - 1))) drop(out.pop());
      if (mode === "nohead") while (out.length && out[0].every(l => l.chatter === "intro")) drop(out.shift());
    }
    if (out.length) {
      const last = out[out.length - 1];
      const ll = last[last.length - 1];
      const cut = cutTrailingTags(ll.text);
      if (cut.tags.length) {
        tags.push(...cut.tags);
        if (cut.text.trim()) last[last.length - 1] = Object.assign({}, ll, { text: cut.text });
        else last.pop();
        if (!last.length) out.pop();
      }
    }
    if (dropped && warnings) warnings.push("Left out " + dropped + " line" + (dropped > 1 ? "s" : "") + " of chat around the caption");
    return out;
  }

  function inlineTags(text) { return String(text || "").match(TAG_RE) || []; }

  function dedupeTags(list) {
    const out = [], seen = new Set();
    list.forEach(t => { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(t); } });
    return out.slice(0, 40);
  }

  function baseResult(strategy) {
    return {
      ok: false, strategy, headline: "", caption: "", hashtags: [],
      confidence: { headline: 0, caption: 0, hashtags: 0, overall: 0 },
      reasons: [], warnings: [], missing: [], candidates: [], needsConfirm: false,
      labels: { headline: null, caption: null }   // the label words the fields came from
    };
  }

  const CONFIRM_AT = 0.7;

  // Stage 5: checks one field against another, and fixes what it safely can.
  // "Here's a headline: …", "Suggested headline: …", "Try this: …": the words
  // introducing a headline aren't part of it.
  const LEAD_RE = /^(?:(?:sure|ok(?:ay)?|absolutely|of course|got it|perfect)[!,.]?\s+)?(?:here(?:'s|’s| is| are)(?: (?:a|an|the|your|my))?(?: [\w’'-]+){0,2}? (?:headline|title|hook|version|option|caption|take|pick|suggestion|rewrite)s?|try this|how about|here you go|i'?d go with|my (?:pick|choice|favou?rite)|(?:shorter|punchier|longer|catchier|simpler|better|stronger|alternative|revised|new|final|updated|suggested|rewritten) (?:version|one|option|take|headline|title|hook)|(?:headline|title) (?:idea|suggestion|option)s?|punchier|shorter|suggestion)\s*[:：]\s*/i;
  function stripLead(r) {
    const m = r.headline && r.headline.match(LEAD_RE);
    if (!m) return;
    const rest = r.headline.slice(m[0].length).replace(/^["“*]+|["”*]+$/g, "").trim();
    if (wordsOf(rest).length < 3) return;
    r.warnings.push("Left out \u201c" + m[0].trim() + "\u201d in front of the headline");
    r.headline = rest;
  }

  function validate(r, hasBody) {
    const w = r.warnings;
    stripLead(r);
    if (r.headline) {
      const cut = cutTrailingTags(r.headline);
      if (cut.tags.length && cut.text.trim()) { r.headline = cut.text.trim(); r.hashtags = cut.tags.concat(r.hashtags); }
      if (tagOnly(r.headline)) { r.hashtags = (r.headline.match(TAG_LOOSE) || []).concat(r.hashtags); r.headline = ""; r.confidence.headline = 0; }
    }
    if (r.headline && r.caption) {
      if (norm(r.headline) === norm(r.caption)) {
        r.caption = ""; r.confidence.caption = 0;
        w.push("The caption was the headline again — left it empty");
      } else {
        const paras = r.caption.split(/\n\s*\n/);
        if (paras.length > 1 && norm(paras[0]) === norm(r.headline)) {
          r.caption = paras.slice(1).join("\n\n");
          w.push("Removed the headline repeated at the top of the caption");
        }
      }
    }
    if (r.headline && lenOf(flat(r.headline)) > 300) {
      r.confidence.headline *= 0.6;
      w.push("The headline is unusually long — check it's not the caption");
    }
    // A short caption is fine when it was labelled ("Link in bio 🔗").
    if (r.caption && lenOf(flat(r.caption)) < 15 && !endsSentence(r.caption) && !(r.labels && r.labels.caption)) r.confidence.caption *= 0.7;
    r.hashtags = dedupeTags(r.hashtags);
    if (r.hashtags.length && !r.confidence.hashtags) r.confidence.hashtags = 0.85;
    if (!r.hashtags.length) r.confidence.hashtags = 0;

    r.missing = [];
    if (!r.headline) r.missing.push("headline");
    if (!r.caption) r.missing.push("caption");
    if (!r.hashtags.length) r.missing.push("hashtags");

    const parts = [];
    if (r.headline) parts.push([r.confidence.headline, 0.5]);
    if (r.caption) parts.push([r.confidence.caption, 0.35]);
    if (r.hashtags.length) parts.push([r.confidence.hashtags, 0.15]);
    const wsum = parts.reduce((a, p) => a + p[1], 0);
    r.confidence.overall = wsum ? parts.reduce((a, p) => a + p[0] * p[1], 0) / wsum : 0;
    // A story with body text but no caption found is incomplete, not uncertain;
    // quality (used to pick a strategy) says so.
    r.quality = r.confidence.overall * (0.6 + (r.headline ? 0.2 : 0) + ((r.caption || !hasBody) ? 0.2 : 0));
    r.ok = !!(r.headline || r.caption || r.hashtags.length);
    Object.keys(r.confidence).forEach(k => { r.confidence[k] = round2(clamp01(r.confidence[k])); });
    r.needsConfirm = !!r.headline && (r.confidence.headline < CONFIRM_AT
      || (r.strategy !== "labels" && r.candidates.length > 1 && r.candidates[0].score - r.candidates[1].score < 0.6));
    return r;
  }

  /* ---------- stage 6: strategies ---------- */

  const avoided = (text, opts) => (opts.avoid || []).some(a => a && norm(a) === norm(text));

  function strategyLabels(lines, opts) {
    const { sections, pre } = labelSections(lines);
    const real = sections.filter(s => FIELDS_SHOWN.includes(s.field) || s.field === "alt" || s.field === "capx");
    if (!real.some(s => FIELDS_SHOWN.includes(s.field))) return null;
    const r = baseResult("labels");
    const pick = (field) => {
      const all = sections.filter(s => s.field === field);
      const strong = all.filter(s => !s.weak);
      return strong.length ? strong : all;
    };
    const tags = [];
    let hasBody = false;

    // Headline: the first labelled one you didn't reject. Others are offered.
    const heads = pick("headline");
    const headTexts = [];
    let tail = [], headOptions = false;
    heads.forEach(s => {
      const ps = paragraphs(s.lines).filter(p => p.some(l => !l.noise && !l.meta));
      if (!ps.length) return;
      let first = ps[0].filter(l => !l.meta && !l.noise);
      // "Headline options:" with "Option 1: …" lines: each is a choice.
      const opts1 = first.filter(l => (l.option || l.optionLoose) && (l.option || l.optionLoose).note);
      if (opts1.length >= 2 && opts1.length === first.length) {
        opts1.forEach(l => headTexts.push((l.option || l.optionLoose).note));
        headOptions = true;
        if (headTexts.length === opts1.length) tail = tail.concat(ps.slice(1));
        return;
      }
      // "Headline: X" and then the story with no Caption label: the story
      // goes on from the first line that reads as body text.
      let bodyAt = first.findIndex((l, k) => k > 0 && (lenOf(l.text) > 150 || sentenceCount(l.text) >= 2));
      if (bodyAt > 0) { tail.push(first.slice(bodyAt)); first = first.slice(0, bodyAt); }
      headTexts.push(joinLines(first));
      if (headTexts.length === 1) tail = tail.concat(ps.slice(1));
    });
    pick("alt").forEach(s => s.lines.forEach(l => {
      const o = l.option || l.optionLoose;
      if (l.text && !l.label) headTexts.push(o && o.note ? o.note : l.text.replace(/^\s*(?:[-*•·+]|\d{1,2}[.)])\s+/, ""));
    }));
    const usable = headTexts.filter(t => t && !avoided(t, opts));
    if (usable.length) {
      r.headline = usable[0];
      if (heads.length && usable[0] === headTexts[0]) r.labels.headline = heads[0].name;
      r.confidence.headline = heads.length ? 0.96 : 0.75;
      r.reasons.push(heads.length ? "labelled “" + (heads[0].name || "headline") + "”" : "listed as a headline option");
      if (usable.length > 1) {
        r.warnings.push(usable.length + " headlines offered — using the first, the others are below");
        r.confidence.headline = Math.min(r.confidence.headline, headOptions ? 0.6 : 0.9);
      }
      r.candidates = usable.map((t, i) => ({ text: t, score: 10 - i, confidence: i ? 0.5 : r.confidence.headline, why: [i ? "another labelled headline" : "labelled"] }));
    } else if (headTexts.length && opts.avoid && opts.avoid.length) {
      return null;            // the only labelled headline was rejected
    }

    // Caption: the first labelled caption ("Long caption:" before "Short
    // caption:"), plus a call-to-action section, or the story left under the
    // headline. A caption that a later label closes is kept whole, word for
    // word; only the very end of the reply loses the assistant's offers.
    const caps = pick("caption");
    const capSec = caps[0] || null;
    if (caps.length > 1) r.warnings.push(caps.length + " captions given \u2014 using the first (\u201c" + capSec.name + "\u201d)");
    const capx = pick("capx");
    let capParas = capSec ? paragraphs(capSec.lines) : [];
    let capFrom = capSec ? "label" : "";
    if (!capSec && tail.length) { capParas = tail; capFrom = "under"; }
    else if (tail.length) r.warnings.push("Text between the headline and the caption was left out");
    capx.forEach(s => { capParas = capParas.concat(paragraphs(s.lines)); });
    const lastField = sections.filter(s => s.field !== "drop").slice(-1)[0];
    const group = (capSec ? [capSec] : []).concat(capx);
    const closed = capFrom === "label" && group.every(s => s !== lastField);
    capParas = finishCaption(capParas, tags, r.warnings, closed ? "keep" : "offers");
    r.caption = joinParas(capParas);
    if (r.caption) {
      hasBody = true;
      r.confidence.caption = capFrom === "label" ? 0.95 : 0.8;
      if (capFrom === "label") r.labels.caption = capSec.name;
      tags.push(...inlineTags(r.caption));
    }

    // No headline label, but "Option 1: …", "Option 2: …" above the caption:
    // headline choices. You pick one.
    const preOpts = !r.headline ? pre.filter(l => (l.option || l.optionLoose) && (l.option || l.optionLoose).note && !avoided((l.option || l.optionLoose).note, opts)) : [];
    if (preOpts.length >= 2) {
      const texts = preOpts.map(l => (l.option || l.optionLoose).note);
      r.headline = texts[0];
      r.confidence.headline = 0.6;
      r.reasons.push("the first of " + texts.length + " headline options");
      r.warnings.push(texts.length + " headline options above the caption — pick one");
      r.candidates = texts.map((t, i) => ({ text: t, score: 10 - i, confidence: i ? 0.5 : 0.6, why: ["headline option " + (i + 1)] }));
    }
    // No headline label, but a headline-like line before the first label.
    if (!r.headline) {
      const pps = paragraphs(pre).filter(p => p.some(l => !l.chatter && !l.noise && !l.meta && !l.tagOnly && !l.option && !l.optionLoose));
      for (let k = pps.length - 1; k >= 0; k--) {
        const ls = pps[k].filter(l => !l.chatter && !l.noise && !l.meta && !l.tagOnly && !l.option && !l.optionLoose);
        const text = joinLines(ls);
        const sc = headlineScore(text, { alone: ls.length === 1, followedByBody: !!r.caption, heading: ls.some(l => l.heading), bold: ls.some(l => l.bold) });
        if (sc.s >= 4 && !avoided(text, opts)) {
          r.headline = text;
          r.confidence.headline = clamp01(0.55 + sc.s * 0.04);
          r.reasons.push("the line above the labelled caption");
          r.candidates = [{ text, score: sc.s, confidence: r.confidence.headline, why: sc.why }];
          break;
        }
      }
    }

    // Hashtags: a labelled list, then any tag lines anywhere else.
    const tagSecs = sections.filter(s => s.field === "tags");
    let fromSection = false;
    tagSecs.forEach(s => {
      const found = [];
      s.lines.forEach(l => { found.push(...(l.text.match(TAG_LOOSE) || [])); });
      if (!found.length) {
        // "Hashtags: travel, flights, tsa" — the label says these are hashtags.
        const words = s.lines.filter(l => l.text && !l.chatter).map(l => l.text).join(" ")
          .split(/[,\s]+/).filter(w => /^[\p{L}\p{M}\p{N}_]{2,30}$/u.test(w));
        if (words.length && words.length <= 30) { found.push(...words.map(w => "#" + w)); r.warnings.push("Added # to the hashtag words"); }
      }
      if (found.length) fromSection = true;
      tags.push(...found);
    });
    lines.forEach(l => { if (l.tagOnly && !tags.some(t => l.text.includes(t))) tags.push(...(l.text.match(TAG_LOOSE) || [])); });
    r.hashtags = tags;
    r.confidence.hashtags = tags.length ? (fromSection ? 0.97 : 0.9) : 0;
    if (!r.headline && !r.caption && !tags.length) return null;
    return validate(r, hasBody || lines.some(l => !l.blank && isBody([l]) && !l.label));
  }

  // Lines that carry content once labels, chat and interface text are set aside.
  // A note on its own line ("Sources:") drops what follows up to the next blank
  // line or label; everyday note words ("Photo:", "Tip:") are just text here.
  function contentParas(lines) {
    const out = [];
    let skip = false;
    let prevBlank = true;
    // "- Option 1: …" lines listing headline choices aren't the post.
    const optionRun = lines.filter(l => (l.option || l.optionLoose) && (l.option || l.optionLoose).note).length >= 2;
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      const lab = l.label;
      const startsPara = prevBlank;
      prevBlank = !!l.blank;
      // The assistant's notes ("Notes:", "Angle: …") starting a paragraph go,
      // like a source list; "Tip:" and "Photo:" in a post stay.
      const hardDrop = !!(lab && lab.field === "drop" && (!lab.soft || (lab.meta && startsPara && assistantNote(lab, lines, k))));
      if (hardDrop && !lab.standalone && lab.soft) { skip = true; continue; }
      if (hardDrop && lab.standalone) { skip = true; continue; }
      if (skip && lab && !hardDrop) skip = false;
      if (skip && l.blank) { skip = false; out.push(makeLine("", null)); continue; }
      if (skip) continue;
      if (l.blank || l.sep) { out.push(makeLine("", null)); continue; }
      if (l.noise || l.meta || l.option || hardDrop || (optionRun && l.optionLoose && l.optionLoose.note)) continue;
      if (lab && lab.field !== "drop") {
        if (lab.rest) out.push(Object.assign({}, l, { text: lab.rest, label: null, wasLabel: lab.field }));
        continue;
      }
      out.push(lab ? Object.assign({}, l, { label: null }) : l);
    }
    return paragraphs(out);
  }

  // Headline candidates in unlabelled text: a whole short paragraph (a
  // headline may run over two or three lines), or the first line of a
  // paragraph whose other lines are the story.
  function candidatesFrom(paras, mode) {
    const cands = [];
    const body = paras.map(p => p.every(l => !l.chatter && !l.tagOnly) && isBody(p));
    const firstContent = paras.findIndex(p => p.some(l => !l.chatter && !l.tagOnly));
    const contentN = paras.filter(p => p.some(l => !l.chatter && !l.tagOnly)).length;
    paras.forEach((p, pi) => {
      const ls = p.filter(l => !l.chatter && !l.tagOnly);
      if (!ls.length) return;
      const after = body.some((b, k) => b && k > pi);
      const before = body.some((b, k) => b && k < pi);
      const whole = joinLines(ls);
      const short = ls.length <= 4 && lenOf(flat(whole)) <= 240 && ls.every(l => lenOf(l.text) <= 120);
      const mk = (lsPart, restLines) => ({
        text: joinLines(lsPart), para: pi, lines: lsPart, rest: restLines,
        heading: lsPart.some(l => l.heading), bold: lsPart.every(l => l.bold),
        first: pi === firstContent, followedByBody: after || (restLines.length > 0 && isBody(restLines)),
        precededByBody: before, alone: lsPart.length === 1 && !restLines.length,
        only: contentN === 1 && !restLines.length
      });
      if (short && !(ls.length > 1 && isBody(ls.slice(1)) && sentenceCount(joinLines(ls.slice(1))) >= 2)) cands.push(mk(ls, []));
      if (ls.length >= 2) {
        // The first line, or the first two or three short lines, with the
        // story going on below. Every cut competes; the scoring decides.
        for (let k = 1; k <= Math.min(3, ls.length - 1); k++) {
          if (k > 1 && (lenOf(ls[k - 1].text) > 90 || endsSentence(ls[k - 2].text))) break;
          const restLs = ls.slice(k);
          if (!(isBody(restLs) || !short)) continue;
          const c = mk(ls.slice(0, k), restLs);
          if (!cands.some(x => x.para === pi && x.text === c.text)) cands.push(c);
        }
      }
    });
    if (mode === "structure") return cands.filter(c => c.heading || c.bold);
    if (mode === "layout") return cands.filter(c => c.first);
    return cands;
  }

  function strategyScored(lines, opts, mode) {
    const paras = contentParas(lines);
    if (!paras.length) return null;
    const r = baseResult(mode);
    const tags = [];
    lines.forEach(l => { if (l.tagOnly) tags.push(...(l.text.match(TAG_LOOSE) || [])); });

    // Every block competes, whichever strategy is choosing: the margin over the
    // best other block is what makes a pick confident.
    const pool = candidatesFrom(paras, "semantic").map(c => {
      const h = headlineScore(c.text, c);
      return Object.assign(c, { score: h.s, why: h.why });
    }).filter(c => !avoided(c.text, opts)).sort((a, b) => b.score - a.score);
    const scored = mode === "structure" ? pool.filter(c => c.heading || c.bold)
      : mode === "layout" ? pool.filter(c => c.first) : pool;
    if (mode !== "semantic" && !scored.length) return null;

    const best = scored[0];
    // The runner-up is a different block, not a shorter cut of the same one.
    const second = best && pool.find(c => c !== best && c.para !== best.para);
    const need = mode === "semantic" ? 4.2 : 4.6;
    const hasBody = paras.some(p => isBody(p.filter(l => !l.chatter && !l.tagOnly)));
    let used = null;
    if (best && best.score >= need) {
      used = best;
      r.headline = best.text;
      const margin = second ? best.score - second.score : 3;
      const base = sigmoid((best.score - 5) / 1.6);
      r.confidence.headline = base * (0.6 + 0.4 * Math.min(1, Math.max(0, margin) / 2.5));
      if (mode === "structure") r.confidence.headline = Math.min(0.92, r.confidence.headline + 0.05);
      doubtPrefix(r, best.text, lines);
      r.reasons = best.why.slice(0, 4);
      r.headlineFrom = best.heading ? "heading" : best.bold ? "bold" : "text";
      r.candidates = [best].concat(pool.filter(c => c !== best)).slice(0, 4).map(c => ({ text: c.text, score: round2(c.score),
        confidence: round2(sigmoid((c.score - 5) / 1.6)), why: c.why.slice(0, 3) }));
    } else if (mode !== "semantic") {
      return null;
    }

    // Caption: the body text after the headline (or before it, if the
    // headline came last), never the headline itself or chat around it.
    let capParas = [];
    if (used) {
      if (used.rest.length) capParas.push(used.rest);
      paras.forEach((p, k) => { if (k > used.para) capParas.push(p); });
      if (!capParas.some(p => isBody(p))) {
        capParas = [];
        paras.forEach((p, k) => { if (k < used.para && isBody(p.filter(l => !l.chatter))) capParas.push(p); });
      }
    } else {
      capParas = paras.slice();
    }
    // Under a headline the story is kept as written, less the assistant's
    // follow-up offers; with no headline, chat before and after it goes too.
    capParas = finishCaption(capParas, tags, r.warnings, used ? "offers" : "nohead");
    // Body text only: a stray short line after the story isn't a caption.
    const capText = joinParas(capParas);
    if (capText && (capParas.some(p => isBody(p)) || (!used && lenOf(capText) >= 40))) {
      r.caption = capText;
      const strong = capParas.filter(p => isBody(p)).length;
      r.confidence.caption = clamp01(0.62 + 0.1 * Math.min(3, strong) + (used ? 0.03 : -0.05));
      tags.push(...inlineTags(r.caption));
    }
    r.hashtags = tags;
    r.confidence.hashtags = tags.length ? 0.9 : 0;
    if (!r.headline && !r.caption && !tags.length) return null;
    return validate(r, hasBody);
  }

  // "Titular: …", "ចំណងជើង: …": an opening word and colon it doesn't know may
  // be a label in another language, so it asks rather than trusting it. A
  // news kicker ("BREAKING:") or an attribution ("Police:") is fine, unless
  // another line opens the same way (a label pair) or the word isn't written
  // in Latin letters.
  function doubtPrefix(r, text, lines) {
    const m = flat(text).match(PREFIX_RE);
    if (!m) return;
    const w = m[1].trim();
    if (KICKER_RE.test(w) || /\s/.test(w)) return;
    // The first line after the headline opens the same way: "Pamagat: …" over
    // "Nilalaman: …" is a pair of labels it doesn't know.
    const own = norm(text);
    const at = (lines || []).findIndex(l => l.text && own.includes(norm(l.text)));
    const next = at >= 0 ? (lines || []).slice(at + 1).find(l => !l.blank && l.text && !own.includes(norm(l.text))) : null;
    const p = next && !next.label && next.text.match(PREFIX_RE);
    if (!p || KICKER_RE.test(p[1].trim()) || /\s/.test(p[1].trim())) return;
    r.confidence.headline = Math.min(r.confidence.headline, 0.6);
    r.warnings.push("The headline starts with \u201c" + w + ":\u201d \u2014 check it isn't a label");
  }

  // One short block and nothing else: that's the headline, as in 3.4
  // ("paste just the headline"). Two sentences or more, and it asks first.
  function strategySingle(lines, opts) {
    const content = lines.filter(l => !l.blank && !l.sep && !l.noise && !l.meta);
    if (!content.length || content.some(l => l.label || l.tagOnly || l.option)) return null;
    const first = content[0].i, last = content[content.length - 1].i;
    if (lines.slice(first, last + 1).some(l => l.blank)) return null;
    // Chat to you ("Sure, happy to help!", "Here's your post:", "Let me know
    // if you want changes") isn't a headline; "Yes, this is real: a cat…",
    // "Here's why airlines…" and "Do you want to live to 100? …" can be.
    const chatty = (l) => {
      const b = l.text.replace(/^[^\p{L}]+/u, "");
      // "Happy to help: teen fixes neighbor's car" — a headline after the opener.
      if (/^[^:：]{1,40}[:：]\s*\S/.test(b) && wordsOf(b.replace(/^[^:：]*[:：]/, "")).length >= 4) return false;
      if (ASSIST_RE.test(b)) return true;
      if ((OFFER_RE.test(b) || OUTRO_RE.test(b)) && /\b(?:help|post|caption|headline|version|draft|write|rewrite|create|tweak|changes?|edits?)\b/i.test(b)) return true;
      return INTRO_RE.test(b) && (/:\s*$/.test(b) || (lenOf(b) < 40 && /[!.]\s*$/.test(b)) || (/\?\s*$/.test(b) && /\byou(?:r)?\b/i.test(b))
        || /^(?:here(?:'s|’s| is| are) (?:your|my)\b|i(?:'ve|’ve| have) (?:written|created|made|drafted))/i.test(b));
    };
    if (content.every(chatty)) return null;
    let text = joinLines(content);
    const lead = text.match(/^(?:here(?:'s|’s| is| are)|this is|try|how about|suggested|new|final|revised|updated)\b[^:：\n]{0,40}\b(?:headline|title|hook|version|option|pick|suggestion)s?\s*[:：]\s*/i);
    if (lead) text = text.slice(lead[0].length).replace(/^["“]([\s\S]*)["”]$/, "$1").trim();
    if (!text || lenOf(flat(text)) > 320 || (text.match(TAG_RE) || []).length || avoided(text, opts)) return null;
    // Three sentences, or two long ones, read as a caption rather than a headline.
    const sc = sentenceCount(text);
    if (sc >= 3 || (sc === 2 && lenOf(flat(text)) > 120)) return null;
    const r = baseResult("single");
    r.headline = text;
    r.confidence.headline = sentenceCount(text) <= 1 && content.length <= 3 ? 0.8 : 0.6;
    doubtPrefix(r, text, lines);
    r.reasons = ["the only text given"];
    r.candidates = [{ text, score: 5, confidence: r.confidence.headline, why: ["the only text given"] }];
    return validate(r, false);
  }

  const STRATEGIES = {
    labels: strategyLabels,
    structure: (lines, opts) => strategyScored(lines, opts, "structure"),
    layout: (lines, opts) => strategyScored(lines, opts, "layout"),
    semantic: (lines, opts) => strategyScored(lines, opts, "semantic"),
    single: strategySingle
  };
  const ORDER = ["labels", "structure", "layout", "semantic"];
  const STRATEGY_NAMES = { labels: "Labels", structure: "Structure", layout: "Layout", semantic: "Meaning", single: "Only text" };

  // Hashtags in the order they appear in the post, whichever part they came from.
  function orderTags(r, lines) {
    if (!r.hashtags || r.hashtags.length < 2) return;
    const src = lines.map(l => l.raw).join("\n").toLowerCase();
    const at = (t) => {
      const re = new RegExp(t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}_])", "u");
      const m = re.exec(src);
      return m ? m.index : Infinity;
    };
    r.hashtags = r.hashtags.map((t, i) => ({ t, i, a: at(t) })).sort((x, y) => (x.a - y.a) || (x.i - y.i)).map(x => x.t);
  }

  function analyzeLines(lines, opts) {
    const tried = [];
    let best = null;
    const order = ORDER.filter(s => !(opts.exclude || []).includes(s));
    for (const s of order) {
      let r = null;
      try { r = STRATEGIES[s](lines, opts); } catch (e) { r = null; }
      if (!r || !r.ok) { tried.push({ strategy: s, ok: false }); continue; }
      orderTags(r, lines);
      tried.push({ strategy: s, ok: true, quality: round2(r.quality) });
      if (!best || r.quality > best.quality + 0.02) best = r;
      // Good enough: stop here rather than second-guessing labels.
      if (r.quality >= 0.82 && !r.needsConfirm) break;
    }
    // No headline from any of them: one short block on its own is the headline.
    if ((!best || !best.headline) && !(opts.exclude || []).includes("single")) {
      const s = strategySingle(lines, opts);
      tried.push({ strategy: "single", ok: !!s });
      if (s) best = s;
    }
    if (!best) {
      best = baseResult("none");
      validate(best, false);
    }
    best.tried = tried;
    return best;
  }

  /* ---------- stage 7: output ---------- */

  // The main entry point. input: a string, or { text } or { blocks }.
  // opts: { optionIndex, exclude: [strategy], avoid: [headline text] }
  function analyze(input, opts) {
    opts = opts || {};
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const lines = collect(input);
    let r, options = null, optionIndex = 0;

    // Numbered options, when there are two or more real ones and nothing
    // labelled sits above the first (otherwise the markers are just text).
    // Options that each carry their own Headline or Caption label always
    // count, whatever sits above them; looser headers ("- Option 1:", a
    // long note) only count then.
    const firstMark = lines.findIndex(l => l.option || l.optionLoose);
    const labelledAbove = firstMark > 0 && lines.slice(0, firstMark).some(l => l.label && FIELDS_SHOWN.includes(l.label.field));
    const above = firstMark > 0 ? lines.slice(0, firstMark) : [];
    const fullAbove = above.some(l => l.label && l.label.field === "headline") && above.some(l => l.label && l.label.field === "caption");
    let opt = splitOptionLines(lines);
    const own = (o) => !!o && o.every(x => x.lines.some(l => l.label && (l.label.field === "headline" || l.label.field === "caption")));
    // Looser headers that don't each start a labelled option ("Option 1 is
    // better for Facebook.") aren't headers: try again with the strict ones.
    if (opt && !own(opt) && opt.some(o => o.loose)) opt = splitOptionLines(lines.map(l => l.optionLoose ? Object.assign({}, l, { optionLoose: null }) : l));
    const ownLabels = own(opt);
    if (opt && !fullAbove && (ownLabels || (!labelledAbove && !opt.some(o => o.loose)))) {
      const results = opt.map(o => ({ o, r: analyzeLines(o.lines, opts) })).filter(x => x.r.ok && (x.r.headline || x.r.caption));
      if (results.length > 1) {
        optionIndex = Math.min(Math.max(opts.optionIndex || 0, 0), results.length - 1);
        r = results[optionIndex].r;
        options = results.map(x => ({ label: x.o.label, rating: x.o.rating, headline: x.r.headline,
          confidence: x.r.confidence.overall, strategy: x.r.strategy }));
        r.optionResults = results.map(x => x.r);
      }
    }
    if (!r) r = analyzeLines(lines, opts);
    r.options = options;
    r.optionIndex = optionIndex;
    r.strategyName = STRATEGY_NAMES[r.strategy] || "None";
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    r.ms = round2(t1 - t0);
    r.engine = VERSION;
    delete r.quality;
    return r;
  }

  function fieldsOf(r) {
    return { headline: r.headline || "", caption: r.caption || "", hashtags: (r.hashtags || []).slice() };
  }

  // The labelled block the panel's paste box and the chat hand-off use.
  function formatBlock(r, opts) {
    const one = (x) => {
      const parts = [];
      if (x.headline) parts.push("Headline:\n" + x.headline);
      if (x.caption) parts.push("Caption:\n" + x.caption);
      const tags = Array.isArray(x.hashtags) ? x.hashtags : [];
      if (tags.length) parts.push("Hashtags:\n" + tags.join(" "));
      return parts.join("\n\n");
    };
    if (opts && opts.allOptions && r.options && r.optionResults) {
      return r.optionResults.map((x, i) => "OPTION " + String(r.options[i].label).replace(/^option\s*/i, "")
        + (r.options[i].rating ? " (Rated " + r.options[i].rating + ")" : "") + "\n" + one(x)).join("\n\n");
    }
    return one(r);
  }

  // Clean, organised text for the clipboard. Hashtags already written inside
  // the caption aren't repeated underneath.
  function copyText(r, which) {
    const want = which || ["headline", "caption", "hashtags"];
    const parts = [];
    if (want.includes("headline") && r.headline) parts.push(r.headline);
    if (want.includes("caption") && r.caption) parts.push(r.caption);
    if (want.includes("hashtags") && r.hashtags && r.hashtags.length) {
      const inCap = want.includes("caption") ? new Set(inlineTags(r.caption).map(t => t.toLowerCase())) : new Set();
      const rest = r.hashtags.filter(t => !inCap.has(t.toLowerCase()));
      if (rest.length) parts.push(rest.join(" "));
    }
    return parts.join("\n\n");
  }

  // A headline and a caption both labelled with the words 3.4 used.
  function labelledPair(r) {
    return r.strategy === "labels" && !!r.labels && CHAT_HEAD.has(r.labels.headline) && CHAT_CAP.has(r.labels.caption);
  }

  // Is this a finished story worth sending from a chat page?
  //   "labels"  Automation sends it by itself: headline and caption labelled
  //             with 3.4's words, and a headline that reads like one
  //   "strict"  a card is offered unasked: that, or an unlabelled post with a
  //             heading or bold headline, the story under it and hashtags
  //   "loose"   you clicked the toolbar icon: anything with both parts
  // CAPS or Title Case: how news headlines are written. A bold first line in
  // sentence case is more often a tweet or LinkedIn draft. Scripts without
  // capitals (Khmer, Thai, Hindi…) can't show it, so they pass.
  const unquote = (s) => String(s).replace(/["“][^"”]*["”]|‘[^’]*’|(^|[\s:(])'.+?'(?=[\s:,.!?)]|$)/g, "$1 ");
  // A launch or an announcement in the writer's own voice: "We're hiring",
  // "Excited to share…", "Taskly 2.0 is finally live!".
  const PROMO_RE = /^(?:we|we're|we’re|we've|we’ve|i'm|i’m|i've|i’ve|i)\b|\b(?:our|my) (?:new|latest|first|team|company|app|product|startup|launch|journey|business|brand)\b|\b(?:excited|thrilled|proud) to\b|\b(?:announcing|personal news|join (?:us|me)|we're hiring|now hiring|link in bio|check it out|(?:finally|now|is) live|launch(?:ed|ing)? (?:our|my)|shipped)\b/i;
  const FIRST_PERSON_RE = /^(?:we|we're|we’re|we've|we’ve|our)\b|^i(?:'m|’m| am) (?:excited|thrilled|happy|proud|delighted|honou?red)\b|^i(?:'ve|’ve| have) (?:joined|been|started|launched|built)\b|^i just\b/i;

  function newsy(h) {
    const cased = h.match(/[\p{Lu}\p{Ll}]/gu) || [];
    if (cased.length < (h.match(/\p{L}/gu) || []).length * 0.5) return true;   // mostly Khmer, Thai…
    if ((h.match(/\p{Lu}/gu) || []).length / cased.length >= 0.6) return true;
    const words = h.split(/\s+/).filter(w => /^[\p{Lu}\p{Ll}]{4,}/u.test(w));
    if (words.length >= 3 && words.filter(w => /^\p{Lu}/u.test(w)).length / words.length >= 0.6) return true;
    // Or a news verb in it ("Pilot fired after…"), or a kicker ("BREAKING: …").
    const pm = h.match(PREFIX_RE);
    return (!!pm && KICKER_RE.test(pm[1].trim())) || wordsOf(h).some(w => TRIGGER_SET.has(w.toLowerCase()) && !/^(?:viral|homeless|bankrupt)$/i.test(w));
  }

  function isStory(r, mode) {
    if (!r || !r.headline || !r.caption) return false;
    if (/\t/.test(r.headline)) return false;                       // a table row
    // A critique ("Strong hook, but it's 112 characters. Try cutting…") isn't
    // a story; a headline of three short sentences can be.
    const sane = !critique(r.headline, true) && !critique(String(r.caption).slice(0, 400)) && lenOf(flat(r.headline)) <= 300;
    if (labelledPair(r) && sane) return true;
    if (mode === "labels") return false;
    if (mode === "loose") return r.confidence.overall >= 0.5;
    // Unasked, an unlabelled post needs a headline that looks like one: a
    // heading, or a bold or first line written in CAPS or Title Case or with
    // news in its words. A launch post or a "some personal news" draft, in
    // the first person, isn't one.
    const promo = PROMO_RE.test(unquote(flat(r.headline))) || FIRST_PERSON_RE.test(flat(r.caption).replace(/^[^\p{L}"“]+/u, ""));
    const shaped = !promo && (r.strategy === "structure" ? r.headlineFrom !== "bold" || newsy(flat(r.headline))
      : r.strategy === "layout" && newsy(flat(r.headline)));
    return shaped && sane && r.hashtags.length >= 2 && r.confidence.headline >= 0.75
      && r.confidence.caption >= 0.7 && !r.needsConfirm;
  }

  // A cheap look for chat pages: does any line carry a headline label and
  // another a caption label (in any of the words and languages above)?
  function hasLabels(text) {
    let head = false, cap = false;
    const ls = String(text || "").split("\n");
    for (let k = 0; k < ls.length && !(head && cap); k++) {
      const t = ls[k].trim();
      if (!t || t.length > 600 || !/\p{L}/u.test(t)) continue;
      const lab = parseLabel(stripEmphasis(t.replace(/^\s{0,3}#{1,6}\s+/, "")));
      if (!lab) continue;
      if (lab.field === "headline") head = true;
      else if (lab.field === "caption" || lab.field === "capx") cap = true;
    }
    return head && cap;
  }

  // Options in a paste ("OPTION 1 (Rated 9/10)"), for the option picker.
  function splitOptions(text) {
    const lines = collect(text);
    const o = splitOptionLines(lines);
    if (!o) return null;
    return o.map(x => ({ label: x.label, rating: x.rating, text: x.lines.map(l => l.raw).join("\n") }));
  }

  /* ---------- reading a page's structure (browser only) ---------- */

  const BLOCK_TAGS = /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DD|DT|FIGCAPTION|TD|TH)$/;
  const INNER_SKIP = 'button,[role="button"],svg,[aria-hidden="true"],[hidden],style,script';

  // Blocks of a reply or a page section, with what makes them stand out:
  // heading level, whole-block bold. Buttons, menus and hidden text are skipped.
  function collectBlocks(rootEl, opts) {
    const out = [];
    if (!rootEl || typeof document === "undefined") return out;
    const skip = 'button,[role="button"],nav,header,footer,aside,menu,[role="menu"],[role="navigation"],[aria-hidden="true"],script,style,noscript,svg,form,[contenteditable="true"],textarea,input'
      + (opts && opts.skip ? "," + opts.skip : "");
    const seen = new Set();
    const walk = (el) => {
      if (!el || el.nodeType !== 1) return;
      if (el !== rootEl && el.matches && el.matches(skip)) return;
      const tag = el.tagName;
      const isBlock = BLOCK_TAGS.test(tag);
      const hasBlockKids = [...el.children].some(c => BLOCK_TAGS.test(c.tagName) || /^(DIV|UL|OL|SECTION|ARTICLE|TABLE|TBODY|TR|DL)$/.test(c.tagName));
      if ((isBlock && !(tag === "LI" && hasBlockKids)) || (tag === "DIV" && !hasBlockKids && (el.textContent || "").trim())) {
        // Text you can't see (a collapsed draft, display:none) isn't read.
        if (el.getClientRects && !el.getClientRects().length && getComputedStyle(el).display !== "contents") return;
        if (el.closest && el.closest("details:not([open])") && !el.closest("summary")) return;
        if (getComputedStyle(el).visibility === "hidden") return;
        let text;
        // A code block: just the code, not the language label above it.
        const code = tag === "PRE" && el.querySelector("code");
        if (code) text = code.innerText || code.textContent || "";
        else if (el.querySelector(INNER_SKIP)) {
          // Leave out button labels inside the block ("Copy", "Edit").
          const c = el.cloneNode(true);
          c.querySelectorAll(INNER_SKIP).forEach(n => n.remove());
          c.querySelectorAll("br").forEach(n => n.replaceWith("\n"));
          c.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,dt,dd").forEach(n => n.after("\n"));
          text = c.textContent || "";
        } else text = el.innerText || el.textContent || "";
        text = text.replace(/\n{3,}/g, "\n\n").trim();
        if (!text || seen.has(el)) return;
        seen.add(el);
        const strong = [...el.querySelectorAll("strong,b")].map(b => (b.textContent || "").trim()).join(" ");
        const bold = strong.length >= Math.max(4, text.replace(/\s+/g, " ").length * 0.85);
        out.push({ text: tag === "LI" ? "- " + text : text, tag: tag.toLowerCase(), bold });
        return;
      }
      [...el.children].forEach(walk);
    };
    walk(rootEl);
    return out;
  }

  /* ---------- picking phrases to colour in a headline ---------- */

  const FUNCTION_WORDS = new Set(`a an the and or but of to in on at for with from by as
    is was were are be been being am has have had it its he she they them his her their
    that which who whom whose this these those than so if when while after before about
    not no nor yet then will would shall can could may might must do does did what where
    how there here we you my your our`.trim().split(/\s+/));
  const CLAUSE_WORDS = new Set(`and but as when while after before that which who where
    because if until though although then yet however instead despite since whose
    she he they it we`.trim().split(/\s+/));
  const PIVOTS = new Set(`but yet however instead despite though although until then only
    now suddenly finally still even after before because since`.trim().split(/\s+/));
  const STRENGTH = {
    light:  { cover: 0.30, min: 2, max: 3 },
    medium: { cover: 0.45, min: 3, max: 5 },
    heavy:  { cover: 0.62, min: 4, max: 8 }
  };
  const DANGLERS = new Set(`into onto of to in on at for with from by as than
    the a an and or but`.trim().split(/\s+/));
  const MAX_SPAN = 6;

  const coreWord = (w) => String(w).replace(/^[^\p{L}\p{N}*£]+|[^\p{L}\p{N}*£]+$/gu, "").toLowerCase();

  // words: the headline's words in order, punctuation attached ("BROKE", "IN,").
  // Returns [start, end] word spans to colour. Quotes are always coloured whole;
  // numbers stay with what they count; spans never cross a clause join or end
  // on a word that leaves the phrase hanging.
  function pickSpans(words, strength) {
    const N = words.length;
    if (!N) return [];
    const core = words.map(coreWord);
    const plain = words.join(" ");
    const allCaps = plain === plain.toUpperCase();

    const atoms = [], quoteAtoms = [];
    let open = -1;
    words.forEach((t, k) => {
      const hasOpen = /^["“]/.test(t);
      const hasClose = /["”]/.test(t.slice(hasOpen ? 1 : 0));
      if (open === -1 && hasOpen) { open = k; if (hasClose && k > open) { quoteAtoms.push([open, k]); open = -1; } return; }
      if (open !== -1 && /["”]/.test(t)) { quoteAtoms.push([open, k]); open = -1; }
    });
    if (open !== -1) quoteAtoms.push([open, N - 1]);
    quoteAtoms.forEach(q => atoms.push(q));

    const isNum = (c) => /[\d$£€%]/.test(c);
    for (let k = 0; k < N; k++) {
      if (!isNum(core[k])) continue;
      let end = k;
      if (k + 1 < N && core[k + 1] && !FUNCTION_WORDS.has(core[k + 1]) && !CLAUSE_WORDS.has(core[k + 1])) end = k + 1;
      if (end > k) atoms.push([k, end]);
    }
    const atomOf = new Array(N).fill(-1);
    atoms.forEach((a, i) => { for (let k = a[0]; k <= a[1]; k++) if (atomOf[k] === -1) atomOf[k] = i; });
    const edgeOk = (k, isStart) => {
      const a = atomOf[k];
      if (a === -1) return true;
      return isStart ? atoms[a][0] === k : atoms[a][1] === k;
    };

    const inQuote = new Set();
    quoteAtoms.forEach(([a, b]) => { for (let k = a; k <= b; k++) inQuote.add(k); });
    const afterPivot = new Set();
    let pivotAt = -1;
    words.forEach((t, k) => {
      if (!PIVOTS.has(core[k])) return;
      if (pivotAt === -1) pivotAt = k;
      for (let q = k + 1; q <= Math.min(k + 4, N - 1); q++) afterPivot.add(q);
    });

    const score = words.map((t, k) => {
      const c = core[k];
      if (!c || FUNCTION_WORDS.has(c)) return 0;
      let s = 2;
      if (isNum(c)) s += 5;
      if (TRIGGER_SET.has(c)) s += 4;
      if (ENTITIES.has(c)) s += 4;
      if (inQuote.has(k)) s += 5;
      if (afterPivot.has(k)) s += 2;
      if (c.length > 7) s += 1;
      if (k >= N - 3) s += 1;
      const bare = t.replace(/[^A-Za-z]/g, "");
      if (!allCaps && bare.length >= 2 && bare.length <= 5 && bare === bare.toUpperCase()) s += 3;
      else if (!allCaps && k > 0 && /^[A-Z]/.test(t)) s += 2;
      return s;
    });

    const breakAfter = new Set();
    words.forEach((t, k) => { if (/[,;:.!?—–]["”')\]]?$/.test(t)) breakAfter.add(k); });

    const cands = [];
    for (let a = 0; a < N; a++) {
      if (!score[a] || !edgeOk(a, true) || DANGLERS.has(core[a])) continue;
      for (let b = a; b < Math.min(a + MAX_SPAN, N); b++) {
        if (b > a && CLAUSE_WORDS.has(core[b])) break;
        if (score[b] && edgeOk(b, false) && !DANGLERS.has(core[b])) {
          let sum = 0;
          for (let k = a; k <= b; k++) sum += score[k];
          const len = b - a + 1;
          let s = sum / Math.pow(len, 0.45) - (len === 1 ? 1.5 : 0);
          if (afterPivot.has(a)) s += 2;
          if (b === N - 1) s += 1.5;
          cands.push({ a, b, s });
        }
        if (breakAfter.has(b)) break;
      }
    }
    cands.sort((x, y) => y.s - x.s);

    const cfg = STRENGTH[strength] || STRENGTH.medium;
    const used = new Array(N).fill(false);
    const usedWords = new Set();
    const taken = [];
    let covered = 0;
    const claim = (c) => {
      for (let k = c.a; k <= c.b; k++) { used[k] = true; if (core[k]) usedWords.add(core[k]); }
      covered += c.b - c.a + 1;
      taken.push(c);
    };
    const free = (c) => {
      for (let k = Math.max(0, c.a - 1); k <= Math.min(N - 1, c.b + 1); k++) if (used[k]) return false;
      return true;
    };
    quoteAtoms.forEach(([a, b]) => { if (free({ a, b })) claim({ a, b, s: 99 }); });
    const contentCount = score.filter(s => s > 0).length || N;
    while (taken.length < cfg.max) {
      if (taken.length >= cfg.min && covered / contentCount >= cfg.cover) break;
      let best = null, bestS = -Infinity;
      for (const c of cands) {
        if (!free(c)) continue;
        let s = c.s;
        let repeats = 0;
        for (let k = c.a; k <= c.b; k++) if (core[k] && usedWords.has(core[k])) repeats++;
        s -= repeats * 3;
        const mid = (c.a + c.b) / 2;
        for (const t of taken) if (Math.abs(mid - (t.a + t.b) / 2) / N < 0.18) s -= 2.5;
        if (s > bestS) { bestS = s; best = c; }
      }
      if (!best) break;
      claim(best);
    }
    if (pivotAt > -1 && !taken.some(t => t.a > pivotAt)) {
      const after = cands.filter(c => c.a > pivotAt && free(c)).sort((x, y) => y.s - x.s)[0];
      if (after) claim(after);
    }
    if (!taken.length && cands.length) claim(cands[0]);
    if (!taken.length) {
      let b = 0;
      score.forEach((s, k) => { if (s > score[b]) b = k; });
      claim({ a: b, b, s: 0 });
    }
    return taken.map(c => [c.a, c.b]).sort((x, y) => x[0] - y[0]);
  }

  /* ---------- which text on a design is the headline ---------- */

  // Words compared the way a person reads them; a censored "k*lled" still
  // matches "killed".
  const simWords = (s) => (norm(s).match(/[\p{L}\p{N}*£@$]+/gu) || []);
  function tokEq(x, y) {
    if (x === y) return true;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (x[i] !== y[i] && !/[*£@$]/.test(x[i]) && !/[*£@$]/.test(y[i])) return false;
    }
    return true;
  }
  function similarity(a, b) {
    const A = simWords(a), B = simWords(b);
    if (!A.length || !B.length) return 0;
    const used = new Array(B.length).fill(false);
    let hit = 0;
    A.forEach(x => {
      const j = B.findIndex((y, k) => !used[k] && tokEq(x, y));
      if (j >= 0) { used[j] = true; hit++; }
    });
    return (2 * hit) / (A.length + B.length);
  }

  // Ranks the text boxes on a design by how likely each is the headline.
  // cands: [{ text, fontSize, lines, colours, aboveHandle, offCenter, editing }]
  // ctx:   { want, last, profile: { fontRatio, aboveHandle, lines, n } }
  // Font size is one clue among several; matching words, sitting above the
  // @handle and the layout you confirmed before count for more.
  function rankHeadlines(cands, ctx) {
    ctx = ctx || {};
    const list = (cands || []).filter(c => c && c.text);
    const maxFont = Math.max(1, ...list.map(c => +c.fontSize || 0));
    const ranked = list.map((c, i) => {
      const text = flat(c.text);
      const len = lenOf(text);
      const why = [];
      let s = 0;
      const sim = ctx.want ? similarity(text, ctx.want) : 0;
      if (sim >= 0.92) { s += 7; why.push("matches your headline"); }
      else if (sim >= 0.6) { s += 4; why.push("mostly matches your headline"); }
      else if (sim >= 0.35) s += 1.5;
      const simLast = ctx.last ? similarity(text, ctx.last) : 0;
      if (simLast >= 0.8) { s += 3; why.push("holds your last headline"); }
      if (c.aboveHandle) { s += 2.5; why.push("sits just above your @handle"); }
      if ((c.colours || 0) >= 2) { s += 1.5; why.push("has coloured words"); }
      const fr = (+c.fontSize || 0) / maxFont;
      if (fr >= 0.9) { s += 1.5; why.push("largest text"); }
      else if (fr >= 0.65) s += 0.75;
      else if (fr < 0.4) s -= 1.5;
      if (len >= 15 && len <= 220) s += 1;
      else if (len < 12) s -= 3;
      else if (len > 320) { s -= 3; why.push("too long for a headline"); }
      if (sentenceCount(text) >= 3) s -= 1.5;
      if (/^@[\w.]+$/.test(text)) s -= 12;
      if (/^\d+\s*\/\s*\d+$/.test(text)) s -= 12;
      if (/https?:\/\/|www\./i.test(text)) s -= 6;
      if (c.editing) s += 0.5;
      // A box that holds other text boxes is the page or a group, not a headline.
      if (c.container) { s -= 4; why.push("holds other text boxes"); }
      const p = ctx.profile;
      if (p && p.n >= 1) {
        let m = 0;
        if (!!p.aboveHandle === !!c.aboveHandle) m += 1;
        if (Math.abs((p.fontRatio || 0) - fr) < 0.15) m += 1;
        if (p.lines && c.lines && Math.abs(p.lines - c.lines) <= 1) m += 0.3;
        if (m >= 2) why.push("matches the layout you confirmed before");
        s += m;
      }
      s -= (+c.offCenter || 0) * 1.5;
      return { i, cand: c, text, score: round2(s), why, sim: round2(sim) };
    }).sort((a, b) => b.score - a.score);

    const top = ranked[0] || null;
    let confidence = 0;
    if (top) {
      const second = ranked[1] ? ranked[1].score : top.score - 6;
      const base = sigmoid((top.score - 3.5) / 1.5);
      confidence = base * (0.55 + 0.45 * Math.min(1, Math.max(0, top.score - second) / 3));
    }
    ranked.forEach(r => { r.confidence = round2(sigmoid((r.score - 3.5) / 1.5)); });
    return { ranked, top, confidence: round2(confidence) };
  }

  // The headline layout to remember after you confirm one.
  function learnProfile(prev, cand, maxFont) {
    const fr = maxFont ? (+cand.fontSize || 0) / maxFont : 1;
    const n = (prev && prev.n) || 0;
    const mix = (a, b) => n ? (a * n + b) / (n + 1) : b;
    return {
      n: Math.min(n + 1, 20),
      fontRatio: round2(mix(prev && prev.fontRatio || fr, fr)),
      aboveHandle: !!cand.aboveHandle,
      lines: Math.round(mix(prev && prev.lines || cand.lines || 1, cand.lines || 1))
    };
  }

  const api = {
    VERSION, TAG_RE, TAG_LOOSE, CONFIRM_AT, STRATEGY_NAMES,
    analyze, collect, collectBlocks, formatBlock, copyText, fieldsOf, isStory, splitOptions, hashtags, hasLabels,
    pickSpans, rankHeadlines, learnProfile, similarity,
    _: { parseLabel, makeLine, headlineScore, captionScore, sentenceCount, tagOnly, cutTrailingTags, stripEmphasis, norm, flat }
  };
  root.HHEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
