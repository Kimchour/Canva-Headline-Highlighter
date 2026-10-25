/* Headline Highlighter — understanding what you ask for.

   Turns an instruction in your own words ("grab the headline", "copy the
   caption and hashtags", "fix the selection") into a short plan of steps the
   panel can carry out and check. Follow-ups ("copy it", "now the caption",
   "the second one", "no, not that") use what happened last.

   Plain functions, no page access, so the tests can run it directly. */

(function (root) {
  "use strict";

  // Each verb maps to an operation. Longer phrases are matched first, so
  // "check for updates" never reads as "check" and "line up" never as "up".
  const VERBS = [
    ["update", /\b(?:check(?:ing)? for (?:an? |any )?updates?|look for (?:an? )?updates?|any updates?|is there an? (?:update|new version)|new(?:er)? version|latest version|update the (?:tool|extension|highlighter)|upgrade|updates?)\b/],
    ["automation_on", /\b(?:(?:turn|switch|put) on automation|(?:turn|switch) automation on|enable automation|automation on|start automation)\b/],
    ["automation_off", /\b(?:(?:turn|switch) off automation|(?:turn|switch) automation off|disable automation|automation off|stop automation)\b/],
    // "clear the hashtags" empties that field; "clear" alone is the whole panel.
    ["clearfield", /\b(?:clear|remove|delete|empty|drop|erase|wipe|get rid of)(?: out)?(?: the| my| all(?: the)?)? (?:headlines?|titles?|captions?|hash ?tags?|tags)\b/],
    ["clear", /\b(?:clear(?: (?:it|all|everything|the box))?|reset|start over|start again|new post|wipe|empty the box|next post)\b/],
    ["navigate", /\b(?:go to|go back to|open|show(?: me)?|take me to|switch to|back to)(?: the| my)? (?:settings|options|preferences|tools|studio|home)\b/],
    ["confirm", /^(?:yes|yep|yeah|correct|right|that'?s (?:it|right|correct|the one)|confirm|looks good|use (?:it|that|this)|ok(?:ay)?|good|perfect)\b/],
    // Bare "again", "no" and "not the" are everyday words in other commands
    // ("copy the caption again", "not the caption"): on their own they count
    // as "look again" (see wholeAsk), not here.
    ["reanalyze", /\b(?:fix(?: (?:it|the selection|that|this|the headline|the detection))?|re-?analy[sz]e|re-?detect|re-?check|re-?scan|re-?do|redo|retry|try again|wrong(?: one| headline| title)?|incorrect|that'?s not (?:it|right|correct|the (?:right )?(?:one|headline|title))|isn'?t (?:it|right|correct|the (?:right )?(?:one|headline|title))|not (?:that|this) one|other one|different one|next (?:one|candidate)|another (?:one|candidate)|correct (?:the|it|this)|look again|pick another)\b/],
    ["undo", /\b(?:undo|put (?:it )?back|revert)\b/],
    ["locate", /\b(?:locate|where(?:'?s| is| are)|point (?:to|at|out)|show (?:me )?where|which (?:one|text|box) is)\b/],
    ["highlight", /\b(?:highlight|colou?r(?: in)?|paint|mark|emphasi[sz]e|accent)\b/],
    // Only with a verb: "what's in the notes?" must not overwrite them.
    ["notes", /\b(?:(?:fill|send|put|write|paste|add|update)(?: [a-z]+){0,3} (?:in|into|to) (?:the )?notes|fill (?:in )?(?:the )?notes)\b/],
    ["lineup", /\b(?:line(?:s)? (?:it |them )?up|line-?up|align|cent(?:er|re)|fit (?:the )?(?:headline|title|text|it))\b/],
    ["fill", /\b(?:fill (?:the )?(?:page|design|it|frame)?\s*(?:with (?:the )?(?:photo|image|picture))|fill with photo|photo fill)\b/],
    ["photo", /\b(?:enhance|improve|sharpen|adjust|auto-?adjust)(?: (?:the|my))? (?:photo|image|picture)|(?:photo|image|picture) (?:enhance|adjust)/],
    ["censor", /\b(?:censor|bleep|mask|clean up (?:the )?(?:words|language))\b/],
    ["strength_up", /\b(?:heavier|more (?:highlights?|colou?rs?|words|phrases)|highlight more|colou?r more|heavy)\b/],
    ["strength_down", /\b(?:lighter|less|fewer (?:highlights?|colou?rs?|words|phrases)|highlight less|colou?r less|light)\b/],
    ["strength_mid", /\b(?:medium|normal amount|in between)\b/],
    ["copy", /\b(?:copy|clipboard)\b/],
    ["run", /\b(?:run(?: it| everything| all| the (?:whole|full) (?:thing|post|run))?|do (?:it|everything|the (?:whole|full) (?:thing|post))|process|finish (?:it|the post)|complete (?:it|the post)|make the post|send (?:it |this )?to canva|apply (?:it|everything)|execute|automate)\b/],
    ["detect", /\b(?:smart detect|detect|analy[sz]e|scan|identify|recogni[sz]e|figure out|look for|find)\b/],
    ["extract", /\b(?:extract|grab|get|pull|take|fetch|collect|capture|read|give me|show(?: me)?|pick out|separate|split|need|want|what(?:'?s| is| are) (?:the|my)(?= (?:headlines?|titles?|captions?|hash ?tags?|tags|hook|main|story|post)\b))\b/],
    ["help", /^(?:help|\?|what can (?:you|i) (?:do|say|ask)|commands|how (?:does this|do i use this) work)/]
  ];

  const TARGETS = [
    ["all", /\b(?:everything|all (?:of it|three|fields|parts|content|the (?:content|parts|fields))|all|the lot|whole (?:post|thing)|full post|the post|entire post|every(?: ?thing| field| part))\b/],
    ["main", /\b(?:main story|main content|primary content|the story|main text|article|the content)\b/],
    ["headline", /\b(?:headlines?|titles?|hooks?|heading|header|head line)\b/],
    ["caption", /\b(?:captions?|descriptions?|body(?: text)?|post text)\b/],
    ["hashtags", /\b(?:hash ?tags?|tags?)\b/],
    ["prev", /\b(?:it|that|them|those|this|these|the same)\b/]
  ];

  const ORDINALS = { first: 1, "1st": 1, one: 1, second: 2, "2nd": 2, two: 2, third: 3, "3rd": 3, three: 3,
    fourth: 4, "4th": 4, four: 4, fifth: 5, "5th": 5, five: 5, last: -1 };

  const FIELD_NAMES = { headline: "headline", caption: "caption", hashtags: "hashtags" };
  const ALL = ["headline", "caption", "hashtags"];

  const OP_LABEL = {
    detect: "Detect", extract: "Extract", copy: "Copy", highlight: "Highlight", locate: "Locate",
    reanalyze: "Reanalyze", run: "Run on design", notes: "Fill Notes", lineup: "Line up", fill: "Fill with photo",
    photo: "Enhance photo", censor: "Censor", clear: "Clear", update: "Check for updates", undo: "Undo",
    option: "Use option", pick: "Use candidate", confirm: "Confirm", set: "Set", repeat: "Repeat the last task",
    strength: "Highlight amount", automation: "Automation", help: "Help", clearfield: "Clear",
    navigate: "Open", unsupported: "Can't do", skip: "Do nothing"
  };

  function normalize(s) {
    return String(s || "").toLowerCase()
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/\s*[&+]\s*/g, " and ")
      .replace(/[^a-z0-9#'" -]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  // Like normalize, but a clause break (, ; . ! ?) stays as " , " so "no,
  // copy the caption" isn't read as "don't copy".
  function prep(s) {
    return String(s || "").toLowerCase()
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/\s*[&+]\s*/g, " and ")
      .replace(/[,;!?]+|\.+(?=\s|$)/g, " , ")
      .replace(/[^a-z0-9#'", -]+/g, " ")
      .replace(/\s+/g, " ").replace(/,(?: ,)+/g, ",")
      .replace(/^(?:, ?)+|(?: ?,)+$/g, "").trim();
  }
  const bare = (t) => t.replace(/ ?,/g, "").replace(/\s+/g, " ").trim();

  // Instructions that only mean this when they are all you wrote.
  const WHOLE = [
    ["reanalyze", /^(?:no|nope|nah|again|wrong|one more time|repeat(?: it| that)?|do (?:it|that) again|not (?:it|that|this|right)|not (?:that|this|the right) one|not the (?:right )?(?:one|headline|title))(?: please)?$/],
    ["run", /^(?:ok(?:ay)? )?(?:go|go ahead|go for it)$/]
  ];
  const REPEAT_RE = /^(?:again|try again|retry|one more time|repeat(?: it| that)?|do (?:it|that) again)$/;

  // "don't run it", "stop the run", "without highlighting": the verb is off.
  const NEG_VERB = /(?:^| )(?:don'?t|do not|never|not|stop|without|no need to|skip|avoid|instead of|rather than|no)(?: [^ ,]+){0,2} ?$/;
  // "not the caption", "everything except the hashtags": the field is out.
  const NEG_TARGET = /(?:^| )(?:not|no|without|except|excluding|exclude|minus|but|apart from|other than|leave out|leave off|skip)(?: (?:the|my|any|its|their))? ?$/;
  const NEG_WORDS = /(?:^| )(?:don'?t|do not|never|not|stop|without|no need to|skip|avoid|instead of|rather than|except|excluding|exclude|minus|apart from|other than|leave out|leave off)(?= |$)/g;

  // Every match of every pattern, then the longest non-overlapping ones.
  function scan(text, table) {
    const hits = [];
    table.forEach(([key, re]) => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m;
      while ((m = g.exec(text))) {
        if (!m[0]) { g.lastIndex++; continue; }
        hits.push({ key, at: m.index, end: m.index + m[0].length, text: m[0] });
      }
    });
    hits.sort((a, b) => (b.end - b.at) - (a.end - a.at) || a.at - b.at);
    const taken = [];
    hits.forEach(h => { if (!taken.some(t => h.at < t.end && t.at < h.end)) taken.push(h); });
    return taken.sort((a, b) => a.at - b.at);
  }

  const uniq = (a) => [...new Set(a)];

  function fieldsFor(targets, ctx, fallback, exclude) {
    let f = [];
    targets.forEach(t => {
      if (t === "all") f.push(...ALL);
      else if (t === "main") f.push("headline", "caption");
      else if (t === "prev") f.push(...((ctx && ctx.lastFields && ctx.lastFields.length) ? ctx.lastFields : (fallback || ALL)));
      else if (FIELD_NAMES[t]) f.push(t);
    });
    f = uniq(f);
    const out = f.length ? ALL.filter(x => f.includes(x)) : (fallback || ALL).slice();
    const ex = fieldsOnly(exclude || []);
    const kept = out.filter(x => !ex.includes(x));
    return kept.length ? kept : out;
  }
  const fieldsOnly = (ts) => uniq([].concat(...ts.map(t => t === "all" ? ALL : t === "main" ? ["headline", "caption"] : FIELD_NAMES[t] ? [t] : [])));
  const fieldsInWords = (t) => ALL.filter(f => (f === "headline" ? /head|title/ : f === "caption" ? /caption/ : /tag/).test(t));

  // "the second one", "option 2", "number 3", "use 2"
  function ordinal(text) {
    let m = text.match(/\b(?:option|version|candidate|number|no|#)\s*#?\s*(\d{1,2})\b/);
    if (m) return +m[1];
    m = text.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last)\b(?:\s+(?:one|option|version|candidate|headline))?/);
    if (m) return ORDINALS[m[1]];
    m = text.match(/^(?:use |pick |take |try )?(\d{1,2})$/);
    if (m) return +m[1];
    return 0;
  }
  const OPTION_WORDS = /\b(?:option|version)s?\b/;

  // "the second one", "option 2": a choice, not words to type in.
  const REF_RE = /^(?:the )?(?:(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)(?: (?:one|option|version|candidate|headline|title|caption))?|(option|version|candidate|number|no|#) ?#? ?(\d{1,2}))$/;
  const OTHER_RE = /^(?:the |an? )?(?:other|next|another|different)(?: (?:one|option|version|candidate|headline|title))?$/;

  // "set the headline to …", "change the caption to …" keep your exact words.
  function setCommand(raw) {
    const m = String(raw || "").match(/^\s*(?:set|change|make|replace|rename|update)\s+(?:the\s+)?(headline|title|caption|hashtags?|tags)\s+(?:to|with|as|=|:)\s*([\s\S]+)$/i);
    if (!m) return null;
    const k = m[1].toLowerCase();
    const field = /^(headline|title)$/.test(k) ? "headline" : k === "caption" ? "caption" : "hashtags";
    const said = m[2].trim();
    const quoted = /^["“'][\s\S]*["”']$/.test(said);
    const value = said.replace(/^["“'](.*)["”']$/s, "$1");
    if (!quoted) {
      const v = normalize(value);
      const ref = v.match(REF_RE);
      if (ref) {
        const n = ref[3] ? +ref[3] : ORDINALS[ref[1]];
        return { op: OPTION_WORDS.test(v) || field !== "headline" ? "option" : "pick", n };
      }
      if (OTHER_RE.test(v)) return { op: "reanalyze" };
    }
    // A few words led by "the" / "my" ("the new text") are more likely a
    // description than the words themselves: check before using them.
    const unsure = !quoted && value.split(/\s+/).length <= 4 && /^(?:the|a|an|this|that|these|those|my|it|its|what|which|new|other)\b/i.test(value);
    return { op: "set", field, value, unsure };
  }

  const UNDO_WHAT = { lineup: "line-up", fill: "photo fill" };

  function describe(steps) {
    return steps.map(s => {
      const base = OP_LABEL[s.op] || s.op;
      if (s.fields && ["extract", "copy", "detect"].includes(s.op) && !(s.fields.length === 3 && s.op === "detect"))
        return base + " " + (s.fields.length === 3 ? "everything" : s.fields.join(" + ")) + (s.from === "page" ? " from the design" : "");
      if (s.op === "option" || s.op === "pick") return base + " " + (s.n === -1 ? "last" : s.n);
      if (s.op === "set") return "Set " + s.field + (s.value ? " to “" + (s.value.length > 40 ? s.value.slice(0, 40) + "…" : s.value) + "”" : "");
      if (s.op === "clearfield") return "Clear " + (s.fields || []).join(" + ");
      if (s.op === "navigate") return "Open " + s.view;
      if (s.op === "undo" && s.what) return "Undo " + (UNDO_WHAT[s.what] || (OP_LABEL[s.what] || s.what).toLowerCase());
      if (s.op === "unsupported") return "Can't " + s.what;
      if (s.op === "skip") return "Nothing — you said not to " + (s.what || []).map(w => (OP_LABEL[w] || w).toLowerCase()).join(" or ");
      if (s.op === "strength") return "Highlight " + s.level;
      if (s.op === "automation") return "Automation " + (s.on ? "on" : "off");
      return base + (s.from === "page" ? " on the design" : "");
    }).join(" → ");
  }

  // ctx (optional): { lastPlan, lastOp, lastFields, lastFailed, hasOptions, hasCandidates, pendingConfirm }
  function parse(input, ctx) {
    ctx = ctx || {};
    const raw = String(input || "").trim();
    const text = prep(raw);
    const plain = bare(text);
    const out = { input: raw, steps: [], understood: false, confidence: 0, summary: "", followUp: false, unknown: [] };
    if (raw === "?") { out.steps = [{ op: "help" }]; out.understood = true; out.confidence = 1; out.summary = "Help"; return out; }
    if (!text) return out;

    const set = setCommand(raw);
    if (set) {
      if (set.op === "reanalyze") set.surface = ctx.lastSurface || "text";
      if (set.op === "set" && !set.unsure) delete set.unsure;
      out.steps = [set];
      out.understood = true;
      out.confidence = set.unsure ? 0.5 : 0.95;
      out.followUp = set.op !== "set";
      out.summary = describe(out.steps);
      return out;
    }

    const whole = WHOLE.find(([, re]) => re.test(plain));
    let verbs = whole ? [{ key: whole[0], at: 0, end: text.length, text }] : scan(text, VERBS);
    // A target word inside a verb phrase ("fill notes", "fit the headline")
    // belongs to the verb.
    const targets = whole ? [] : scan(text, TARGETS).filter(t => !verbs.some(v => t.at < v.end && v.at < t.end && v.key !== "extract" && v.key !== "detect"));
    verbs = verbs.filter(v => !(v.key === "strength_down" && /\bless\b/.test(v.text) && targets.length === 0 && verbs.length > 1));
    const onPage = /\b(?:on|in|from) (?:the |this |my )?(?:page|design|canvas|canva|template|slide)\b/.test(text);
    const n = ordinal(plain);
    const optWords = OPTION_WORDS.test(text);

    // Yes / no answers to a question the panel asked.
    if (ctx.pendingConfirm && verbs.length && verbs[0].key === "confirm" && verbs.length === 1) {
      out.steps = [{ op: "confirm" }];
    }

    if (!out.steps.length) {
      // Walk the words in order: each verb starts a step, the targets after it
      // belong to it. "don't run it" switches the verb off; "not the caption"
      // takes a field out.
      const tokens = verbs.map(v => ({ kind: "v", ...v })).concat(targets.map(t => ({ kind: "t", ...t })))
        .sort((a, b) => a.at - b.at);
      const steps = [];
      let pending = [], pendingEx = [], prevEnd = 0;
      tokens.forEach(tk => {
        const before = text.slice(Math.max(prevEnd, text.lastIndexOf(",", tk.at - 1) + 1), tk.at);
        prevEnd = Math.max(prevEnd, tk.end);
        if (tk.kind === "v") {
          const step = { op: tk.key, text: tk.text, at: tk.at, end: tk.end, targets: pending, exclude: pendingEx };
          pending = []; pendingEx = [];
          if (NEG_VERB.test(before)) step.neg = true;
          steps.push(step);
          return;
        }
        const last = steps[steps.length - 1];
        const ex = NEG_TARGET.test(before);
        if (last) (ex || last.neg ? last.exclude : last.targets).push(tk.key);
        else (ex ? pendingEx : pending).push(tk.key);
      });
      steps.forEach(s => { s.own = s.targets.slice(); });
      // Verbs with nothing between them share the next targets.
      for (let i = steps.length - 2; i >= 0; i--) {
        if (!steps[i].targets.length && !steps[i].neg && !steps[i + 1].neg && steps[i + 1].targets.length && ["copy", "extract", "detect", "highlight", "locate"].includes(steps[i].op)) {
          steps[i].targets = steps[i + 1].targets.slice();
          steps[i].exclude = steps[i].exclude.concat(steps[i + 1].exclude);
        }
      }
      // "undo the line up" names what to undo; it isn't a second step.
      for (let i = 0; i < steps.length - 1; i++) {
        const a = steps[i], b = steps[i + 1];
        if (a.op === "undo" && !a.what && !a.neg && !b.neg && /^(?: (?:the|my|that|this|last|a))* ?$/.test(text.slice(a.end, b.at))) {
          a.what = b.op;
          steps.splice(i + 1, 1);
        }
      }

      // "I don't want the hashtags" means everything else; "don't copy it"
      // means nothing at all.
      const live = steps.filter(s => !s.neg);
      const negEx = [].concat(...steps.filter(s => s.neg && s.op === "extract").map(s => s.exclude.concat(s.targets)));
      const allEx = uniq(pendingEx.concat(negEx));
      if (!live.length && (pending.length || allEx.length)) {
        const also = /\b(?:and|also|too|as well|plus)\b/.test(text);
        const op = ctx.lastOp && ["copy", "extract", "highlight", "locate"].includes(ctx.lastOp) ? ctx.lastOp : "extract";
        let ts = pending;
        if (also && ctx.lastFields) ts = ts.concat(ctx.lastFields.filter(f => ALL.includes(f)));
        if (!ts.length && allEx.length) ts = (ctx.lastFields && ctx.lastFields.length ? ctx.lastFields : ALL).slice();
        live.push({ op, targets: ts, exclude: allEx, own: ts.slice() });
        out.followUp = !!ctx.lastOp;
      }
      // A number on its own: pick an option, or another headline candidate.
      if (!live.length && n) {
        live.push({ op: optWords || ctx.hasOptions ? "option" : "pick", n });
        out.followUp = true;
      }
      if (!live.length && steps.length) live.push({ op: "skip", what: uniq(steps.map(s => s.op)) });
      const offOps = steps.filter(s => s.neg).map(s => s.op);

      live.forEach(s => {
        const ts = s.targets || [];
        const ex = s.exclude || [];
        if (ts.includes("prev")) out.followUp = true;
        switch (s.op) {
          case "detect":
          case "extract": {
            s.fields = fieldsFor(ts, ctx, ALL, ex);
            if (onPage) s.from = "page";
            if (ts.includes("main")) s.main = true;
            break;
          }
          case "copy":
            s.fields = fieldsFor(ts, ctx, ctx.lastFields && ctx.lastFields.length ? ctx.lastFields : ALL, ex);
            break;
          case "highlight":
          case "locate": {
            // Only the headline is coloured on the design.
            const own = fieldsOnly(s.own || []);
            if (own.length && !own.includes("headline") && !(s.own || []).includes("prev")) {
              s.what = s.op + " the " + own.join(" or ") + " — only the headline";
              s.op = "unsupported";
              break;
            }
            s.fields = ["headline"];
            if (onPage || s.op === "locate") s.from = "page";
            // "highlight it but don't line it up"
            if (s.op === "highlight" && offOps.includes("lineup")) s.align = false;
            break;
          }
          case "clearfield":
            s.fields = ALL.filter(f => fieldsInWords(s.text).includes(f) || fieldsOnly(ts).includes(f));
            break;
          case "navigate":
            s.view = /setting|option|preference/.test(s.text) ? "settings" : /tool/.test(s.text) ? "tools" : "studio";
            break;
          case "reanalyze":
            if (n) { s.op = optWords || ctx.hasOptions ? "option" : "pick"; s.n = n; break; }
            // After a failure, "again" means run that again; "repeat" always
            // does. Otherwise look again.
            if (REPEAT_RE.test(plain) && ctx.lastPlan && ctx.lastPlan.length && (ctx.lastFailed || /repeat|do (?:it|that) again|one more time/.test(plain))) {
              s.op = "repeat";
              s.plan = ctx.lastPlan;
            }
            s.surface = ctx.lastSurface || "text";
            break;
          case "strength_up": s.op = "strength"; s.level = "heavy"; break;
          case "strength_down": s.op = "strength"; s.level = "light"; break;
          case "strength_mid": s.op = "strength"; s.level = "medium"; break;
          case "automation_on": s.op = "automation"; s.on = true; break;
          case "automation_off": s.op = "automation"; s.on = false; break;
          case "confirm": if (!ctx.pendingConfirm) s.op = "noop"; break;
          case "notes": s.fields = ["caption", "hashtags"]; break;
          default: break;
        }
        if (!s.fields) delete s.fields;
        ["targets", "exclude", "own", "text", "at", "end", "neg"].forEach(k => delete s[k]);
      });

      // "use option 2" / "take version 3": only the option, not also a pick
      // or an extract of everything.
      if (n && optWords && !live.some(s => s.op === "option")) {
        for (let i = live.length - 1; i >= 0; i--) {
          const s = live[i];
          if (s.op === "pick" || (["extract", "detect", "reanalyze"].includes(s.op) && (!s.fields || s.fields.length === 3))) live.splice(i, 1);
        }
        live.unshift({ op: "option", n });
      }

      // "find the headline" means detect it and show it, not just analyse.
      const cleaned = [];
      live.forEach((s) => {
        if (s.op === "noop") return;
        const prev = cleaned[cleaned.length - 1];
        if (prev && prev.op === s.op && JSON.stringify(prev.fields) === JSON.stringify(s.fields)) return;
        // detect then extract of the same thing is one step.
        if (prev && prev.op === "detect" && s.op === "extract") { prev.op = "extract"; prev.fields = s.fields; return; }
        if (prev && prev.op === "extract" && s.op === "detect") return;
        cleaned.push(s);
      });
      out.steps = cleaned;
    }

    out.understood = out.steps.length > 0;
    // How much of what you wrote was understood: the words outside every
    // match that aren't filler.
    const covered = new Array(text.length).fill(false);
    const mark = (at, end) => { for (let i = at; i < end; i++) covered[i] = true; };
    if (whole) mark(0, text.length);
    scan(text, VERBS).concat(scan(text, TARGETS)).forEach(h => mark(h.at, h.end));
    let m;
    NEG_WORDS.lastIndex = 0;
    while ((m = NEG_WORDS.exec(text))) mark(m.index, m.index + m[0].length);
    const FILLER = /^(?:the|a|an|and|then|please|pls|now|also|too|for|me|my|to|of|from|on|in|this|that|it|just|only|can|you|could|would|i|want|need|with|all|both|page|design|canvas|canva|template|again|one|ok|okay|so|then|first|next|after|that|as|well|plus|is|are|be|some|its|out|up|real|quick|quickly|thanks|thank|make|do|use|pick|take|try|option|version|candidate|number|no|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th|hey|hi|yet|but|not|instead|except|without|go|ahead|let's)$/;
    let left = 0, total = 0;
    text.split(" ").reduce((pos, w) => {
      const at = text.indexOf(w, pos);
      if (w === ",") return at + 1;
      total++;
      const inMatch = covered[at];
      if (!inMatch && !FILLER.test(w) && !/^\d+$/.test(w)) { left++; out.unknown.push(w); }
      return at + w.length;
    }, 0);
    out.confidence = out.understood ? Math.round(Math.max(0.35, 1 - left / Math.max(2, total)) * 100) / 100 : 0;
    out.summary = describe(out.steps);
    return out;
  }

  const SUGGESTIONS = [
    { text: "Get everything", hint: "Headline, caption and hashtags" },
    { text: "Highlight the headline", hint: "Find it on the design and colour it" },
    { text: "Copy the caption and hashtags", hint: "Ready to paste" },
    { text: "Find the main story", hint: "Headline and caption only" },
    { text: "Fix the selection", hint: "Look again a different way" },
    { text: "Where is the headline?", hint: "Point it out on the design" },
    { text: "Check for updates", hint: "Is a newer version out?" }
  ];

  const api = { parse, normalize, describe, SUGGESTIONS, OP_LABEL };
  root.HHIntent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
