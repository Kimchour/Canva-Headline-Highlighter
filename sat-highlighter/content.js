/* Headline Highlighter for Canva
   Panel lives on top of the Canva editor. It decides which phrases get colored,
   censors flagged words, and drives the text selection inside a Canva text box
   so coloring is one click instead of a drag. */

(() => {
  if (window.__hhLoaded) return;
  window.__hhLoaded = true;

  /* ---------- defaults ---------- */

  const DEFAULT_PALETTE = [
    "#FFC93C", // brand gold
    "#FF6B4A",
    "#4ED8C4",
    "#B48CFF",
    "#7BE38B",
    "#FFFFFF"
  ];

  const DEFAULT_CENSOR = [
    "kill=k*ll",
    "kills=k*lls",
    "killed=k*lled",
    "killing=k*lling",
    "killer=k*ller",
    "murder=murd*r",
    "torture=tortur£",
    "tortured=tortur£d",
    "murders=murd*rs",
    "murdered=murd*red",
    "stab=st*b",
    "stabs=st*bs",
    "stabbed=st*bbed",
    "stabbing=st*bbing",
    "death=d£ath",
    "deaths=d£aths",
    "die=di£",
    "dies=di£s",
    "died=di£d",
    "dead=d£ad",
    "rape=r*pe",
    "raped=r*ped",
    "suicide=suicid£",
    "shot=sh*t",
    "shooting=sh**ting",
    "strangle=str*ngle",
    "strangled=str*ngled",
    "abuse=ab*se",
    "abused=ab*sed",
    "corpse=c*rpse",
    "blood=bl**d"
  ].join("\n");

  // Words that usually carry the twist. A hit starts a highlight span.
  const TRIGGERS = `rejected refused denied banned blocked fired sacked arrested charged
    sentenced convicted sued quit walked stormed broke collapsed crashed diverted grounded
    canceled cancelled stranded exploded strangled str*ngled fractured paralyzed paralysed
    hospitalized hospitalised survived saved donated raised inherited humiliated betrayed
    abandoned adopted reunited discovered revealed confessed admitted apologized apologised
    escaped vanished disappeared stunned shocked ignored mocked evicted deported bankrupt
    homeless viral k*lled murd*r murd*red st*bbed d£ath di£d`
    .trim().split(/\s+/);

  // A span stops dead before any of these — they start a new clause.
  const STOPPERS = new Set(`and but then because after before while when where whose that
    which who until though although if is was were are has had have she he they it`
    .trim().split(/\s+/));

  // A span may run through these but never end on one.
  const TRIMMERS = new Set(`a an the by from of to in on at with for as so into over`
    .trim().split(/\s+/));

  /* ---------- state ---------- */

  const state = {
    palette: DEFAULT_PALETTE.slice(),
    active: DEFAULT_PALETTE[0],
    censorMap: DEFAULT_CENSOR,
    method: "auto",   // auto | paste | toolbar
    text: "",
    tab: "all",
    bundle: "",
    raw: "",
    caption: "",
    tags: "",
    strength: "medium",
    baseColor: "#FFFFFF",
    resetBase: true,
    muted: false,
    alignAfter: true,
    view: "manual",
    mtab: "headline",
    runHighlight: true,
    runNotes: true,
    pinnedTools: ["adjust", "toback", "align"],
    photoInRun: false,
    photoAuto: true,
    photoSharp: 25,
    photoClarity: 15,
    photoVignette: 0,
    autoOpenBox: true,
    closePanels: true,
    dropStop: true,
    fitWidth: true,
    autoMode: false,
    waitPhoto: true,
    photoFill: true,
    fillIntroduced: false,
    compact: false,
    lastPost: null,
    fitIntroduced: false,
    panelWay: "",
    tagMode: "keep",
    optionIndex: 0,
    tidyMarks: true,
    tidyDashes: true,
    headDashes: true,
    censorOn: true,
    paras: 0,
    tokens: [],      // {t, word, color}
    phrases: [],     // {text, color}
    cursor: -1,
    collapsed: false,
    size: { w: 344, h: null },
    pos: { x: null, y: 96 }
  };

  const store = {
    save() {
      try {
        chrome.storage.local.set({
          hh: {
            palette: state.palette,
            active: state.active,
            censorMap: state.censorMap,
            method: state.method,
            text: state.text,
            tab: state.tab,
            bundle: state.bundle,
            raw: state.raw,
            caption: state.caption,
            tags: state.tags,
            strength: state.strength,
            baseColor: state.baseColor,
            resetBase: state.resetBase,
            muted: state.muted,
            alignAfter: state.alignAfter,
            view: state.view,
            mtab: state.mtab,
            runHighlight: state.runHighlight,
            runNotes: state.runNotes,
            pinnedTools: state.pinnedTools,
            photoInRun: state.photoInRun,
            photoAuto: state.photoAuto,
            photoSharp: state.photoSharp,
            photoClarity: state.photoClarity,
            photoVignette: state.photoVignette,
            autoOpenBox: state.autoOpenBox,
            closePanels: state.closePanels,
            dropStop: state.dropStop,
            fitWidth: state.fitWidth,
            autoMode: state.autoMode,
            waitPhoto: state.waitPhoto,
            photoFill: state.photoFill,
            fillIntroduced: state.fillIntroduced,
            compact: state.compact,
            lastPost: state.lastPost,
            fitIntroduced: state.fitIntroduced,
            panelWay: state.panelWay,
            tagMode: state.tagMode,
            optionIndex: state.optionIndex,
            tidyMarks: state.tidyMarks,
            tidyDashes: state.tidyDashes,
            headDashes: state.headDashes,
            censorOn: state.censorOn,
            paras: state.paras,
            collapsed: state.collapsed,
            size: state.size,
            pos: state.pos
          }
        });
      } catch (e) {}
    },
    load(cb) {
      try {
        chrome.storage.local.get("hh", (r) => {
          if (r && r.hh) Object.assign(state, r.hh);
          // Older builds had one row of tabs. Map the old choice onto Quick/Manual.
          if (r && r.hh && !r.hh.view) {
            state.view = state.tab === "all" || !state.tab ? "quick" : "manual";
            state.mtab = { highlight: "headline", caption: "caption" }[state.tab] || "headline";
          }
          if (!["quick", "manual"].includes(state.view)) state.view = "quick";
          if (!["headline", "caption", "settings"].includes(state.mtab)) state.mtab = "headline";
          if (!state.size || typeof state.size.w !== "number") state.size = { w: 344, h: null };
          cb();
        });
      } catch (e) { cb(); }
    }
  };

  /* ---------- colour values ---------- */
  // A palette entry is either "#RRGGBB" or "grad:#AAA111,#BBB222" for a Canva
  // gradient, which cannot be expressed as a single hex.

  const isGrad = (c) => typeof c === "string" && c.indexOf("grad:") === 0;
  const gradStops = (c) => c.slice(5).split(",").map(s => s.trim().toUpperCase());
  const cssFor = (c) => isGrad(c) ? "linear-gradient(90deg," + gradStops(c).join(",") + ")" : c;
  const labelFor = (c) => isGrad(c) ? gradStops(c).join(" \u2192 ") : String(c).toUpperCase();
  const firstStop = (c) => isGrad(c) ? gradStops(c)[0] : c;

  function parseHexes(s) {
    const out = [];
    (String(s || "").match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).forEach(h => {
      const n = normalizeHex(h);
      if (n && !out.includes(n)) out.push(n);
    });
    return out;
  }

  function rgbsIn(s) {
    const out = [];
    (String(s || "").match(/rgba?\([^)]+\)/g) || []).forEach(r => {
      if (/rgba\([^)]*,\s*0\s*\)/.test(r)) return;      // fully transparent
      const n = normalizeHex(r);
      if (n && !out.includes(n)) out.push(n);
    });
    return out;
  }

  function normalizeHex(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const rgb = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (rgb) {
      const h = [rgb[1], rgb[2], rgb[3]]
        .map(n => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, "0")).join("");
      return "#" + h.toUpperCase();
    }
    let v = "";
    const tagged = s.match(/#([0-9a-f]{3,8})\b/i);
    if (tagged) v = tagged[1];
    else {
      const bare = s.match(/\b([0-9a-f]{6}|[0-9a-f]{3})\b/i);
      v = bare ? bare[1] : s.replace(/^#/, "").replace(/[^0-9a-f]/gi, "");
    }
    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split("").map(c => c + c).join("");
    if (/^[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 6);
    return /^[0-9a-f]{6}$/i.test(v) ? "#" + v.toUpperCase() : null;
  }

  function useColor(hex) {
    const h = normalizeHex(hex);
    if (!h) return null;
    const at = state.palette.findIndex(c => c.toUpperCase() === h);
    if (at === -1) {
      state.palette.push(h);
      if (state.palette.length > 10) state.palette.splice(0, state.palette.length - 10);
    }
    state.active = h;
    store.save();
    return h;
  }

  // Reads the colours Canva already has in this design: the swatches in the open
  // Text color panel, plus whatever is actually rendered in the selected text box.
  function scanDesignColors() {
    const solids = [], grads = [];
    const addSolid = (h) => { if (h && !solids.includes(h)) solids.push(h); };
    const addGrad = (stops) => {
      if (stops.length < 2 || stops.length > 3) return;   // skip the rainbow "+" button
      const key = "grad:" + stops.join(",");
      if (!grads.includes(key)) grads.push(key);
    };

    const scope = findColorPanel();
    if (scope) {
      // Everything below the "Default solid colors" / "Photo colors" headings is
      // Canva's generic grid, not this design. Reading it floods the palette.
      let cutoff = Infinity;
      [...scope.querySelectorAll("div,span,h1,h2,h3,h4,h5,p")].forEach(e => {
        if (!notMine(e) || !visible(e) || e.childElementCount) return;
        if (!/^(default solid colou?rs|photo colou?rs|document colou?rs)$/i
          .test((e.textContent || "").trim())) return;
        cutoff = Math.min(cutoff, e.getBoundingClientRect().top);
      });

      [...scope.querySelectorAll("*")].filter(n => notMine(n) && visible(n)).forEach(n => {
        const r = n.getBoundingClientRect();
        if (r.top >= cutoff) return;
        if (r.width < 10 || r.width > 72) return;
        if (Math.abs(r.width - r.height) > 12) return;

        const lbl = (n.getAttribute("aria-label") || n.getAttribute("title") || "");
        if (/add|custom|new colou?r|eyedrop|picker|default/i.test(lbl)) return;

        const cs = getComputedStyle(n);
        const bi = cs.backgroundImage || "";

        if (/gradient/i.test(bi)) {
          const stops = rgbsIn(bi);
          addGrad(stops.length >= 2 ? stops : parseHexes(lbl));
          return;
        }
        if (/gradient/i.test(lbl)) { addGrad(parseHexes(lbl)); return; }

        const fromLabel = parseHexes(lbl);
        if (fromLabel.length === 1) { addSolid(fromLabel[0]); return; }

        const bg = cs.backgroundColor;
        if (bg && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(bg)) addSolid(normalizeHex(bg));
      });
    }

    // Colours in use in the text box itself.
    const ed = findEditable();
    if (ed) {
      [ed, ...ed.querySelectorAll("*")].forEach(n => {
        const h = normalizeHex(getComputedStyle(n).color);
        if (h) addSolid(h);
      });
    }

    return { solids, grads };
  }

  async function pickFromDesign() {
    logClear();
    await clearLeftPanel(log);
    if (!findColorPanel()) {
      if (!findColorButton() && state.autoOpenBox) {
        log("No text box selected \u2014 looking for your headline on the page\u2026");
        await selectTextBox(log);
      }
      const btn = findColorButton();
      if (btn) {
        realClick(btn);
        await waitFor(findColorPanel, 2400);
      }
    }

    const { solids, grads } = scanDesignColors();
    const found = grads.concat(solids);
    if (!found.length) {
      toast("No colors found \u2014 click your text box in Canva");
      log(findColorButton()
        ? "The text color panel didn't open. Click the A-with-colour button in Canva's toolbar, then try again."
        : "Couldn't find a text box on this page. Click your headline in Canva, then try again.");
      return;
    }

    let added = 0;
    // Stop when full rather than shifting entries off the front — that was
    // silently deleting the brand gold in slot one.
    for (const c of found) {
      if (state.palette.length >= 12) break;
      if (added >= 8) break;
      if (state.palette.some(p => p.toUpperCase() === c.toUpperCase())) continue;
      state.palette.push(c);
      added++;
    }
    if (grads.length) state.active = grads[0];
    else if (added) state.active = state.palette[state.palette.length - 1];

    store.save();
    render();
    log("Found " + grads.length + " gradient" + (grads.length === 1 ? "" : "s")
      + " and " + solids.length + " solid color" + (solids.length === 1 ? "" : "s")
      + ", added " + added + ".");
    found.slice(0, 12).forEach(c => log("  " + labelFor(c)));
    toast(added ? "Added " + added + " from your design"
      : (state.palette.length >= 12 ? "Palette is full \u2014 Alt-click to remove" : "Already had those colors"));
  }

  /* ---------- text helpers ---------- */

  function tokenize(text) {
    // Keep whitespace as its own token so the original spacing survives.
    return text.split(/(\s+)/).filter(s => s.length).map(t => ({
      t,
      word: !/^\s+$/.test(t),
      color: null
    }));
  }

  function coreOf(tok) {
    // Strip punctuation for matching, keep it for display.
    return tok.t.replace(/^[^\p{L}\p{N}*£]+|[^\p{L}\p{N}*£]+$/gu, "").toLowerCase();
  }

  /* ---------- censoring ---------- */

  // Always applied on top of your own list. Add a line to your list with the
  // same word to change its spelling, or "word=word" to switch one off.
  const CORE_CENSOR = `kill=k*ll
murder=murd*r
stab=st*b
rape=r*pe
rapist=r*pist
death=d\u00a3ath
dead=d\u00a3ad
die=di\u00a3
died=di\u00a3d
dying=dy*ng
suicide=suicid\u00a3
shoot=sh**t
shot=sh*t
gun=g*n
gunman=g*nman
gunmen=g*nmen
gunfire=g*nfire
gunpoint=g*npoint
massacre=mass*cre
slaughter=sl*ughter
behead=beh*ad
decapitate=dec*pitate
dismember=dism*mber
strangle=str*ngle
suffocate=suff*cate
torture=tortur\u00a3
corpse=c*rpse
blood=bl**d
bomb=b*mb
terror=t*rror
terrorist=t*rrorist
hostage=h*stage
kidnap=k*dnap
assault=ass*ult
abuse=ab*se
molest=m*lest
pedophile=p*dophile
paedophile=pa*dophile
sex=s*x
sexual=s*xual
porn=p*rn
pornography=p*rnography
naked=n*ked
nude=n*de
prostitute=pr*stitute
incest=inc*st
overdose=overd*se
drug=dr*g
cocaine=c*caine
heroin=her*in
meth=m*th
fentanyl=f*ntanyl
weapon=w*apon`;

  // Common words that happen to contain a flagged root. Only consulted inside
  // hashtags, where words run together and there are no boundaries to lean on.
  const TAG_SAFE = ["skill", "establish", "stabl", "stabil", "grape", "drape", "scrape",
    "therapist", "deadline", "deadlift", "something", "method", "methane", "heroine",
    "bombay", "sextant", "snapshot", "screenshot", "hotshot", "diet", "soldier", "ladies",
    "studies", "bodies", "candies", "sussex", "essex", "wessex", "begun", "gunther",
    "bloodhound", "overshoot", "reshoot", "photoshoot"];

  const CENSOR_MARK = /[*\u00a3@$]/;
  const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function autoMask(w) {
    const m = w.match(/^(.)(.*?)([aeiou])(.*)$/i);
    return m ? m[1] + m[2] + "*" + m[4] : w.slice(0, 1) + "*" + w.slice(2);
  }

  // KILLED -> K*LLED, Killed -> K*lled, killed -> k*lled.
  function matchCase(src, out) {
    const letters = src.replace(/[^A-Za-z]/g, "");
    if (!letters) return out;
    if (letters === letters.toUpperCase()) return out.toUpperCase();
    if (letters[0] === letters[0].toUpperCase() && letters.slice(1) === letters.slice(1).toLowerCase()) {
      return out.charAt(0).toUpperCase() + out.slice(1).toLowerCase();
    }
    return out.toLowerCase();
  }

  function parseRules(text) {
    return String(text || "").split("\n")
      .map(l => l.trim()).filter(l => l.includes("="))
      .map(l => {
        const i = l.indexOf("=");
        return { from: l.slice(0, i).trim().toLowerCase(), to: l.slice(i + 1).trim() };
      })
      .filter(r => r.from && r.to && /^[a-z][a-z' -]*$/i.test(r.from));
  }

  function censorRules(mapText) {
    const mine2 = parseRules(mapText);
    const taken = new Set(mine2.map(r => r.from));
    const all = mine2.concat(parseRules(CORE_CENSOR).filter(r => !taken.has(r.from)));
    // "word=word" is an opt-out, not a rule.
    return all.filter(r => r.from !== r.to.toLowerCase()).sort((a, b) => b.from.length - a.from.length);
  }

  // Suffixes a root can carry. The root's last letter may double first, as in
  // stab -> stabbed, kidnap -> kidnapped.
  // "ous" and "ied" cover murderous and bloodied, which slipped through before.
  const SUFFIX = "s|es|ed|d|ing|ings|er|ers|r|rs|ly|y|ied|ous|ist|ists|al|ally";

  function censorWords(text, rules) {
    let out = text;
    for (const r of rules) {
      const root = escRe(r.from).replace(/\s+/g, "\\s+");
      const last = escRe(r.from.slice(-1));
      // * and \u00a3 count as part of a word, so an already-censored word is
      // never matched again from the inside ("bl**died" must not become "bl**di\u00a3d").
      const re = new RegExp("(?<![\\w*\\u00a3])(" + root + ")(" + last + ")?(" + SUFFIX + ")?(?![\\w*\\u00a3])", "gi");
      out = out.replace(re, (m, a, dbl, suf) => {
        if (dbl && !suf) return m;                      // "stabb" is not a word
        if (CENSOR_MARK.test(m)) return m;
        return matchCase(m, r.to + (dbl || "") + (suf || ""));
      });

      // rape -> raping, abuse -> abusing, torture -> torturing: the e drops.
      if (r.from.endsWith("e") && r.from.length >= 4 && !/\s/.test(r.from)) {
        const stem = r.from.slice(0, -1);
        let mask = r.to.slice(0, -1);
        if (!CENSOR_MARK.test(mask)) mask = autoMask(stem);
        const re2 = new RegExp("(?<![\\w*\\u00a3])(" + escRe(stem) + ")(ing|ings|ist|ists|er|ers|al|ally|ive|ively)(?![\\w*\\u00a3])", "gi");   // abuse -> abusive
        out = out.replace(re2, (m, a, suf) => CENSOR_MARK.test(m) ? m : matchCase(m, mask + suf));
      }
    }
    return out;
  }

  // Inside a hashtag words run together (#murdermystery), so match roots as
  // substrings — but only longer ones, and never inside a known safe word.
  function censorTag(tag, rules) {
    let body = tag.slice(1);
    const low0 = body.toLowerCase();
    const safe = new Array(body.length).fill(false);
    TAG_SAFE.forEach(w => {
      let i = low0.indexOf(w);
      while (i !== -1) { for (let k = i; k < i + w.length; k++) safe[k] = true; i = low0.indexOf(w, i + 1); }
    });

    for (const r of rules) {
      if (r.from.length < 4 || /\s/.test(r.from)) continue;
      const rep = r.to.length === r.from.length ? r.to : autoMask(r.from);
      let i = body.toLowerCase().indexOf(r.from);
      while (i !== -1) {
        const seg = body.slice(i, i + r.from.length);
        let blocked = CENSOR_MARK.test(seg);
        for (let k = i; !blocked && k < i + r.from.length; k++) if (safe[k]) blocked = true;
        if (!blocked) body = body.slice(0, i) + matchCase(seg, rep) + body.slice(i + r.from.length);
        i = body.toLowerCase().indexOf(r.from, i + 1);
      }
    }
    return "#" + body;
  }

  function applyCensor(text, mapText) {
    const rules = censorRules(mapText);
    let out = censorWords(String(text || ""), rules);
    out = out.replace(/#[\p{L}\p{N}_]+/gu, (t) => censorTag(t, rules));
    return out;
  }

  // Words that carry no emphasis. They may sit inside a highlighted span
  // ("BROKE INTO THE HOME") but never begin or end one.
  const FUNCTION_WORDS = new Set(`a an the and or but of to in on at for with from by as
    is was were are be been being am has have had it its he she they them his her their
    that which who whom whose this these those than so if when while after before about
    not no nor yet then will would shall can could may might must do does did what where
    how there here we you my your our`.trim().split(/\s+/));

  // A highlight must not run across a clause join. "OUT OF THE WAY AS FLIGHT
  // ATTENDANTS PUSH" is two ideas; a designer would never paint it as one.
  const CLAUSE_WORDS = new Set(`and but as when while after before that which who where
    because if until though although then yet however instead despite since whose
    she he they it we`.trim().split(/\s+/));

  // The twist usually lands just after one of these.
  const PIVOTS = new Set(`but yet however instead despite though although until then only
    now suddenly finally still even after before because since`.trim().split(/\s+/));

  // Named things read as important even when the whole line is capitalised,
  // where letter case gives nothing away.
  const ENTITIES = new Set(`tsa fbi cia nasa faa ntsb doj dhs cdc irs fda sec epa
    nypd lapd ceo cfo coo cto cbs nbc abc bbc cnn nfl nba mlb nhl fifa nato eu un ufc
    delta united frontier spirit southwest jetblue alaska ryanair easyjet lufthansa
    emirates qatar boeing airbus embraer tesla spacex amazon google apple meta netflix
    disney walmart microsoft nvidia openai twitter facebook instagram tiktok youtube uber
    precheck congress senate parliament pentagon`.trim().split(/\s+/));

  const STRENGTH = {
    light:  { cover: 0.30, min: 2, max: 3 },
    medium: { cover: 0.45, min: 3, max: 5 },
    heavy:  { cover: 0.62, min: 4, max: 8 }
  };

  // Prepositions that always take an object. A highlight ending on one reads as
  // cut off — "BROKE INTO" instead of "BROKE INTO THE HOME". Particles that can
  // legitimately close a phrase (out, up, down, over, off) are not in here.
  const DANGLERS = new Set(`into onto of to in on at for with from by as than
    the a an and or but`.trim().split(/\s+/));

  const MAX_SPAN = 6;

  function autoPick() {
    const idx = state.tokens.map((t, i) => ({ t, i })).filter(x => x.t.word);
    idx.forEach(x => x.t.color = null);
    const N = idx.length;
    if (!N) { buildPhrases(); return; }

    const core = idx.map(x => coreOf(x.t));
    const plain = idx.map(x => x.t.t).join(" ");
    const allCaps = plain === plain.toUpperCase();

    /* --- atoms: runs that must never be split --- */
    const atoms = [];
    const quoteAtoms = [];

    // Quoted material, however long. An opening mark with no closing mark runs
    // to the end of the line, which is how headlines often quote.
    let open = -1;
    idx.forEach((x, k) => {
      const hasOpen = /^["\u201C]/.test(x.t.t);
      const hasClose = /["\u201D]/.test(x.t.t.slice(hasOpen ? 1 : 0));
      if (open === -1 && hasOpen) { open = k; if (hasClose && k > open) { quoteAtoms.push([open, k]); open = -1; } return; }
      if (open !== -1 && /["\u201D]/.test(x.t.t)) { quoteAtoms.push([open, k]); open = -1; }
    });
    if (open !== -1) quoteAtoms.push([open, N - 1]);
    quoteAtoms.forEach(q => atoms.push(q));

    // A quantity and the thing it counts belong together: "15 YEARS", "$44 MILLION".
    const isNum = (c) => /[\d$\u00a3\u20ac%]/.test(c);
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

    /* --- per-word weight --- */
    const inQuote = new Set();
    quoteAtoms.forEach(([a, b]) => { for (let k = a; k <= b; k++) inQuote.add(k); });

    const afterPivot = new Set();
    let pivotAt = -1;
    idx.forEach((x, k) => {
      if (!PIVOTS.has(core[k])) return;
      if (pivotAt === -1) pivotAt = k;
      for (let q = k + 1; q <= Math.min(k + 4, N - 1); q++) afterPivot.add(q);
    });

    const score = idx.map((x, k) => {
      const c = core[k];
      if (!c || FUNCTION_WORDS.has(c)) return 0;
      let s = 2;
      if (isNum(c)) s += 5;
      if (TRIGGERS.includes(c)) s += 4;
      if (ENTITIES.has(c)) s += 4;
      if (inQuote.has(k)) s += 5;
      if (afterPivot.has(k)) s += 2;
      if (c.length > 7) s += 1;
      if (k >= N - 3) s += 1;                                   // the payoff usually lands last
      const bare = x.t.t.replace(/[^A-Za-z]/g, "");
      if (!allCaps && bare.length >= 2 && bare.length <= 5 && bare === bare.toUpperCase()) s += 3;
      else if (!allCaps && k > 0 && /^[A-Z]/.test(x.t.t)) s += 2;
      return s;
    });

    // A span may end on a word carrying a comma, but never run past one.
    const breakAfter = new Set();
    idx.forEach((x, k) => { if (/[,;:.!?\u2014\u2013]["\u201D')\]]?$/.test(x.t.t)) breakAfter.add(k); });

    /* --- candidates --- */
    const cands = [];
    for (let a = 0; a < N; a++) {
      if (!score[a] || !edgeOk(a, true) || DANGLERS.has(core[a])) continue;
      for (let b = a; b < Math.min(a + MAX_SPAN, N); b++) {
        // Never swallow a clause join.
        if (b > a && CLAUSE_WORDS.has(core[b])) break;
        if (score[b] && edgeOk(b, false) && !DANGLERS.has(core[b])) {
          let sum = 0;
          for (let k = a; k <= b; k++) sum += score[k];
          const len = b - a + 1;
          let s = sum / Math.pow(len, 0.45) - (len === 1 ? 1.5 : 0);
          if (afterPivot.has(a)) s += 2;                        // sits in the twist
          if (b === N - 1) s += 1.5;                            // closes the line
          cands.push({ a, b, s });
        }
        if (breakAfter.has(b)) break;
      }
    }
    cands.sort((x, y) => y.s - x.s);

    /* --- selection --- */
    const cfg = STRENGTH[state.strength] || STRENGTH.medium;
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

    // Quotes are never a judgement call — the whole quote is always coloured.
    quoteAtoms.forEach(([a, b]) => { if (free({ a, b })) claim({ a, b, s: 99 }); });

    const contentCount = score.filter(s => s > 0).length || N;

    // Greedy, but re-scored each round so the picks spread out and don't repeat
    // the same word twice — that's the difference between this and a ranked list.
    while (taken.length < cfg.max) {
      if (taken.length >= cfg.min && covered / contentCount >= cfg.cover) break;
      let best = null, bestS = -Infinity;
      for (const c of cands) {
        if (!free(c)) continue;
        let s = c.s;
        let repeats = 0;
        for (let k = c.a; k <= c.b; k++) if (core[k] && usedWords.has(core[k])) repeats++;
        s -= repeats * 3;                                       // don't say the same thing twice
        const mid = (c.a + c.b) / 2;
        for (const t of taken) if (Math.abs(mid - (t.a + t.b) / 2) / N < 0.18) s -= 2.5;
        if (s > bestS) { bestS = s; best = c; }
      }
      if (!best) break;
      claim(best);
    }

    // If the line turns on a pivot, make sure something after it is coloured.
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

    taken.forEach(c => { for (let k = c.a; k <= c.b; k++) idx[k].t.color = state.active; });
    buildPhrases();
  }

  function buildPhrases() {
    const out = [];
    let cur = null;
    for (const tok of state.tokens) {
      if (tok.word && tok.color) {
        if (cur && cur.color === tok.color) cur.parts.push(tok.t);
        else { if (cur) out.push(cur); cur = { color: tok.color, parts: [tok.t], first: tok }; }
      } else if (tok.word) {
        if (cur) { out.push(cur); cur = null; }
      }
      // whitespace between two colored words keeps the span open
    }
    if (cur) out.push(cur);

    // Where each phrase starts in the headline, so that a repeated word or
    // number is coloured at the copy you picked, not the first one found.
    const full = normHL(state.text);
    state.phrases = out.map(p => {
      const text = p.parts.join(" ").replace(/[,;:]+$/, "");
      const needle = normHL(text).trim();
      const startTok = state.tokens.indexOf(p.first);
      const before = normHL(state.tokens.slice(0, startTok).map(t => t.t).join(""));
      const occ = wholeMatches(full, needle).filter(i => i < before.length).length;
      return { text, color: p.color, occ };
    });
    if (state.cursor >= state.phrases.length) state.cursor = -1;
  }

  /* ---------- async helpers ---------- */

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function waitFor(fn, timeout = 2200, step = 90) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function sameColor(cssColor, hex) {
    const m = String(cssColor).match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return false;
    const [r, g, b] = hexToRgb(hex);
    return Math.abs(+m[1] - r) < 4 && Math.abs(+m[2] - g) < 4 && Math.abs(+m[3] - b) < 4;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  /* ---------- canva bridge ---------- */

  function findEditable() {
    const els = [...document.querySelectorAll('[contenteditable="true"]')];
    const vis = els.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 16 && r.height > 8 && (el.innerText || "").trim().length > 0;
    });
    vis.sort((a, b) => (b.innerText || "").length - (a.innerText || "").length);
    return vis[0] || null;
  }

  /* ---------- finding the right copy of a phrase ---------- */

  const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
  const normHL = (t) => String(t || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").toLowerCase();

  // Every place the phrase appears as whole words. "5" is not found inside
  // "50", and "man" is not found inside "woman".
  function wholeMatches(hay, needle) {
    const out = [];
    if (!needle) return out;
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const okStart = !isWordChar(needle[0]) || !isWordChar(hay[i - 1]);
      const okEnd = !isWordChar(needle[needle.length - 1]) || !isWordChar(hay[i + needle.length]);
      if (okStart && okEnd) out.push(i);
      i = hay.indexOf(needle, i + 1);
    }
    return out;
  }

  // Which copy to use: the one you picked, or the nearest there is.
  function pickCopy(hay, needle, occ) {
    const all = wholeMatches(hay, needle);
    if (all.length) return all[Math.min(Math.max(occ || 0, 0), all.length - 1)];
    return hay.indexOf(needle);        // last resort, as before
  }

  function selectPhrase(phrase, occ) {
    const root = findEditable();
    if (!root) return { ok: false, why: "No text box is open. Double-click your caption in Canva first." };

    const nodes = [];
    let full = "";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      nodes.push({ n, start: full.length, end: full.length + n.nodeValue.length });
      full += n.nodeValue;
    }
    if (!full.length) return { ok: false, why: "That text box looks empty." };

    // Normalize whitespace but keep a map back to the original offsets.
    let norm = "", map = [];
    for (let i = 0; i < full.length; i++) {
      const ch = full[i].replace(/\u00a0/g, " ");
      if (/\s/.test(ch)) {
        if (norm.endsWith(" ")) continue;
        norm += " "; map.push(i);
      } else { norm += ch; map.push(i); }
    }

    const needle = phrase.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const at = pickCopy(norm.toLowerCase(), needle, occ);
    if (at === -1) return { ok: false, why: "Couldn't find that phrase in the open text box." };

    const oStart = map[at];
    const oEnd = map[at + needle.length - 1] + 1;
    const find = (off, isEnd) => {
      for (const e of nodes) {
        if (isEnd ? (off > e.start && off <= e.end) : (off >= e.start && off < e.end))
          return { node: e.n, offset: off - e.start };
      }
      const last = nodes[nodes.length - 1];
      return { node: last.n, offset: last.n.nodeValue.length };
    };

    const s = find(oStart, false), e = find(oEnd, true);
    try {
      root.focus();
      const range = document.createRange();
      range.setStart(s.node, s.offset);
      range.setEnd(e.node, e.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      root.dispatchEvent(new Event("select", { bubbles: true }));
      document.dispatchEvent(new Event("selectionchange"));
      root.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }));
    } catch (err) {
      return { ok: false, why: "Canva blocked the selection. Try clicking into the text box again." };
    }
    return { ok: true };
  }

  /* ---------- strategy A: styled paste ---------- */

  function neighborColor(i) {
    // Whitespace sitting between two words of the same color belongs to that run.
    let a = null, b = null;
    for (let j = i - 1; j >= 0; j--) if (state.tokens[j].word) { a = state.tokens[j].color; break; }
    for (let j = i + 1; j < state.tokens.length; j++) if (state.tokens[j].word) { b = state.tokens[j].color; break; }
    return a && a === b ? a : null;
  }

  function buildHtml() {
    const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let out = "", cur = null;
    const flush = () => {
      if (!cur) return;
      const body = esc(cur.buf).replace(/\n/g, "<br>");
      const c = cur.color ? firstStop(cur.color) : (state.resetBase ? state.baseColor : null);
      out += c
        ? `<span style="color:${c};-webkit-text-fill-color:${c}">${body}</span>`
        : body;
      cur = null;
    };
    state.tokens.forEach((tk, i) => {
      const color = tk.word ? tk.color : neighborColor(i);
      if (!cur || cur.color !== color) { flush(); cur = { color, buf: "" }; }
      cur.buf += tk.t;
    });
    flush();
    // Inline only. Wrapping this in a block made Canva add an empty line after
    // the headline when it was pasted.
    return out;
  }

  function selectAllIn(root) {
    const range = document.createRange();
    range.selectNodeContents(root);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function strategyPaste(log) {
    const root = findEditable();
    if (!root) return { ok: false, why: "No text box is open." };

    const html = buildHtml();
    const plain = state.text;
    const before = root.innerHTML;

    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      })]);
      log("Colored text put on the clipboard.");
    } catch (e) {
      log("Clipboard write refused by the browser.");
    }

    root.focus();
    selectAllIn(root);
    await sleep(60);

    const dt = new DataTransfer();
    dt.setData("text/html", html);
    dt.setData("text/plain", plain);
    root.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: dt, bubbles: true, cancelable: true
    }));

    await sleep(700);
    const after = findEditable();
    const changed = after && after.innerHTML !== before && /color\s*:/i.test(after.innerHTML);
    if (changed) return { ok: true, how: "styled paste" };
    return { ok: false, why: "Canva ignored the synthetic paste.", pasteReady: true };
  }

  /* ---------- strategy B: drive Canva's own toolbar ---------- */

  // Everything below must ignore the extension's own panel — its swatches carry
  // the exact colors we're hunting for, so an unscoped search clicks itself.
  const mine = (el) => !!(el && el.closest && el.closest(".hh-root"));
  const notMine = (el) => !mine(el);

  // A container only counts as the Text color panel if it carries one of the
  // panel's own section headings. Without this check the Elements tab's search
  // box satisfied the "panel found" test, and the tool typed hex codes into it.
  function isColorPanel(el) {
    if (!el) return false;
    const labels = el.querySelectorAll("div,span,h1,h2,h3,h4,h5,p");
    for (let i = 0; i < labels.length; i++) {
      const e = labels[i];
      if (e.childElementCount) continue;
      if (/^(text colou?rs?|colou?rs in this design|brand kit|document colou?rs|default solid colou?rs|photo colou?rs)$/i
        .test((e.textContent || "").trim())) return true;
    }
    return false;
  }

  function findColorPanel() {
    const seeds = [];

    // Canva's hex hint is unmistakable: Try "blue" or "#00c4cc"
    [...document.querySelectorAll("input")].forEach(i => {
      if (!notMine(i) || !visible(i)) return;
      if (/#[0-9a-f]{3,8}|try\s*["\u201c']?\s*blue/i.test(i.placeholder || "")) seeds.push(i);
    });

    [...document.querySelectorAll("div,span,h1,h2,h3,h4,h5,p")].forEach(e => {
      if (!notMine(e) || !visible(e) || e.childElementCount) return;
      if (/^text colou?rs?$/i.test((e.textContent || "").trim())) seeds.push(e);
    });

    for (const seed of seeds) {
      let n = seed;
      for (let i = 0; i < 10 && n.parentElement; i++) {
        n = n.parentElement;
        const r = n.getBoundingClientRect();
        if (r.height > 160 && r.width > 160 && isColorPanel(n)) return n;
      }
    }
    return null;
  }

  function findColorButton() {
    const btns = [...document.querySelectorAll('button,[role="button"]')]
      .filter(b => notMine(b) && visible(b) && safeToClick(b));
    const score = (b) => {
      const l = ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "")).toLowerCase();
      if (/text colou?r/.test(l)) return 3;
      if (/font colou?r/.test(l)) return 2;
      if (/^colou?r$/.test(l.trim())) return 1;
      return 0;
    };
    return btns.map(b => ({ b, s: score(b) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s).map(x => x.b)[0] || null;
  }

  // Nothing that can navigate is ever a click target. An anchor in this list is
  // how a swatch search ended up clicking a sidebar link and leaving the editor.
  function safeToClick(el) {
    if (!el || mine(el)) return false;
    // Links, navigation and the top bar are what sent the editor to the home
    // page. Canva's side panels (Position, Text color, Edit image) live in an
    // <aside>, and blocking that shut the tool out of the panels it needs.
    if (el.closest('a,[href],nav,header,[role="navigation"],[role="link"],[role="menuitem"]')) return false;
    return true;
  }

  function clickable(n) {
    const c = n.closest('button,[role="button"],[role="radio"],[role="option"],[tabindex]') || n;
    return safeToClick(c) ? c : null;
  }

  // Canva's swatches are not always <button>, so match on shape and background
  // across every node in the panel rather than on a tag whitelist.
  function findSwatch(color) {
    // Scoped to the open colour panel only. Falling back to document.body made
    // every coloured pixel on the page a candidate click target.
    const scope = findColorPanel();
    if (!scope) return null;
    const all = [...scope.querySelectorAll("*")].filter(n => notMine(n) && visible(n));

    if (isGrad(color)) {
      const want = gradStops(color);
      for (const n of all) {
        const r = n.getBoundingClientRect();
        if (r.width < 10 || r.width > 72) continue;
        const lbl = (n.getAttribute("aria-label") || n.getAttribute("title") || "");
        const inLabel = parseHexes(lbl);
        const inBg = rgbsIn(getComputedStyle(n).backgroundImage || "");
        const has = (arr) => want.every(w => arr.some(h => h.toUpperCase() === w));
        if (has(inLabel) || has(inBg)) { const c = clickable(n); if (c) return c; }
      }
      return null;
    }

    const hex = color;
    for (const n of all) {
      const lbl = ((n.getAttribute("aria-label") || "") + (n.getAttribute("title") || ""))
        .toLowerCase().replace(/\s/g, "");
      if (lbl && lbl.includes(hex.toLowerCase())) { const c = clickable(n); if (c) return c; }
    }
    for (const n of all) {
      const r = n.getBoundingClientRect();
      if (r.width < 10 || r.width > 72 || r.height < 10 || r.height > 72) continue;
      if (Math.abs(r.width - r.height) > 12) continue;          // swatches are round or square
      if (sameColor(getComputedStyle(n).backgroundColor, hex)) { const c = clickable(n); if (c) return c; }
    }
    for (const n of all) {                                      // svg-filled swatches
      if (n.tagName && n.tagName.toLowerCase() === "path" || n.tagName === "rect" || n.tagName === "circle") {
        if (sameColor(n.getAttribute("fill") || "", hex)) { const c = clickable(n.parentElement || n); if (c) return c; }
      }
    }
    return null;
  }

  function findSearchField() {
    const scope = findColorPanel();
    if (!scope) return null;
    return [...scope.querySelectorAll("input")]
      .filter(i => notMine(i) && visible(i))
      .find(i => {
        const p = ((i.placeholder || "") + " " + (i.getAttribute("aria-label") || "")).toLowerCase();
        return p.includes("#") || p.includes("blue") || p.includes("hex");
      }) || null;
  }

  function findAddColorButton() {
    const scope = findColorPanel();
    if (!scope) return null;
    const btns = [...scope.querySelectorAll('button,[role="button"]')]
      .filter(b => notMine(b) && visible(b) && safeToClick(b));

    const labelled = btns.find(b => /add a new colou?r|custom colou?r|new colou?r|add colou?r|pick a colou?r/i
      .test((b.getAttribute("aria-label") || b.getAttribute("title") || "")));
    if (labelled) return labelled;

    // Canva's add button is a small rainbow circle with no useful label. Match
    // it by shape plus a multi-stop gradient background.
    return btns.find(b => {
      const r = b.getBoundingClientRect();
      if (r.width < 16 || r.width > 60 || Math.abs(r.width - r.height) > 8) return false;
      const bi = getComputedStyle(b).backgroundImage || "";
      if (!/gradient/i.test(bi)) {
        const kid = b.querySelector("*");
        if (!kid) return false;
        return /gradient/i.test(getComputedStyle(kid).backgroundImage || "")
          && rgbsIn(getComputedStyle(kid).backgroundImage).length >= 4;
      }
      return rgbsIn(bi).length >= 4;
    }) || null;
  }

  function findHexInput() {
    const scope = findColorPanel() || document.body;
    return [...scope.querySelectorAll('input')]
      .filter(i => notMine(i) && visible(i))
      .find(i => {
        const p = ((i.placeholder || "") + " " + (i.getAttribute("aria-label") || "")).toLowerCase();
        return p.includes("hex") || /^#?[0-9a-f]{6}$/i.test((i.value || "").trim());
      }) || null;
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Last line of defence. While the tool is dispatching synthetic clicks, any
  // attempt to follow a link or unload the page is cancelled outright.
  let clicking = false;

  document.addEventListener("click", (e) => {
    if (!clicking) return;
    const a = e.target && e.target.closest && e.target.closest('a[href],[role="link"]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener("beforeunload", (e) => {
    if (!clicking) return;
    e.preventDefault();
    e.returnValue = "";
  });

  async function guardNav(fn) {
    clicking = true;
    try { return await fn(); }
    finally { setTimeout(() => { clicking = false; }, 400); }
  }

  function realClick(el) {
    if (!safeToClick(el)) return false;
    clicking = true;
    setTimeout(() => { clicking = false; }, 400);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    try { el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, isPrimary: true })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    try { el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, isPrimary: true })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    return true;
  }

  // Never gate on identifying the panel container — just wait for something
  // inside it that we can actually act on.
  async function ensurePanelOpen(hex, log) {
    const ready = () => findColorPanel();
    if (ready()) return true;

    const btn = findColorButton();
    if (!btn) return false;

    // The colour panel takes over the sidebar, so an open Elements or Templates
    // tab just gets replaced. One retry covers the toggle closing it instead.
    for (let attempt = 0; attempt < 2; attempt++) {
      realClick(btn);
      const got = await waitFor(ready, 2200);
      if (got) { log("Opened Canva's text color panel."); return true; }
      await sleep(250);
    }
    return false;
  }

  async function applyColorViaToolbar(hex, phrase, log, occ) {
    if (!(await ensurePanelOpen(hex, log))) {
      return { ok: false, why: "Couldn't open Canva's text color panel." };
    }

    let sw = findSwatch(hex);
    let via = "panel swatch";

    // Type the hex into the panel's search box and take what comes back.
    if (!sw) {
      const search = isGrad(hex) ? null : findSearchField();
      if (search) {
        search.focus();
        setNativeValue(search, hex);
        search.dispatchEvent(new KeyboardEvent("keyup", { key: "c", bubbles: true }));
        sw = await waitFor(() => findSwatch(hex), 1600);
        if (!sw) {
          search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13, which: 13 }));
          search.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true, keyCode: 13, which: 13 }));
          sw = await waitFor(() => findSwatch(hex), 2200);
        }
        if (sw) via = "panel search";
      }
    }

    // Open the custom color dialog and enter the hex there.
    if (!sw && !isGrad(hex)) {
      const add = findAddColorButton();
      if (add) {
        realClick(add);
        const input = await waitFor(findHexInput, 2000);
        if (input) {
          input.focus();
          setNativeValue(input, hex.replace("#", ""));
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13, which: 13 }));
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true, keyCode: 13, which: 13 }));
          await sleep(500);
          sw = findSwatch(hex);
          via = "custom hex";
          if (!sw) return { ok: true, via };
        }
      }
    }

    if (!sw) return {
      ok: false,
      why: isGrad(hex)
        ? "That gradient isn't in Canva's Text color panel. Apply it to any text once so Canva remembers it, then run again."
        : hex + " isn't in the panel and no hex field opened."
    };

    // Only re-assert the selection if the panel actually dropped it — refocusing
    // the text box unnecessarily can close the panel we just opened.
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (phrase) selectPhrase(phrase, occ);
      else { const ed = findEditable(); if (ed) { ed.focus(); selectAllIn(ed); } }
      await sleep(110);
      sw = findSwatch(hex) || sw;
    }
    realClick(sw);
    await sleep(300);
    return { ok: true, via };
  }

  // Reads back what the text box is actually rendering, so the base pass can
  // report the truth instead of assuming the click landed.
  function boxColorTally() {
    const ed = findEditable();
    const tally = {};
    if (!ed) return tally;
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!(n.nodeValue || "").trim()) continue;
      const p = n.parentElement;
      if (!p) continue;
      const c = normalizeHex(getComputedStyle(p).color);
      if (!c) continue;
      tally[c] = (tally[c] || 0) + n.nodeValue.trim().length;
    }
    return tally;
  }

  function mostlyBase(min) {
    const t = boxColorTally();
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    if (!total) return false;
    const want = (state.baseColor || "#FFFFFF").toUpperCase();
    return (t[want] || 0) / total > (min || 0.6);
  }

  function findBaseSwatch(hex) {
    const direct = findSwatch(hex);
    if (direct) return direct;
    // White and black are usually labelled by name rather than by hex.
    const named = { "#FFFFFF": /\bwhite\b/i, "#000000": /\bblack\b/i }[hex.toUpperCase()];
    if (!named) return null;
    const scope = findColorPanel();
    if (!scope) return null;
    return [...scope.querySelectorAll('button,[role="button"],[role="radio"],[role="option"]')]
      .filter(n => notMine(n) && visible(n) && safeToClick(n))
      .find(n => named.test(n.getAttribute("aria-label") || n.getAttribute("title") || "")) || null;
  }

  async function applyBaseColor(log, force) {
    const hex = state.baseColor || "#FFFFFF";
    const ed = findEditable();
    if (!ed) return false;

    if (!force && mostlyBase()) { log("Headline is already " + hex + "."); return true; }

    if (!(await ensurePanelOpen(hex, log))) {
      log("Couldn't open the color panel to reset the headline.");
      return false;
    }

    let sw = findBaseSwatch(hex);
    if (!sw) {
      const search = findSearchField();
      if (search) {
        search.focus();
        setNativeValue(search, hex);
        sw = await waitFor(() => findBaseSwatch(hex), 2000);
      }
    }
    if (!sw) {
      log("Couldn't find " + hex + " in Canva's color panel. Add it there once and it will stick.");
      return false;
    }

    // Re-select every time: opening the panel can drop the selection, and a
    // half-selected box gets half-reset.
    ed.focus();
    selectAllIn(ed);
    await sleep(140);
    realClick(sw);
    await sleep(420);

    const bar = force ? 0.95 : 0.6;
    if (mostlyBase(bar)) { log("Reset the whole headline to " + hex + "."); return true; }

    // One retry — the first click sometimes only focuses the panel.
    const ed2 = findEditable();
    if (ed2) {
      ed2.focus();
      selectAllIn(ed2);
      await sleep(160);
      const again = findBaseSwatch(hex);
      if (again) realClick(again);
      await sleep(420);
    }
    if (mostlyBase(bar)) { log("Reset the whole headline to " + hex + " (second try)."); return true; }

    log("Tried to reset the headline to " + hex + " but the text didn't change.");
    return false;
  }

  async function strategyToolbar(log, only) {
    const list = state.phrases.map((p, i) => ({ p, i }))
      .filter(x => !only || only.includes(x.i));
    let done = 0;

    // Canva keeps whatever colour was last applied, so a fresh paste can come out
    // entirely in the highlight colour. Flatten the line first, then paint.
    if (state.resetBase && !only) {
      await applyBaseColor(log);
      await sleep(220);
    }

    for (const { p, i } of list) {
      state.cursor = i;
      renderList();

      const sel = selectPhrase(p.text, p.occ);
      if (!sel.ok) { log("Skipped “" + short(p.text) + "” — " + sel.why); continue; }
      await sleep(150);

      const res = await applyColorViaToolbar(p.color, p.text, log, p.occ);
      if (!res.ok) {
        log("Stopped at “" + short(p.text) + "” — " + res.why);
        log(diag(p.color));
        break;
      }
      done++;
      log("Colored “" + short(p.text) + "” via " + res.via + ".");
      await sleep(220);
    }

    state.cursor = -1;
    renderList();
    if (done === 0) return { ok: false, why: "The toolbar route applied nothing." };
    return { ok: true, how: done + " of " + list.length + " via the color panel" };
  }

  const short = (s) => s.length > 26 ? s.slice(0, 24) + "…" : s;

  function diag(color) {
    const yn = (v) => v ? "yes" : "no";
    const hex = color;
    return "Found — button " + yn(findColorButton())
      + ", panel " + yn(findColorPanel())
      + ", swatch " + yn(findSwatch(hex))
      + ", search " + yn(findSearchField())
      + ", add-color " + yn(findAddColorButton());
  }

  /* ---------- did the color actually land? ---------- */

  // Reads the colour of every character in the text box and checks both halves
  // of the job: each phrase in its highlight colour, and everything else in the
  // base colour. Checking only the phrases let "the whole line is gold" pass.
  function colorAudit() {
    const ed = findEditable();
    if (!ed) return null;
    const base = (state.baseColor || "#FFFFFF").toUpperCase();

    const chars = [];
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const p = n.parentElement;
      const c = p ? normalizeHex(getComputedStyle(p).color) : null;
      for (const ch of n.nodeValue || "") chars.push({ ch, c });
    }

    let norm = "";
    const map = [];
    chars.forEach((o, i) => {
      const ch = o.ch === "\u00a0" ? " " : o.ch;
      if (/\s/.test(ch)) { if (!norm || norm.endsWith(" ")) return; norm += " "; map.push(i); }
      else { norm += ch.toLowerCase(); map.push(i); }
    });

    const owner = new Array(chars.length).fill(-1);
    const phrases = state.phrases.map((p, pi) => {
      const needle = p.text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const at = pickCopy(norm, needle, p.occ);
      if (at === -1) return { found: false, ok: false };
      const want = firstStop(p.color).toUpperCase();
      let hit = 0, tot = 0;
      for (let k = at; k < at + needle.length; k++) {
        const ci = map[k];
        if (/\s/.test(chars[ci].ch)) continue;
        owner[ci] = pi;
        tot++;
        // Gradient text has no single colour to read; "not the base" is the tell.
        if (isGrad(p.color) ? chars[ci].c !== base : chars[ci].c === want) hit++;
      }
      return { found: true, ok: tot > 0 && hit / tot >= 0.8 };
    });

    let rest = 0, restBase = 0;
    const wrong = {};
    chars.forEach((o, i) => {
      if (owner[i] !== -1 || /\s/.test(o.ch)) return;
      rest++;
      if (o.c === base) restBase++;
      else if (o.c) wrong[o.c] = (wrong[o.c] || 0) + 1;
    });
    const top = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
    return { phrases, restFrac: rest ? restBase / rest : 1, restWrong: top ? top[0] : null };
  }

  function uncoloredPhrases() {
    const a = colorAudit();
    if (!a) return state.phrases.map((_, i) => i);
    return a.phrases.map((r, i) => (r.ok ? -1 : i)).filter(i => i >= 0);
  }


  /* ---------- caption builder ---------- */

  // One keyword is not evidence. "anti-aircraft weapons" in a story about
  // demolished statues fired the aviation rule; a topic now needs two distinct hits.
  const TAG_RULES = [
    { tags: ["#aviation", "#avgeek"], words: ["flight", "airline", "airplane", "aircraft",
      "pilot", "airport", "boeing", "airbus", "turbulence", "cockpit", "runway", "fuselage",
      "takeoff", "landing", "air traffic", "jet"] },
    { tags: ["#truecrime", "#crimestory"], words: ["murd", "k*ll", "kill", "st*b", "stab",
      "arrest", "police", "court", "sentenc", "convict", "victim", "fbi", "serial",
      "detective", "prison", "trial", "suspect", "homicide"] },
    { tags: ["#hollywood", "#movietrivia"], words: ["actor", "actress", "film", "movie",
      "hollywood", "singer", "celebrity", "oscar", "netflix", "sequel", "director",
      "premiere", "box office", "screen"] },
    { tags: ["#business", "#moneystory"], words: ["billionaire", "ceo", "startup", "founder",
      "fortune", "investor", "shares", "revenue", "acquisition", "bankrupt"] },
    { tags: ["#heartwarming", "#truestory"], words: ["rescue", "adopt", "orphan", "wedding",
      "grandma", "grandpa", "nurse", "stranger", "donat", "kindness", "reunit", "foster"] },
    { tags: ["#history", "#historyfacts"], words: ["century", "ancient", "historic", "medieval",
      "monument", "ruins", "archaeolog", "dynasty", "empire", "excavat", "artifact", "1900s"] }
  ];

  function detectTags(text) {
    const low = text.toLowerCase();
    const out = [];
    for (const rule of TAG_RULES) {
      const hits = rule.words.filter(w => low.includes(w)).length;
      if (hits >= 2) rule.tags.forEach(t => out.push(t));
    }
    return out;
  }

  const TAG_RE = /#[\p{L}\p{N}_]+/gu;

  function buildTags(text, srcTags) {
    if (state.tagMode === "none") return [];
    const uniq = [];
    const add = (arr) => arr.forEach(t => {
      if (!uniq.some(u => u.toLowerCase() === t.toLowerCase())) uniq.push(t);
    });

    if (state.tagMode === "keep" || state.tagMode === "both") add(srcTags);
    // Only invent tags when asked to, or when the paste had none of its own.
    if (state.tagMode === "suggest" || state.tagMode === "both"
      || (state.tagMode === "keep" && !srcTags.length)) add(detectTags(text));
    add(state.tags.split(/[\s,]+/).filter(t => t.startsWith("#")));

    return uniq.slice(0, 10);
  }

  function sentencesOf(s) {
    return (s.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [s]).map(x => x.trim()).filter(Boolean);
  }

  // Greedy splitting front-loads the first paragraph. This balances them by
  // minimising how far each block lands from the average length.
  function splitParagraphs(s, n) {
    const sents = sentencesOf(s);
    if (sents.length <= n) return sents;

    const len = sents.map(x => x.length + 1);
    const pre = [0];
    len.forEach((l, i) => pre.push(pre[i] + l));
    const span = (a, b) => pre[b] - pre[a];
    const target = pre[sents.length] / n;
    const cost = (a, b) => Math.pow(span(a, b) - target, 2);

    const N = sents.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(Infinity));
    const cut = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(0));
    dp[0][0] = 0;
    for (let g = 1; g <= n; g++) {
      for (let i = g; i <= N; i++) {
        for (let j = g - 1; j < i; j++) {
          const v = dp[g - 1][j] + cost(j, i);
          if (v < dp[g][i]) { dp[g][i] = v; cut[g][i] = j; }
        }
      }
    }

    const bounds = [N];
    for (let g = n, i = N; g > 0; g--) { i = cut[g][i]; bounds.unshift(i); }
    const out = [];
    for (let k = 0; k < n; k++) out.push(sents.slice(bounds[k], bounds[k + 1]).join(" ").trim());
    return out.filter(Boolean);
  }

  // "# Heading" (hash then space) is a markdown mark. "#truecrime" (no space)
  // is a hashtag. Only the first kind gets stripped here.
  function tidyMarks(t) {
    t = t.replace(/^\s*[-*_=]{3,}\s*$/gm, "");        // --- separator lines
    t = t.replace(/^\s{0,3}#{1,6}[ \t]+/gm, "");      // ### Heading
    t = t.replace(/^\s{0,3}>\s?/gm, "");              // > quote

    // List items carry no full stop, so stripping the marker alone would run
    // them into the next line. Close each one off.
    t = t.split("\n").map(line => {
      const m = line.match(/^\s{0,3}(?:[-*\u2022\u00b7+]|[\u2013\u2014]|\d+[.)])[ \t]+(.*)$/);
      if (!m) return line;
      let c = m[1].trim();
      if (c && !/[.!?:;,]$/.test(c)) c += ".";
      return c;
    }).join("\n");
    t = t.replace(/\*\*([^*]+)\*\*/g, "$1");          // **bold**
    t = t.replace(/__([^_]+)__/g, "$1");              // __bold__
    t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2");
    t = t.replace(/`{1,3}([^`]+)`{1,3}/g, "$1");      // `code`
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");    // [text](url)
    return t;
  }

  // Only dashes acting as a sentence break go. Hyphens inside words
  // (16-year-old, anti-aircraft) are left alone.
  function tidyDashes(t) {
    t = t.replace(/[ \t]*[\u2013\u2014][ \t]*/g, ", ");
    t = t.replace(/(\S)[ \t]+-[ \t]+(\S)/g, "$1, $2");
    t = t.replace(/,\s*,+/g, ",");
    t = t.replace(/\s+,/g, ",");
    t = t.replace(/,(\s*[.!?])/g, "$1");
    t = t.replace(/,\s*$/gm, "");
    return t;
  }

  function formatCaption(raw) {
    const srcTags = String(raw || "").match(TAG_RE) || [];
    let t = String(raw || "")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");

    if (state.tidyMarks) t = tidyMarks(t);
    if (state.tidyDashes) t = tidyDashes(t);

    // Drop common wire-copy furniture.
    t = t.replace(/^\s*by\s+[A-Z][\w.'-]+(\s+[A-Z][\w.'-]+)*\s*$/gim, "");
    t = t.replace(/^\s*\(?(reuters|ap|afp|cnn|bbc|associated press)\)?\s*[\u2014\u2013-]\s*/gim, "");
    t = t.replace(/^\s*advertisement\s*$/gim, "");
    t = t.replace(/\b(read more|click here|subscribe now|share this article|sign up)\b.*$/gim, "");
    t = t.replace(/https?:\/\/\S+/g, "");
    t = t.replace(TAG_RE, "");

    // Template labels — "HASHTAGS:", "CAPTION:", "HOOK:", "SOURCES:". These are
    // stripped after the tags come out, so an inline "HASHTAGS: #a #b" line is
    // left as a bare label and caught here too.
    t = t.replace(/^[ \t]*(hashtags?|tags?|caption|headline|title|sources?|notes?|summary|hook|story|twist|closing|cta|keywords?|description)[ \t]*:[ \t]*$/gim, "");
    // Any other all-caps label sitting on its own line.
    t = t.replace(/^[ \t]*[A-Z][A-Z0-9 \t'&/-]{0,28}:[ \t]*$/gm, "");

    // Many sources separate paragraphs with a single newline. A line that ends on
    // sentence punctuation is a paragraph break, not a wrapped line.
    t = t.replace(/([.!?]["')\]]?)[ \t]*\n(?=[ \t]*\S)/g, "$1\n\n");

    let paras = t.split(/\n{2,}/)
      .map(p => p.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim())
      .filter(Boolean);

    const n = state.paras;
    if (n !== 0 && paras.length !== n) paras = splitParagraphs(paras.join(" "), n);

    if (state.censorOn) paras = paras.map(p => applyCensor(p, state.censorMap));

    let tags = buildTags(t, srcTags).join(" ");
    if (state.censorOn && tags) tags = applyCensor(tags, state.censorMap);
    return paras.join("\n\n") + (tags ? "\n\n" + tags : "");
  }

  /* ---------- Canva Notes bridge ---------- */

  function findNotesButton() {
    return [...document.querySelectorAll('button,[role="button"]')]
      .filter(b => notMine(b) && visible(b) && safeToClick(b))
      .find(b => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        const txt = (b.textContent || "").trim().toLowerCase();
        return /\bnotes\b/.test(aria) || txt === "notes";
      }) || null;
  }

  function findNotesPanel() {
    // The "799/5000" counter is the one unmistakable marker in the Notes drawer.
    const counter = [...document.querySelectorAll("div,span,p")].find(e =>
      notMine(e) && visible(e) && e.childElementCount === 0
      && /^\d+\s*\/\s*5000$/.test((e.textContent || "").trim()));
    if (!counter) return null;
    let n = counter;
    for (let i = 0; i < 9 && n.parentElement; i++) {
      n = n.parentElement;
      const r = n.getBoundingClientRect();
      if (r.height > 200 && r.width > 180) return n;
    }
    return n;
  }

  function findNotesEditor() {
    const panel = findNotesPanel();
    if (!panel) return null;
    const cands = [...panel.querySelectorAll('[contenteditable="true"],textarea')]
      .filter(e => notMine(e) && visible(e));
    // The tallest one is the note body; the short one is the page title.
    cands.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
    return cands[0] || null;
  }

  const readEd = (ed) => (ed ? (ed.value != null ? ed.value : ed.innerText) : "") || "";

  // Compare text the way a person reads it. Canva's editors may show a space
  // as a non-breaking space and an apostrophe as a curly one; those look the
  // same but don't match character for character.
  const asRead = (t) => String(t || "").toLowerCase()
    .replace(/[\u00a0\u2007\u202f\u2009]/g, " ")
    .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201f\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ").trim();

  // The caption as a list of lines, each read the way a person reads it.
  // Blank lines between paragraphs don't count (Canva may show a paragraph
  // break as one line break or two), but where the breaks fall does: a new
  // paragraph layout is a different caption.
  const notesLines = (t) => String(t || "").replace(/\r/g, "")
    .split(/\n+/).map(asRead).filter(Boolean);

  // True only when Notes holds exactly this caption, paragraph for paragraph.
  // The old check compared just the first and last words with every line break
  // merged into a space, so a re-paragraphed caption looked "already there".
  function notesHolds(edText, text) {
    const have = notesLines(edText), want = notesLines(text);
    if (!want.length || have.length !== want.length) return false;
    return want.every((l, i) => l === have[i]);
  }

  async function sendToNotes(text, log) {
    let ed = findNotesEditor();
    if (!ed) {
      const btn = findNotesButton();
      if (!btn) return { ok: false, why: "Couldn't find the Notes button." };
      realClick(btn);
      log("Opened the Notes panel.");
      ed = await waitFor(findNotesEditor, 2800);
    }
    if (!ed) return { ok: false, why: "Notes opened but the text area didn't appear." };

    // Already there, from an earlier run or an earlier attempt: nothing to do.
    if (notesHolds(readEd(ed), text)) {
      log("Notes already has this caption.");
      return { ok: true };
    }

    if (ed.tagName === "TEXTAREA") {
      ed.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ed, text);
      ed.dispatchEvent(new Event("input", { bubbles: true }));
      ed.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const selectAll = () => {
        const e = findNotesEditor() || ed;
        e.focus();
        const range = document.createRange();
        range.selectNodeContents(e);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return e;
      };
      const landed = () => waitFor(() => notesHolds(readEd(findNotesEditor()), text), 3000, 200);

      // Way 1: a paste, the way Ctrl+V delivers it.
      let e = selectAll();
      await sleep(70);
      const html = "<div>" + text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .split("\n\n").map(p => "<p>" + p.replace(/\n/g, "<br>") + "</p>").join("") + "</div>";
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      dt.setData("text/html", html);
      e.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      if (await landed()) return { ok: true };

      // Way 2: Chrome's own insert command, which Canva sees as typing.
      log("The paste didn't land \u2014 typing it in instead.");
      e = selectAll();
      await sleep(70);
      document.execCommand("insertText", false, text);
      if (await landed()) return { ok: true };
      return { ok: false, why: "Canva didn't take the text.", pasteReady: true };
    }

    // A long caption can take a moment to land, and the editor node is often
    // replaced during the update. Poll rather than checking once.
    const ok = await waitFor(() => notesHolds(readEd(findNotesEditor()), text), 4000, 200);

    if (ok) return { ok: true };
    return { ok: false, why: "Canva didn't take the text.", pasteReady: true };
  }


  /* ---------- clearing Canva's left side panel ---------- */

  // Is one of Canva's side panels open (Elements, Templates, Notes, Position,
  // Text color...)? Probe the space just right of Canva's left icon bar: a
  // tall, panel-sized box there means yes; open workspace means no.
  function leftPanelEl() {
    const vh = window.innerHeight;
    for (const y of [vh * 0.45, vh * 0.62]) {
      for (const x of [180, 250]) {
        const t = elAt(x, y);
        if (!t || mine(t)) continue;
        let n = t;
        for (let i = 0; i < 16 && n && n !== document.body && n !== document.documentElement; i++, n = n.parentElement) {
          const r = n.getBoundingClientRect();
          if (r.height < vh * 0.45) continue;
          if (r.width >= 230 && r.width <= 640 && r.left >= 30 && r.left <= 180) return n;
          if (r.width > 640) break;          // reached the open workspace
        }
      }
    }
    return null;
  }

  const labelOfBtn = (b) => ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "")
    + " " + (b.getAttribute("aria-keyshortcuts") || "")).trim();

  // Panel controls live inside Canva's <aside> and <nav>, which the general
  // click guard refuses. These few are allowed; links never are, because a link
  // is what sent the editor back to the home page once.
  const uiSafe = (el) => !!el && !mine(el) && !el.closest('a,[href],[role="link"]');

  function uiClick(el) {
    if (!uiSafe(el)) return false;
    clicking = true;
    setTimeout(() => { clicking = false; }, 400);
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    try { el.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerId: 1, isPrimary: true, buttons: 1 })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mousedown", { ...o, buttons: 1 }));
    try { el.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerId: 1, isPrimary: true })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
    return true;
  }

  const CTRLS = 'button,[role="button"],[tabindex]';

  // The panel's own close button, in its header.
  function panelCloseBtn(p) {
    const pr = p.getBoundingClientRect();
    let scope = p;
    for (let i = 0; i < 3 && scope.parentElement; i++) scope = scope.parentElement;
    return [...scope.querySelectorAll(CTRLS)]
      .filter(b => uiSafe(b) && visible(b))
      .find(b => {
        const r = b.getBoundingClientRect();
        if (r.width > 60 || r.height > 60) return false;
        if (r.left < pr.left - 10 || r.right > pr.right + 50) return false;
        if (r.top > pr.top + 140) return false;
        return /\bclose\b/i.test(labelOfBtn(b)) || /^[\u00d7\u2715\u2716]$/.test((b.textContent || "").trim());
      }) || null;
  }

  // The small tab on the panel's edge. Canva labels it "Collapse".
  function panelCollapseBtn(p) {
    const pr = p.getBoundingClientRect(), vh = window.innerHeight;
    const near = [...document.querySelectorAll(CTRLS)]
      .filter(b => uiSafe(b) && visible(b))
      .filter(b => {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return r.width <= 56 && r.height >= 18 && r.height <= 110
          && Math.abs(cx - pr.right) <= 44 && cy > vh * 0.2 && cy < vh * 0.8;
      });
    return near.find(b => /collapse|hide|close|fold/i.test(labelOfBtn(b)))
      || (near.length === 1 ? near[0] : null);
  }

  // The highlighted icon in Canva's left bar; pressing it again shuts its panel.
  function activeRailBtn() {
    return [...document.querySelectorAll('button,[role="button"],[role="tab"]')]
      .filter(b => uiSafe(b) && visible(b))
      .find(b => {
        const r = b.getBoundingClientRect();
        if (r.left > 110 || r.width > 110) return false;
        return b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-selected") === "true"
          || b.getAttribute("aria-current") === "true" || b.getAttribute("aria-current") === "page";
      }) || null;
  }

  // Canva's own shortcut for the side panel. Sent once, to the page itself,
  // never to a text box, so it can't type a slash into your headline.
  function sendPanelShortcut() {
    const o = { key: "/", code: "Slash", keyCode: 191, which: 191, ctrlKey: true, bubbles: true, cancelable: true };
    const t = document.body;
    t.dispatchEvent(new KeyboardEvent("keydown", o));
    t.dispatchEvent(new KeyboardEvent("keyup", o));
    return true;
  }

  const PANEL_WAYS = {
    // Notes has no Collapse tab and an unlabelled close button; its own button
    // in Canva's bottom bar opens and closes it.
    notes:    { say: "the Notes button", act: () => { if (!findNotesPanel()) return false; const b = findNotesButton(); return b ? uiClick(b) : false; } },
    collapse: { say: "the Collapse tab", act: (p) => { const b = panelCollapseBtn(p); return b ? uiClick(b) : false; } },
    close:    { say: "its close button", act: (p) => { const b = panelCloseBtn(p); return b ? uiClick(b) : false; } },
    shortcut: { say: "Ctrl + /",         act: () => sendPanelShortcut() },
    rail:     { say: "the left bar",     act: () => { const b = activeRailBtn(); return b ? uiClick(b) : false; } }
  };

  // Close any open side panel before working in Canva. Tries each way in turn,
  // checks the panel really went, and remembers what worked so next time that
  // way goes first. If nothing works, the task carries on regardless.
  async function clearLeftPanel(log, opts) {
    if (!state.closePanels) return true;
    // Before writing Notes, leave the left side alone: opening Notes replaces
    // whatever panel is there, and closing it first only added noise.
    if (opts && opts.keepNotes) return true;
    let p = leftPanelEl();
    if (!p) return true;

    const order = Object.keys(PANEL_WAYS);
    if (state.panelWay && order.includes(state.panelWay)) {
      order.splice(order.indexOf(state.panelWay), 1);
      order.unshift(state.panelWay);
    }

    for (const way of order) {
      if (!PANEL_WAYS[way].act(p)) continue;
      if (await waitFor(() => !leftPanelEl(), 1500)) {
        if (state.panelWay !== way) { state.panelWay = way; store.save(); }
        log("Closed the side panel on the left (" + PANEL_WAYS[way].say + ") to make room.");
        await sleep(320);                    // let the design re-centre
        return true;
      }
      p = leftPanelEl();
      if (!p) return true;
    }
    log("Couldn't close the side panel on the left \u2014 carrying on.");
    return false;
  }

  // Runs a task; if it fails, clears the screen and tries once more before
  // giving up. Most failures come from something covering the design.
  async function withRetry(fn, log, label, opts) {
    let r = await fn();
    const ok = (x) => x === true || !!(x && x.ok);
    if (ok(r)) return r;
    log("Trying " + label + " again after clearing the screen\u2026");
    await clearLeftPanel(log, opts);
    await sleep(200);
    r = await fn();
    return r;
  }

  /* ---------- the Set button ---------- */

  let running = false;

  const normText = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

  // The colour-panel route can only paint text that is already in the box. If the
  // box holds a different headline there is nothing to select, and the run dies
  // with a confusing "couldn't find that phrase" for every phrase.
  function textMatches() {
    const ed = findEditable();
    if (!ed) return false;
    const a = normText(ed.innerText), b = normText(state.text);
    if (!a || !b) return false;
    return a === b || a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40));
  }

  async function pushHeadline(log) {
    const ed = findEditable();
    if (!ed) return false;
    ed.focus();
    selectAllIn(ed);
    await sleep(70);
    const dt = new DataTransfer();
    dt.setData("text/plain", state.text);
    ed.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: dt, bubbles: true, cancelable: true
    }));
    await sleep(650);
    return textMatches();
  }

  // Canva only exposes a contenteditable once a text box is in edit mode, so
  // without this the tool needed you to double-click the headline yourself.
  function canvasTextCandidates() {
    const panels = [findColorPanel(), findNotesPanel()].filter(Boolean);
    const vw = window.innerWidth, vh = window.innerHeight;

    // Canva's chrome scales with the window, so these bounds are proportional
    // with sane floors and ceilings rather than fixed pixel counts.
    const topCut = Math.min(260, Math.max(110, vh * 0.20));
    const leftCut = Math.min(190, Math.max(64, vw * 0.07));
    // Only screens out specks. At 32% zoom your headline is drawn about 11px
    // tall, and the old 14px floor hid it, so a bigger box (the whole page)
    // was taken for the headline instead. Matching by its words does the rest.
    const minFont = 6;

    const out = [];
    document.querySelectorAll("div,span,p,h1,h2,h3,h4").forEach(n => {
      // Cheapest checks first. Most of Canva's page is icons and wrappers with
      // no text; reading rendered text (innerText) is the costly step, so it
      // only happens for what survives the size and position checks.
      const tc = n.textContent;
      if (!tc || tc.length < 12) return;
      if (mine(n)) return;
      const r = n.getBoundingClientRect();
      if (r.width < 60 || r.height < 14) return;
      if (r.top < topCut) return;
      if (r.left < leftCut) return;
      if (r.width > vw * 0.8) return;
      if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return;
      if (panels.some(p => p.contains(n))) return;

      // Anything that can navigate or act is off limits. Clicking Canva's own
      // chrome is what sent the editor back to the home screen.
      if (n.closest('a,[href],button,[role="link"],[role="button"],[role="tab"],[role="menuitem"],[role="toolbar"],[role="menu"],[role="dialog"],[role="navigation"],[role="tablist"],header,nav,aside,[data-testid*="nav" i],[data-testid*="home" i],[aria-label*="home" i],[aria-label*="back" i]')) return;

      const txt = (n.innerText || "").trim();
      if (txt.length < 12) return;
      // Text under the Highlighter still counts. Opening one of Canva's side
      // panels pushes the design right, underneath this panel, and skipping it
      // made the headline vanish. Every click already passes through the panel
      // and is checked with pointOK before it happens.
      const fs = parseFloat(getComputedStyle(n).fontSize) || 0;
      if (fs < minFont) return;

      // Canva keeps neighbouring pages in the DOM, so a text box can be found on
      // a page you are not looking at. Require it to be genuinely on screen.
      const visW = Math.min(r.right, vw) - Math.max(r.left, 0);
      const visH = Math.min(r.bottom, vh) - Math.max(r.top, topCut);
      if (visW <= 0 || visH <= 0) return;
      const seen = (visW * visH) / (r.width * r.height);
      if (seen < 0.75) return;

      // Prefer the innermost element that still holds the whole string.
      if ([...n.children].some(c => (c.innerText || "").trim() === txt)) return;

      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const off = Math.hypot((cx - vw / 2) / vw, (cy - vh / 2) / vh);
      out.push({ n, txt, fs, area: r.width * r.height, seen, off });
    });
    return out;
  }

  // Prefer text we can positively identify as the headline. But on a fresh post
  // the box still holds the *previous* headline, so a content match is
  // impossible — that is exactly when the box most needs opening. The fallback
  // is the largest design text inside the canvas area, which every filter in
  // canvasTextCandidates has already vetted as non-navigational.
  function pickTarget() {
    const cands = canvasTextCandidates();
    if (!cands.length) return null;

    if (state.text.trim()) {
      const want = normText(state.text).slice(0, 30);
      if (want.length >= 12) {
        const hits = cands.filter(c => normText(c.txt).includes(want));
        if (hits.length) {
          // Least extra text first: the headline box, not a container around it.
          const L = normText(state.text).length;
          hits.sort((a, b) => (Math.abs(normText(a.txt).length - L) - Math.abs(normText(b.txt).length - L)) || (a.off - b.off));
          return hits[0];
        }
      }
    }

    // Design text is set far larger than Canva's own interface text, so a
    // generous size floor keeps this away from menus and labels.
    // Design text is set well above Canva's interface text. Scale the floor so
    // this still separates the two on a small laptop screen.
    const floor = window.innerWidth < 1200 ? 17 : 20;
    const big = cands.filter(c => c.fs >= floor);
    if (!big.length) return null;
    // Nearest the middle of the view wins ties — that is the page being edited.
    big.sort((a, b) => (a.off - b.off) || (b.fs - a.fs) || (b.area - a.area));
    return big[0];
  }

  // A real double-click fires mousedown/mouseup/click twice with a rising detail
  // count, then dblclick. Canva's handlers watch that sequence, so a lone
  // dblclick event gets ignored.

  /* ---------- what is under a point ---------- */

  // Canva's own controls: buttons, fields, toolbars, menus, popovers. A click
  // meant for the design must never land on any of these.
  const UI_SEL = 'button,[role="button"],input,textarea,select,a,[href],[role="toolbar"],'
    + '[role="dialog"],[role="menu"],[role="menuitem"],[role="tooltip"],[role="listbox"],'
    + '[role="option"],[role="tab"],[role="slider"],[aria-haspopup]';

  function uiAt(t) {
    if (!t || !t.closest) return true;
    if (mine(t)) return true;
    if (t.closest(UI_SEL)) return true;
    // The floating bar above a selection: a short strip holding several
    // buttons. Its background between icons isn't a button itself.
    let n = t;
    for (let i = 0; i < 5 && n && n !== document.body; i++, n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (r.height > 0 && r.height < 90 && r.width < 700
        && n.querySelectorAll('button,[role="button"]').length >= 2) return true;
    }
    return false;
  }

  function elAt(x, y) {
    const prev = root ? root.style.pointerEvents : "";
    if (root) root.style.pointerEvents = "none";
    try { return document.elementFromPoint(x, y); }
    finally { if (root) root.style.pointerEvents = prev; }
  }

  // True when a click at (x, y) would reach the design, not Canva's interface.
  function pointOK(x, y, intended) {
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const t = elAt(x, y);
    if (!t) return false;
    if (intended && (t === intended || intended.contains(t))) return true;
    return safeToClick(t) && !uiAt(t);
  }

  function somethingSelected() {
    return !!(findColorButton() || findImageEditButton() || findPositionButton());
  }

  // Roughly where the page is: the largest image under the headline, since your
  // templates carry a full-width photo or fade. Falls back to around the headline.
  function pageRectGuess() {
    const he = headlineEl() || headlineAny();
    const hr = he ? he.getBoundingClientRect() : null;
    let best = null;
    [...document.querySelectorAll("img, svg image")].forEach(n => {
      if (mine(n)) return;
      const r = n.getBoundingClientRect();
      if (r.width < 140 || r.height < 140) return;
      if (hr) {
        const ov = Math.min(r.right, hr.right) - Math.max(r.left, hr.left);
        if (ov < Math.min(r.width, hr.width) * 0.5) return;
      }
      if (!best || r.width * r.height > best.width * best.height) best = r;
    });
    if (best) return best;
    if (!hr) return null;
    return { left: hr.left - 20, right: hr.right + 20, top: hr.top - 300, bottom: hr.bottom + 40,
      width: hr.width + 40, height: hr.height + 340 };
  }

  async function clickAt(x, y, times, intended) {
    const hrefBefore = location.href;
    clicking = true;
    // The panel may be sitting over the text box. Make it transparent to
    // hit-testing for the duration of the click.
    const prev = root ? root.style.pointerEvents : "";
    if (root) root.style.pointerEvents = "none";
    try {
      const target = document.elementFromPoint(x, y);
      if (!target) return false;
      const ownEl = intended && (target === intended || intended.contains(target));
      if (!ownEl && (!safeToClick(target) || uiAt(target))) return false;
      const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      for (let n = 1; n <= times; n++) {
        const o = { ...base, detail: n };
        try { target.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerId: 1, isPrimary: true, buttons: 1 })); } catch (e) {}
        target.dispatchEvent(new MouseEvent("mousedown", { ...o, buttons: 1 }));
        try { target.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerId: 1, isPrimary: true })); } catch (e) {}
        target.dispatchEvent(new MouseEvent("mouseup", o));
        target.dispatchEvent(new MouseEvent("click", o));
        if (n < times) await sleep(45);
      }
      if (times >= 2) target.dispatchEvent(new MouseEvent("dblclick", { ...base, detail: 2 }));

      // If a synthetic click ever moves Canva off the design, stop doing this.
      if (location.href !== hrefBefore) {
        state.autoOpenBox = false;
        state.autoMode = false;
        store.save();
        return false;
      }
      return true;
    } finally {
      if (root) root.style.pointerEvents = prev;
      setTimeout(() => { clicking = false; }, 400);
    }
  }

  // One click selects the box, which is enough for Canva to show the text
  // toolbar and its colour button. Two clicks enter edit mode for selections.
  async function selectTextBox(log) {
    if (findColorPanel() || findColorButton()) return true;
    if (!state.autoOpenBox) return false;
    const t = pickTarget();
    if (!t) return false;
    const ok = await clickHeadline(t.n, 1, log);
    if (ok && log) log("Selected the text box starting \u201c" + t.txt.slice(0, 30).replace(/\s+/g, " ") + "\u2026\u201d");
    return ok;
  }

  async function openTextBox(log) {
    if (findEditable()) return true;
    if (!state.autoOpenBox) return false;
    const t = pickTarget();
    if (!t) return false;
    const ok = await clickHeadline(t.n, 2, log);
    if (ok) log("Opened the text box starting \u201c" + t.txt.slice(0, 34).replace(/\s+/g, " ") + "\u2026\u201d");
    return ok;
  }


  // Points on actual letters inside a text element, nearest the middle first.
  // Clicking the centre of the box often hits the gap between lines, and
  // whatever sits behind the text — like the dark fade graphic — gets picked.
  function wordPoints(el) {
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const pts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode() && pts.length < 200) {
      const n = walker.currentNode;
      const t = n.nodeValue || "";
      const re = /[A-Za-z0-9$\u00a3@*]{3,}/g;
      let m;
      while ((m = re.exec(t))) {
        const rg = document.createRange();
        rg.setStart(n, m.index);
        rg.setEnd(n, m.index + m[0].length);
        const r = rg.getBoundingClientRect();
        if (r.width < 3 || r.height < 3) continue;
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        pts.push({ x, y, d: Math.hypot(x - cx, y - cy) });
      }
    }
    pts.sort((a, b) => a.d - b.d);
    return pts.length ? pts : [{ x: cx, y: cy, d: 0 }];
  }

  async function deselect() {
    const k = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true };
    const targets = [document.activeElement, document].filter(t => t && !(t.nodeType === 1 && mine(t)));
    targets.forEach(t => { t.dispatchEvent(new KeyboardEvent("keydown", k)); t.dispatchEvent(new KeyboardEvent("keyup", k)); });
    await sleep(220);
    if (!somethingSelected()) return true;

    // Canva doesn't always honour a synthetic Escape. Clicking the empty grey
    // workspace beside the page always clears the selection — and removes the
    // floating bar that was catching stray clicks.
    const pr = pageRectGuess();
    if (!pr) return false;
    const y = pr.top + pr.height / 2;
    for (const x of [pr.left - 40, pr.left - 90, pr.right + 60, pr.right + 110]) {
      if (!pointOK(x, y)) continue;
      const t = elAt(x, y);
      const tr = t.getBoundingClientRect();
      if (tr.width < pr.width) continue;           // must be the workspace, not a page element
      await clickAt(x, y, 1);
      await sleep(260);
      if (!somethingSelected()) return true;
    }
    return !somethingSelected();
  }

  // Click a word in the headline and confirm the text actually got picked up.
  // If something else was selected instead, let go of it and try another word.
  async function clickHeadline(el, times, log) {
    const pts = wordPoints(el).filter(p => pointOK(p.x, p.y, el));
    if (!pts.length) {
      if (log) log("Something is covering the headline, so there's nowhere safe to click.");
      return false;
    }
    const want = () => times >= 2 ? findEditable() : (findColorButton() || findEditable());
    const picks = [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor(pts.length * 2 / 3)]]
      .filter((p, i, a) => p && a.indexOf(p) === i);
    for (const p of picks) {
      if (!(await clickAt(p.x, p.y, times, el))) continue;
      if (await waitFor(want, 1600)) return true;
      if (log) log("That click picked up something else \u2014 letting go and trying another word.");
      await deselect();
    }
    return false;
  }

  // Runs after either route. If the rest of the line isn't the base colour,
  // flatten the whole box to it and paint the phrases again on top.
  async function enforceBase(log) {
    const base = (state.baseColor || "#FFFFFF").toUpperCase();
    let a = colorAudit();
    if (!a) return true;
    if (a.restFrac >= 0.9) { log("Rest of the headline is " + base + "."); return true; }

    log("Only " + Math.round(a.restFrac * 100) + "% of the rest came out " + base
      + (a.restWrong ? " (the rest is " + a.restWrong + ")" : "") + " \u2014 resetting it and repainting the highlights.");

    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await applyBaseColor(log, true))) {
        log("Couldn't reset the base colour.");
        return false;
      }
      await sleep(250);
      await strategyToolbar(log, state.phrases.map((_, i) => i));
      await sleep(250);
      a = colorAudit();
      if (a && a.restFrac >= 0.9 && a.phrases.every(p => p.ok)) {
        log("Checked every letter: highlights in colour, the rest " + base + ".");
        return true;
      }
    }
    const bad = a ? a.phrases.filter(p => !p.ok).length : 0;
    log("Still off after two tries \u2014 rest " + (a ? Math.round(a.restFrac * 100) : 0) + "% " + base
      + (bad ? ", " + bad + " phrase" + (bad > 1 ? "s" : "") + " not coloured" : "") + ".");
    return false;
  }

  // Removes anything after the last word in the Canva text box: spaces, empty
  // lines, and (if the setting is on) a closing full stop. Leaves the colours
  // alone because it only deletes past the last letter kept.
  function boxEnd() {
    const ed = findEditable();
    if (!ed) return null;
    let lastNode = null, lastOff = 0;
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const n = walker.currentNode, v = n.nodeValue || "";
      const m = v.match(/[^\s\u00a0][\s\u00a0]*$/);
      if (m) { lastNode = n; lastOff = v.length - m[0].length + 1; }
    }
    if (!lastNode) return null;
    const shown = (ed.innerText || "").replace(/\u00a0/g, " ");
    const trailing = /\s$/.test(shown);
    const core = shown.replace(/\s+$/, "");
    const stop = state.dropStop && endsWithStop(core) && lastNode.nodeValue[lastOff - 1] === ".";
    return { ed, lastNode, lastOff: stop ? lastOff - 1 : lastOff, trailing, stop };
  }

  async function trimBoxEnd(log) {
    let b = boxEnd();
    if (!b || (!b.trailing && !b.stop)) return true;
    const what = [b.stop ? "the full stop" : "", b.trailing ? "the empty space" : ""].filter(Boolean).join(" and ");

    for (let attempt = 0; attempt < 2; attempt++) {
      b = boxEnd();
      if (!b || (!b.trailing && !b.stop)) break;
      const r = document.createRange();
      r.setStart(b.lastNode, b.lastOff);
      r.setEnd(b.ed, b.ed.childNodes.length);
      if (r.collapsed) break;
      b.ed.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      await sleep(60);
      if (attempt === 0) {
        document.execCommand("delete");
      } else {
        // Second try: the same delete, sent the way a keyboard would.
        b.ed.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true }));
        const k = { key: "Backspace", code: "Backspace", keyCode: 8, which: 8, bubbles: true, cancelable: true };
        b.ed.dispatchEvent(new KeyboardEvent("keydown", k));
        b.ed.dispatchEvent(new KeyboardEvent("keyup", k));
      }
      await sleep(220);
    }

    const after = boxEnd();
    const clean = !after || (!after.trailing && !after.stop);
    log(clean ? "Removed " + what + " at the end of the headline." : "Couldn't remove " + what + " at the end of the headline.");
    return clean;
  }

  async function coreSet() {
    const ok = await coreSetInner();
    if (!ok) return false;
    let good = true;
    if (state.resetBase) good = await enforceBase(log);
    await trimBoxEnd(log);
    return good;
  }

  async function coreSetInner() {
    if (!state.phrases.length) {
      if (state.text.trim()) {
        prepHeadline();
        log("Auto-picked " + state.phrases.length + " phrases"
          + (state.censorOn ? " (censor list applied)" : "") + ".");
      }
    }
    if (!state.phrases.length) { log("No phrases to color."); return false; }

    if (!findEditable()) {
      if (state.autoOpenBox) {
        log("No text box open \u2014 looking for your headline on the page\u2026");
        await selectTextBox(log);
      }
      if (!(await openTextBox(log))) {
        if (!state.autoOpenBox) {
          log("Double-click your headline text box in Canva, then run again.");
          log("Or tick \u201cOpen the text box for me\u201d in the Highlight tab.");
        } else {
          log("Couldn't open a text box. Saw " + canvasTextCandidates().length
            + " text blocks on this page. Double-click your headline, then run again.");
        }
        return false;
      }
    }
    if (state.alignAfter) captureAnchor();

    if (!textMatches()) {
      log("The Canva text box holds different text \u2014 writing your headline in first.");
      if (!(await pushHeadline(log))) {
        log("Couldn't write it in. Hit Copy text and paste it into the box yourself.");
        return false;
      }
      log("Headline written into the text box.");
      await sleep(300);
    }

    let mode = state.method;
    if (state.phrases.some(p => isGrad(p.color)) && mode !== "toolbar") {
      log("Gradient colors can't be pasted \u2014 using Canva's color panel.");
      mode = "toolbar";
    }
    let pasteRes = null;

    if (mode !== "toolbar") {
      log("Trying styled paste\u2026");
      pasteRes = await strategyPaste(log);
      if (pasteRes.ok) {
        await sleep(350);
        const missing = uncoloredPhrases();
        if (!missing.length) { log("Highlights done \u2014 styled paste." + gradNote()); return true; }
        log(missing.length + " phrase" + (missing.length > 1 ? "s" : "") + " didn't take the color.");
        if (mode === "paste") { toast("Partly set \u2014 " + missing.length + " left"); return false; }
        log("Finishing those through the color panel\u2026");
        await strategyToolbar(log, missing);
        const left = uncoloredPhrases();
        if (!left.length) { log("Highlights done \u2014 paste plus color panel." + gradNote()); return true; }
        log(left.length + " still uncolored. Use Select next phrase for those.");
        return false;
      }
      log(pasteRes.why);
    }

    if (mode !== "paste") {
      log("Using Canva's color panel\u2026");
      const t = await strategyToolbar(log);
      if (t.ok) {
        const left = uncoloredPhrases();
        if (!left.length) { log("Highlights done \u2014 " + t.how + "." + gradNote()); return true; }
        log(left.length + " didn't take. Use Select next phrase for those.");
        return false;
      }
      log(t.why);
    }

    if (pasteRes && pasteRes.pasteReady) {
      log("Fallback: click into your text box, press Ctrl+A then Ctrl+V.");
    } else {
      log("Nothing applied. Use Select next phrase instead.");
    }
    return false;
  }

  function gradNote() {
    const n = state.phrases.filter(p => isGrad(p.color)).length;
    return n ? " (" + n + " gradient phrase" + (n === 1 ? "" : "s") + " applied but not verified \u2014 check the design)" : "";
  }

  async function coreNotes() {
    const text = state.caption.trim();
    if (!text) { log("No caption to send."); return false; }
    try { await navigator.clipboard.writeText(text); log("Caption copied to the clipboard."); }
    catch (e) {}

    const res = await sendToNotes(text, log);
    if (res.ok) { log("Written into Notes."); return true; }
    log(res.why);
    log("Notes button " + (findNotesButton() ? "found" : "missing")
      + ", panel " + (findNotesPanel() ? "found" : "missing")
      + ", editor " + (findNotesEditor() ? "found" : "missing") + ".");
    if (res.pasteReady) log("It's on your clipboard \u2014 click into Notes and press Ctrl+V.");
    return false;
  }

  async function withBusy(id, busyLabel, idleLabel, fn) {
    if (running) return;
    running = true;
    logClear();
    const b = document.getElementById(id);
    // Capture the real label — the same id carries a different one per tab.
    const original = b ? b.textContent : idleLabel;
    if (b) { b.disabled = true; b.textContent = busyLabel; }
    try { await fn(); }
    catch (err) { log("Error: " + (err && err.message ? err.message : String(err))); }
    finally {
      running = false;
      const b2 = document.getElementById(id);
      if (b2) { b2.disabled = false; if (b2.textContent === busyLabel) b2.textContent = original; }
    }
  }

  function runSet() {
    if (!state.phrases.length && !state.text.trim()) { toast("Pick some words first"); return; }
    return withBusy("hh-set", "Working\u2026", "Set all highlights", async () => {
      await clearLeftPanel(log);
      let ok = await withRetry(() => coreSet(), log, "the colouring");
      if (ok && state.alignAfter) ok = (await placeHeadline(log)) && ok;
      if (ok) celebrate("done", "Highlights set");
      else celebrate("fail", "Not finished");
      toast(ok ? "Highlights set" : "Couldn't finish \u2014 see the log");
    });
  }

  function runNotes() {
    if (!state.caption.trim()) { toast("Format a caption first"); return; }
    return withBusy("hh-notes", "Sending\u2026", "Send to Notes", async () => {
      await clearLeftPanel(log, { keepNotes: true });
      const ok = await withRetry(() => coreNotes(), log, "Notes", { keepNotes: true });
      if (ok) celebrate("done", "Sent to Notes");
      else celebrate("fail", "Paste it in");
      toast(ok ? "Sent to Notes" : "Click into Notes, press Ctrl+V");
    });
  }

  // One button: format the caption, color the headline, then fill Notes.
  function runAll() {
    return withBusy("hh-all", "Running\u2026", "Do headline + caption", async () => {
      if (state.raw.trim()) {
        state.caption = formatCaption(state.raw);
        store.save();
        log("Caption formatted \u2014 " + state.caption.length + " characters.");
      }

      if (!findEditable() && !state.autoOpenBox) {
        log("Heads up: no text box is open, so the headline stage may be skipped.");
      }
      const colored = await coreSet();

      let aligned = true;
      if (colored && state.alignAfter) aligned = await placeHeadline(log);

      let photo = true;
      if (state.photoInRun) {
        log("Enhancing the photo\u2026");
        photo = await enhancePhoto(log);
      }

      // Opening Notes moves focus out of the text box, so it goes last.
      let noted = false;
      if (state.caption.trim()) {
        await sleep(300);
        noted = await coreNotes();
      } else {
        log("No caption to send \u2014 skipped Notes.");
      }

      const all = colored && noted && aligned && photo;
      finished = all;
      render();
      if (all) { celebrate("done", "All done"); toast("Headline and caption done"); }
      else if (colored || noted) { celebrate("part", "Partly done"); toast("Partly done \u2014 see the log"); }
      else { celebrate("fail", "Not finished"); toast("Couldn't finish \u2014 see the log"); }
    });
  }

  // Headline dashes only. tidyMarks is deliberately not run here — a headline is
  // one block of text, not a document, so there is no markdown to strip.
  function tidyHeadline() {
    if (!state.headDashes || !state.text) return false;
    const after = tidyDashes(state.text);
    if (after === state.text) return false;
    state.text = after;
    state.tokens = tokenize(state.text);
    state.phrases = [];
    state.cursor = -1;
    store.save();
    return true;
  }

  // Censor, tidy dashes, re-tokenise and re-pick. Order matters: censoring
  // changes the words, so picking has to happen after it.
  // A headline doesn't end in a full stop. Keeps "U.S." and "..." as they are.
  function endsWithStop(t) {
    return /[^.]\.$/.test(t) && !/\b(?:[A-Za-z]\.){2,}$/.test(t);
  }

  function tidyEnd(t) {
    t = String(t || "").replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, "");
    if (state.dropStop && endsWithStop(t)) t = t.slice(0, -1).replace(/[\s\u00a0]+$/, "");
    return t;
  }

  function prepHeadline() {
    if (!state.text) return;
    if (state.censorOn) {
      const c = applyCensor(state.text, state.censorMap);
      if (c !== state.text) state.text = c;
    }
    if (state.headDashes) {
      const d = tidyDashes(state.text);
      if (d !== state.text) state.text = d;
    }
    state.text = tidyEnd(state.text);
    state.tokens = tokenize(state.text);
    state.phrases = [];
    state.cursor = -1;
    autoPick();
    store.save();
  }

  function resetWork() {
    state.text = "";
    state.tokens = [];
    state.phrases = [];
    state.cursor = -1;
    state.raw = "";
    state.caption = "";
    logLines = [];
    finished = false;
    store.save();
  }

  let finished = false;

  /* ---------- labelled bundle ---------- */

  const BUNDLE_KEYS = {
    headline: "headline", title: "headline", hook: "headline", header: "headline",
    "short headline": "headline", "main headline": "headline",

    caption: "caption", body: "caption", story: "caption", description: "caption",
    text: "caption", post: "caption",
    "long caption": "caption", "short caption": "caption", "full caption": "caption",
    "main caption": "caption", "caption long": "caption",

    hashtags: "tags", hashtag: "tags", tags: "tags", tag: "tags", keywords: "tags",

    // Recognised so they get cut out rather than absorbed into the caption above.
    sources: "drop", source: "drop", references: "drop", reference: "drop",
    credit: "drop", credits: "drop", links: "drop", link: "drop",
    rating: "drop", rated: "drop", via: "drop"
  };

  // Some generators emit several numbered options in one paste. Split them so
  // one option's headline can't be glued onto another's.
  function splitOptions(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const marks = [];
    lines.forEach((l, i) => {
      const m = l.match(/^[ \t]*option[ \t]+(\d+)\b[ \t]*(.*)$/i);
      if (m) marks.push({ at: i, n: m[1], note: (m[2] || "").replace(/^[\s:\-\u2013\u2014]+/, "").trim() });
    });
    if (marks.length < 2) return null;

    return marks.map((mk, idx) => {
      const end = idx + 1 < marks.length ? marks[idx + 1].at : lines.length;
      const body = lines.slice(mk.at + 1, end);
      // Trailing ==== rules belong to the next block, not this one.
      while (body.length && /^[\s=*_\-]*$/.test(body[body.length - 1])) body.pop();
      const rated = (mk.note.match(/rated[\s:]*([\d.]+\s*\/\s*\d+)/i) || [])[1] || "";
      return { label: "Option " + mk.n, rating: rated, text: body.join("\n") };
    });
  }

  // Accepts "Headline:" on its own line or "Headline: TSA MAY..." inline.
  // Needs two or more known labels before it will claim the text is a bundle,
  // so an ordinary caption containing "one rule:" is never mistaken for one.
  function parseBundle(text) {
    const opts = splitOptions(text);
    if (opts) {
      const i = Math.min(Math.max(state.optionIndex || 0, 0), opts.length - 1);
      text = opts[i].text;
    }
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const marks = [];
    lines.forEach((line, i) => {
      const m = line.match(/^[ \t]*([A-Za-z][A-Za-z ]{0,18}?)[ \t]*:[ \t]*(.*)$/);
      if (!m) return;
      const key = BUNDLE_KEYS[m[1].trim().toLowerCase()];
      if (key) marks.push({ key, at: i, rest: m[2] });
    });
    if (marks.length < 2) return null;

    const out = {};
    marks.forEach((mk, idx) => {
      const end = idx + 1 < marks.length ? marks[idx + 1].at : lines.length;
      if (mk.key === "drop") return;
      const chunk = [mk.rest, ...lines.slice(mk.at + 1, end)].join("\n").trim();
      if (!chunk) return;
      out[mk.key] = out[mk.key] ? out[mk.key] + "\n\n" + chunk : chunk;
    });
    return (out.headline || out.caption) ? out : null;
  }

  function applyBundle(b) {
    if (b.headline) {
      state.text = b.headline.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
      state.tokens = tokenize(state.text);
      state.phrases = [];
      state.cursor = -1;
      // Censor, tidy and pick straight away — the preview used to come up blank
      // until Auto-pick was clicked by hand.
      prepHeadline();
    }
    if (b.caption || b.tags) {
      state.raw = [b.caption || "", b.tags || ""].filter(Boolean).join("\n\n");
      state.caption = formatCaption(state.raw);
    }
    store.save();
  }

  // Hashtags often sit inline at the end of the caption with no label of their
  // own, so count them across both sections.
  function bundleTagCount(b) {
    const src = [b.tags || "", b.caption || ""].join(" ");
    const seen = new Set();
    (src.match(TAG_RE) || []).forEach(t => seen.add(t.toLowerCase()));
    return seen.size;
  }

  function bundleSummary(b) {
    const bits = [];
    if (b.headline) bits.push("headline " + b.headline.trim().length + " chars");
    if (b.caption) bits.push("caption " + b.caption.trim().length + " chars");
    const n = bundleTagCount(b);
    if (n) bits.push(n + " hashtags");
    return bits.join(", ");
  }

  /* ---------- shared panel helpers ---------- */

  // Buttons count too: a tab like "Arrange" is often a plain button with its
  // label written straight inside it, and missing it hid the Position panel.
  function leafs(scope) {
    if (!scope) return [];
    return [...scope.querySelectorAll("div,span,p,label,h1,h2,h3,h4,h5,button")]
      .filter(e => !e.childElementCount && notMine(e) && visible(e));
  }

  const hasLeaf = (el, re) => leafs(el).some(e => re.test((e.textContent || "").trim()));

  // Climb from a heading to the side panel that holds it. Capped at 60% of the
  // window so it can never return the whole page.
  function panelAround(test, seedRe) {
    const seeds = leafs(document.body).filter(e =>
      seedRe.test((e.textContent || "").trim()) && !e.closest('button,[role="button"]'));
    for (const seed of seeds) {
      let n = seed;
      for (let i = 0; i < 10 && n.parentElement; i++) {
        n = n.parentElement;
        const r = n.getBoundingClientRect();
        if (r.width > window.innerWidth * 0.6) break;
        if (r.height > 160 && r.width > 160 && test(n)) return n;
      }
    }
    return null;
  }

  function clickableLeaf(scope, re) {
    const l = leafs(scope).find(e => re.test((e.textContent || "").trim()));
    return l ? clickable(l) : null;
  }

  const readNum = (input) => parseFloat(String(input && input.value || "").replace(/[^\d.\-]/g, ""));

  async function setNum(input, v) {
    input.focus();
    try { input.select(); } catch (e) {}
    setNativeValue(input, String(v));
    const k = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
    input.dispatchEvent(new KeyboardEvent("keydown", k));
    input.dispatchEvent(new KeyboardEvent("keyup", k));
    await sleep(90);
    input.blur();
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }

  // Finds an input by its label, whether the label is an attribute or a piece
  // of text sitting beside or above the field.
  function findField(panel, re) {
    if (!panel) return null;
    const ins = [...panel.querySelectorAll("input")].filter(i => notMine(i) && visible(i));
    const byAttr = ins.find(i => re.test(i.getAttribute("aria-label") || "")
      || re.test(i.getAttribute("title") || "") || re.test(i.placeholder || ""));
    if (byAttr) return byAttr;

    const lab = leafs(panel).find(e => re.test((e.textContent || "").trim()));
    if (!lab) return null;
    const lr = lab.getBoundingClientRect();
    const lcy = (lr.top + lr.bottom) / 2;
    let best = null, bd = Infinity;
    ins.forEach(i => {
      const r = i.getBoundingClientRect();
      const cy = (r.top + r.bottom) / 2;
      const sameRow = Math.abs(cy - lcy) < 24 && r.right >= lr.left;
      const below = r.top >= lr.bottom - 2 && r.top - lr.bottom < 50 && Math.abs(r.left - lr.left) < 70;
      if (!sameRow && !below) return;
      const d = Math.hypot(Math.max(0, r.left - lr.right), cy - lcy);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /* ---------- headline alignment ---------- */

  let anchorGap = null;
  let lastAlign = null;

  // The tight box around the rendered glyph lines. A container's own rect can
  // be padded, offset or a hidden editing proxy; the text itself can't lie.
  function textRect(el) {
    try {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const r = rg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r;
    } catch (e) {}
    return el.getBoundingClientRect();
  }

  function headlineEl() {
    const ed = findEditable();
    if (ed) return ed;
    const want = normText(state.text).slice(0, 30);
    if (want.length < 12) return null;
    const hits = canvasTextCandidates().filter(c => normText(c.txt).includes(want));
    // The box holding the least extra text is the headline itself. A bigger
    // container (the whole page, with the @handle) also "contains" it, and
    // picking that made the headline look as tall as the page.
    const len = normText(state.text).length;
    const extra = (c) => Math.abs(normText(c.txt).length - len);
    hits.sort((a, b) => (extra(a) - extra(b)) || (a.off - b.off));
    return hits[0] ? hits[0].n : null;
  }

  // Same search, but without the on-screen requirement, so a headline that has
  // been pushed off the page can still be found and brought back.
  function headlineAny() {
    const want = normText(state.text).slice(0, 30);
    if (want.length < 12) return null;
    const vw = window.innerWidth;
    const panels = [findColorPanel(), findNotesPanel()].filter(Boolean);
    let best = null, bd = Infinity;
    document.querySelectorAll("div,span,p,h1,h2,h3,h4").forEach(n => {
      if (mine(n) || panels.some(p => p.contains(n))) return;
      const txt = (n.innerText || "").trim();
      if (txt.length < 12 || !normText(txt).includes(want)) return;
      if ([...n.children].some(c => (c.innerText || "").trim() === txt)) return;
      const r = n.getBoundingClientRect();
      if (r.width < 120 || r.height < 10) return;          // page thumbnails are tiny
      const d = Math.abs(r.left + r.width / 2 - vw / 2) / vw;
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }

  function findHandleEl(box) {
    const notes = findNotesPanel();
    let best = null;
    leafs(document.body).forEach(e => {
      if (notes && notes.contains(e)) return;
      if (!/^@[\w.]{2,}$/.test((e.textContent || "").trim())) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 4) return;
      const ov = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      if (ov < Math.min(r.width, box.width) * 0.5) return;
      if (r.top < box.top) return;
      if (!best || r.top < best.r.top) best = { e, r };
    });
    return best;
  }

  // When the headline is already off the page, "the handle below it" doesn't
  // exist. Fall back to the most prominent @handle near the middle of the view.
  function mainHandle(near) {
    if (near) { const h = findHandleEl(near); if (h) return h.e; }
    const notes = findNotesPanel();
    let best = null, bs = -Infinity;
    leafs(document.body).forEach(e => {
      if (notes && notes.contains(e)) return;
      if (!/^@[\w.]{2,}$/.test((e.textContent || "").trim())) return;
      const r = e.getBoundingClientRect();
      if (r.height < 6 || r.width < 40) return;
      const sc = r.height * 2 - Math.abs(r.left + r.width / 2 - window.innerWidth / 2) / 10;
      if (sc > bs) { bs = sc; best = e; }
    });
    return best;
  }

  function captureAnchor() {
    anchorGap = null;
    const el = headlineEl();
    if (!el) return;
    const r = textRect(el);
    const h = findHandleEl(r);
    if (h) anchorGap = h.r.top - r.bottom;
  }

  function findPositionButton() {
    return [...document.querySelectorAll('button,[role="button"]')]
      .filter(b => notMine(b) && visible(b) && safeToClick(b))
      .find(b => (b.textContent || "").trim() === "Position"
        || /^position$/i.test(b.getAttribute("aria-label") || "")) || null;
  }

  function findPositionPanel() {
    return panelAround(n => hasLeaf(n, /^(align to page|advanced|arrange|layers?)$/i),
      /^(position|align to page|advanced|arrange)$/i);
  }

  async function openPositionPanel(log) {
    if (findPositionPanel()) return true;
    const btn = findPositionButton();
    if (!btn) { log("No Position button in Canva's toolbar \u2014 widen the window if it's tucked under \u2026"); return false; }
    for (let i = 0; i < 2; i++) {
      realClick(btn);
      if (await waitFor(findPositionPanel, 2400)) { log("Opened Position."); return true; }
      await sleep(250);
    }
    log("The Position panel didn't open.");
    return false;
  }

  function findAlignCenter(panel) {
    if (!panel) return null;
    return [...panel.querySelectorAll('button,[role="button"]')]
      .filter(b => visible(b) && safeToClick(b))
      .find(b => {
        const l = ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).trim().toLowerCase();
        return /(^|\s)cent(er|re)(\s|$)/.test(l) && !/middle|text/.test(l);
      }) || null;
  }

  async function positionFields() {
    let p = findPositionPanel();
    if (!p) return null;

    const grab = () => {
      p = findPositionPanel() || p;
      const f = {
        p,
        x: findField(p, /^x$/i), y: findField(p, /^y$/i),
        w: findField(p, /^(w|width)$/i), h: findField(p, /^(h|height)$/i)
      };
      // Fallback from the panel's own layout: the four boxes ending in "px"
      // read Width, Height, X, Y in order. Rotate ends in a degree sign.
      if (!f.y) {
        const px = [...p.querySelectorAll("input")]
          .filter(i => notMine(i) && visible(i) && /^\s*-?[\d.,]+\s*px\s*$/i.test(i.value || ""))
          .sort((a, b) => {
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            return Math.abs(ra.top - rb.top) > 6 ? ra.top - rb.top : ra.left - rb.left;
          });
        if (px.length >= 4) {
          f.w = f.w || px[0]; f.h = f.h || px[1]; f.x = f.x || px[2]; f.y = px[3];
        }
      }
      return f.y ? f : null;
    };

    // The fields can render a beat after the panel itself.
    let f = await waitFor(grab, 1800);

    // They live under Arrange -> Advanced, which may be on another tab or folded.
    if (!f) {
      for (const re of [/^arrange$/i, /^advanced$/i]) {
        const b = clickableLeaf(findPositionPanel() || p, re);
        if (!b) continue;
        realClick(b);
        await sleep(420);
        f = await waitFor(grab, 1500);
        if (f) break;
      }
    }
    if (f && f.y) { try { f.y.scrollIntoView({ block: "center" }); } catch (e) {} }
    return f || null;
  }

  async function setField(key, v) {
    const f = await positionFields();
    if (!f || !f[key]) return false;
    await setNum(f[key], Math.round(v * 10) / 10);
    await sleep(460);
    return true;
  }

  const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

  // A feedback loop, not a single calculated jump. The first move is a small
  // probe; the screen distance it actually produces is used to learn the real
  // design-to-screen scale, and every later move is corrected from that. A move
  // that loses the headline or makes it worse is undone on the spot.
  async function alignHeadline(log) {
    // Position acts on whatever is selected. Only proceed with the text
    // toolbar showing, or this could move the photo instead.
    if (!findColorButton() && !findEditable()) {
      const el0 = headlineEl() || headlineAny();
      if (el0 && state.autoOpenBox) await clickHeadline(el0, 1, log);
      if (!findColorButton()) { log("Select the headline text box, then align again."); return false; }
    }

    let tracked = headlineEl() || headlineAny();
    if (!tracked) { log("Couldn't find the headline on this page."); return false; }
    const track = () => {
      if (tracked && tracked.isConnected && tracked.getBoundingClientRect().width >= 120) return tracked;
      tracked = findEditable() || headlineAny();
      return tracked;
    };

    if (!(await openPositionPanel(log))) return false;
    let f = await positionFields();
    if (!f) { log("Couldn't find the Y field in Position."); return false; }

    const origY = readNum(f.y);
    const origX = f.x ? readNum(f.x) : NaN;
    if (isNaN(origY)) { log("Couldn't read the Y position."); return false; }
    lastAlign = { y: origY, x: origX };

    const center = findAlignCenter(f.p);
    if (center) { realClick(center); await sleep(400); log("Centred on the page."); }

    const handle = mainHandle(textRect(track()));
    if (!handle) { log("No @handle on this page to line up with \u2014 centred only."); return !!center; }

    const measure = () => {
      const e = track();
      if (!e) return null;
      const tr = textRect(e);
      const hr = handle.getBoundingClientRect();
      let gap = anchorGap;
      if (gap == null || gap <= 0 || gap > hr.height * 4) gap = hr.height * 0.6;
      return { box: e.getBoundingClientRect(), bottom: tr.bottom, err: (hr.top - gap) - tr.bottom };
    };

    f = await positionFields();
    const W = f && f.w ? readNum(f.w) : NaN;
    const H = f && f.h ? readNum(f.h) : NaN;
    let m = measure();
    if (!m) { log("Lost the headline before moving it."); return false; }

    // Starting scale. Take the smaller of the two estimates: undershooting costs
    // one more pass, overshooting is what threw the headline off the page.
    const est = [];
    if (W > 0 && m.box.width > 0) est.push(W / m.box.width);
    if (H > 0 && m.box.height > 0) est.push(H / m.box.height);
    if (!est.length) { log("Couldn't read the box size from Position."); return false; }
    let ratio = Math.min(...est);
    let learned = false;

    const maxStep = Math.max(H > 0 ? H * 2 : 400, 400);
    let cur = readNum(f.y);
    let best = { y: cur, abs: Math.abs(m.err) };
    let still = 0;

    for (let pass = 0; pass < 8; pass++) {
      m = measure();
      if (!m) { log("Lost the headline \u2014 putting it back."); await setField("y", best.y); return false; }
      if (Math.abs(m.err) <= 1.5) { best = { y: cur, abs: Math.abs(m.err) }; break; }

      // Until the real scale is known, a move can be at most a fraction of the
      // box's own height — enough to measure, never enough to lose it.
      const cap = learned ? maxStep : Math.max(60, (H > 0 ? H : 300) * 0.4);
      let step = m.err * ratio * (learned ? 1 : 0.5);
      step = Math.max(-cap, Math.min(cap, step));
      const next = Math.max(0, Math.round((cur + step) * 10) / 10);
      if (next === cur) break;

      const before = m.bottom;
      await setField("y", next);
      const after = measure();

      if (!after) {
        log("That move lost the headline \u2014 putting it back.");
        await setField("y", best.y);
        cur = best.y; ratio *= 0.5; learned = false;
        continue;
      }

      const moved = after.bottom - before;
      if (Math.abs(moved) < 0.5) {
        if (++still >= 2) { log("Canva isn't taking the Y value."); await setField("y", best.y); return false; }
        continue;
      }
      still = 0;

      const r2 = (next - cur) / moved;
      if (isFinite(r2) && r2 > 0) { ratio = r2; learned = true; }
      cur = next;

      const abs = Math.abs(after.err);
      if (abs < best.abs) best = { y: cur, abs };
      else if (abs > best.abs + 2) {
        log("That overshot \u2014 stepping back.");
        await setField("y", best.y);
        cur = best.y;
      }
    }

    if (cur !== best.y) await setField("y", best.y);

    if (best.abs <= 3) {
      log("Headline lined up above the handle (Y " + fmt(origY) + " \u2192 " + fmt(best.y) + ").");
      return true;
    }
    log("Got within " + Math.round(best.abs) + " px of the handle (Y " + fmt(origY) + " \u2192 " + fmt(best.y) + ").");
    return false;
  }



  /* ---------- filling the page with the photo ---------- */

  // How much of the page, from the top, the photo must cover at least: past
  // where the headline starts, so no gap shows above the gradient.
  const PHOTO_COVER = 0.62;
  let lastPhoto = null;         // size and place before the last fill, for undo

  function findAlignBtn(panel, re) {
    if (!panel) return null;
    return [...panel.querySelectorAll('button,[role="button"]')]
      .filter(b => visible(b) && safeToClick(b))
      .find(b => re.test(((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).trim())) || null;
  }

  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // Scale the photo evenly (never stretched, never shrunk) until it covers
  // the full width and the top of the page, pin it to the top, centred, and
  // put it behind everything so it can never cover the headline.
  async function fillWithPhoto(log) {
    const pick = await selectPhoto(log);
    if (pick === "none") return { ok: true, none: true, msg: "No photo on this page" };
    if (pick !== "ok") return { ok: false, msg: "Couldn't select the photo" };
    if (!(await openPositionPanel(log))) return { ok: false, msg: "Position didn't open" };

    let f = await positionFields();
    if (!f || !f.w || !f.h || !f.x || !f.y) return { ok: false, msg: "Couldn't read Position" };
    const before = { w: readNum(f.w), h: readNum(f.h), x: readNum(f.x), y: readNum(f.y) };
    if ([before.w, before.h, before.x, before.y].some(isNaN) || before.w < 10 || before.h < 10) {
      return { ok: false, msg: "Couldn't read the photo's size" };
    }
    if (looksLikeFade(before.w, before.h)) {
      log("That's the fade, not the photo \u2014 nothing was changed.");
      await deselect();
      return { ok: false, msg: "Selected the fade \u2014 nothing changed" };
    }

    // Page size, exactly: centred, X = (pageW - W) / 2; middled, Y = (pageH - H) / 2.
    const center = findAlignCenter(f.p), middle = findAlignBtn(f.p, /^middle$/i);
    if (!center || !middle) return { ok: false, msg: "No Center or Middle in Position" };
    realClick(center); await sleep(380);
    realClick(middle); await sleep(380);
    f = await positionFields();
    const w = readNum(f && f.w), h = readNum(f && f.h), cx = readNum(f && f.x), cy = readNum(f && f.y);
    const pageW = 2 * cx + w, pageH = 2 * cy + h;
    if (![w, h, cx, cy].every(v => !isNaN(v)) || pageW < 50 || pageH < 50 || pageW > 12000 || pageH > 12000) {
      return { ok: false, msg: "Couldn't work out the page size" };
    }

    const scale = Math.max(1, pageW / w, (pageH * PHOTO_COVER) / h);
    const W1 = Math.round(w * scale * 10) / 10, H1 = Math.round(h * scale * 10) / 10;
    const X1 = Math.round((pageW - W1) / 2 * 10) / 10;

    if (scale > 1.002) {
      await setField("w", W1);
      f = await positionFields();
      // With Canva's ratio lock on, the height follows. With it off, set it too,
      // so the photo keeps its shape.
      if (!near(readNum(f && f.h), H1, 2)) { await setField("h", H1); f = await positionFields(); }
      if (!near(readNum(f && f.w), W1, 3) || !near(readNum(f && f.h), H1, 3)) {
        log("Canva didn't take the new size \u2014 putting the photo back.");
        await restorePhoto(before);
        return { ok: false, msg: "Canva didn't take the new size" };
      }
    }
    await setField("x", X1);
    await setField("y", 0);
    f = await positionFields();
    if (!near(readNum(f && f.x), X1, 2) || !near(readNum(f && f.y), 0, 2)) {
      return { ok: false, msg: "Couldn't pin the photo to the top" };
    }
    lastPhoto = before;
    log("Photo fills the page: " + fmt(before.w) + " \u00d7 " + fmt(before.h) + " \u2192 " + fmt(W1) + " \u00d7 " + fmt(H1) + ", pinned to the top.");

    // Behind everything, so the bigger photo can't cover the headline.
    const back = await arrangeLayer("toback", log);
    if (!back.ok) log("Couldn't send the photo to the back \u2014 check it isn't over the headline.");
    return { ok: true, msg: scale > 1.002 ? "Photo fills the page" : "Photo already filled the width \u2014 pinned to the top" };
  }

  async function restorePhoto(b) {
    if (!b) return false;
    await setField("w", b.w);
    const f = await positionFields();
    if (!near(readNum(f && f.h), b.h, 2)) await setField("h", b.h);
    await setField("x", b.x);
    await setField("y", b.y);
    return true;
  }

  async function undoPhotoFill(log) {
    if (!lastPhoto) { log("Nothing to undo yet."); return { ok: false, msg: "Nothing to undo yet" }; }
    const pick = await selectPhoto(log);
    if (pick !== "ok") return { ok: false, msg: "Select the photo first" };
    if (!(await openPositionPanel(log))) return { ok: false, msg: "Position didn't open" };
    await restorePhoto(lastPhoto);
    log("Put the photo back as it was.");
    lastPhoto = null;
    return { ok: true, msg: "Photo put back" };
  }

  /* ---------- fitting the headline to the page width ---------- */

  // Your headline width, as a share of the page: 1,056 on a 1,080 page.
  const FIT_RATIO = 1056 / 1080;

  // Canva's text size box, between the - and + in the text toolbar.
  function findFontSizeInput() {
    const ins = [...document.querySelectorAll("input")].filter(i => notMine(i) && visible(i));
    const named = ins.find(i => /font ?size|text ?size/i.test((i.getAttribute("aria-label") || "") + " " + (i.getAttribute("title") || "")));
    if (named) return named;
    return ins.find(i => {
      const r = i.getBoundingClientRect();
      if (r.width > 90 || r.top > window.innerHeight * 0.32) return false;
      const v = readNum(i);
      if (!(v >= 1 && v <= 800)) return false;
      // a minus and a plus button right beside it
      const near = [...document.querySelectorAll('button,[role="button"]')].filter(b => {
        if (!notMine(b) || !visible(b)) return false;
        const br = b.getBoundingClientRect();
        return Math.abs((br.top + br.height / 2) - (r.top + r.height / 2)) < 16
          && (Math.abs(br.right - r.left) < 40 || Math.abs(br.left - r.right) < 40);
      });
      const txt = near.map(b => (b.textContent || "").trim() + " " + (b.getAttribute("aria-label") || "")).join(" ");
      return /[+]|increase/i.test(txt) && /[-\u2013\u2212]|decrease/i.test(txt);
    }) || null;
  }

  // Stretch the headline box to the page width and grow the lettering with it,
  // the way dragging a corner does, then centre it. The page width comes from
  // Position itself: once centred, page width = 2 x X + Width.
  async function fitHeadline(log) {
    if (!(await openPositionPanel(log))) return false;
    let f = await positionFields();
    if (!f || !f.w || !f.x) { log("Couldn't read the width in Position \u2014 skipped fitting."); return false; }

    const center = findAlignCenter(f.p);
    if (!center) { log("No Center button in Position \u2014 skipped fitting."); return false; }
    realClick(center);
    await sleep(420);

    f = await positionFields();
    const W0 = readNum(f && f.w), X0 = readNum(f && f.x);
    const pageW = 2 * X0 + W0;
    if (!(W0 > 20) || !(X0 >= -1) || !(pageW >= W0) || pageW > 12000) {
      log("Couldn't work out the page width \u2014 skipped fitting.");
      return false;
    }
    const target = Math.round(pageW * FIT_RATIO * 10) / 10;
    if (Math.abs(W0 - target) <= 2) { log("The headline already fills the width."); return true; }

    const fontIn0 = findFontSizeInput();
    const F0 = fontIn0 ? readNum(fontIn0) : NaN;
    const scale = Math.max(0.8, Math.min(1.25, target / W0));   // at most 25% per run

    await setField("w", target);
    f = await positionFields();
    const W1 = readNum(f && f.w);
    if (!(Math.abs(W1 - target) <= 3)) { log("Canva didn't take the new width."); return false; }

    // Grow the lettering in step. If Canva's ratio lock already scaled it, leave it.
    if (!isNaN(F0)) {
      const want = Math.round(F0 * scale * 10) / 10;
      const fontIn = findFontSizeInput();
      const F1 = fontIn ? readNum(fontIn) : NaN;
      if (fontIn && Math.abs(F1 - want) > 0.2) { await setNum(fontIn, want); await sleep(420); }
      log("Text size " + fmt(F0) + " \u2192 " + fmt(want) + ".");
    } else {
      log("Couldn't find the text size box \u2014 widened the box only.");
    }

    // A new width keeps the left edge where it was, so centre again.
    const f2 = await positionFields();
    const c2 = f2 && findAlignCenter(f2.p);
    if (c2) { realClick(c2); await sleep(380); }
    log("Headline fills the width: " + fmt(W0) + " \u2192 " + fmt(target) + " px, centred.");
    return true;
  }

  // Fit (if switched on), centre, and sit the headline above the @handle.
  // Remembers everything first, so Undo line-up restores size and place.
  async function placeHeadline(log) {
    if (!findColorButton() && !findEditable()) {
      const el0 = headlineEl() || headlineAny();
      if (el0 && state.autoOpenBox) await clickHeadline(el0, 1, log);
      if (!findColorButton()) { log("Select the headline text box, then try again."); return false; }
    }
    let before = null;
    if (await openPositionPanel(log)) {
      const f = await positionFields();
      const fi = findFontSizeInput();
      if (f) before = { y: readNum(f.y), x: f.x ? readNum(f.x) : NaN, w: f.w ? readNum(f.w) : NaN, f: fi ? readNum(fi) : NaN };
    }
    if (state.fitWidth) await fitHeadline(log);
    const ok = await alignHeadline(log);
    if (before && !isNaN(before.y)) lastAlign = before;
    return ok;
  }

  async function undoAlign(log) {
    if (!lastAlign) { log("Nothing to undo yet."); return false; }
    if (!findColorButton()) { log("Select the headline text box first."); return false; }
    if (!(await openPositionPanel(log))) return false;
    // Width first: with Canva's ratio lock on, a width change also resizes the
    // text, so the text size is set last to land exactly where it was.
    if (!isNaN(lastAlign.w)) await setField("w", lastAlign.w);
    if (!isNaN(lastAlign.f)) {
      const fi = findFontSizeInput();
      if (fi && Math.abs(readNum(fi) - lastAlign.f) > 0.05) { await setNum(fi, lastAlign.f); await sleep(420); }
    }
    if (!isNaN(lastAlign.x)) await setField("x", lastAlign.x);
    await setField("y", lastAlign.y);
    log("Put the headline back as it was.");
    return true;
  }

  /* ---------- photo enhancement ---------- */

  function findPhotoEl(skip) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const side = [findColorPanel(), findNotesPanel(), findEditImagePanel(), findAdjustPanel()].filter(Boolean);
    const he = headlineEl();
    const hr = he ? he.getBoundingClientRect() : null;

    const nodes = [...document.querySelectorAll("img, svg image")];
    let best = null, bestS = -Infinity;
    nodes.forEach(n => {
      if (mine(n) || !visible(n)) return;
      if (skip && skip.has(n)) return;
      if (n.closest('a,[href],nav,header,aside,button,[role="button"]')) return;
      if (side.some(p => p.contains(n))) return;

      const r = n.getBoundingClientRect();
      if (r.width < 140 || r.height < 140) return;
      const visW = Math.min(r.right, vw) - Math.max(r.left, 0);
      const visH = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visW <= 0 || visH <= 0 || (visW * visH) / (r.width * r.height) < 0.6) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // A photo under the Highlighter still counts; clicks pass through it.

      let s = Math.log(r.width * r.height);
      if (hr) {
        // The photo on the page being edited sits behind the headline.
        const ov = Math.min(r.right, hr.right) - Math.max(r.left, hr.left);
        if (ov < Math.min(r.width, hr.width) * 0.5) return;
        s += 4;
      } else if (cx < vw * 0.2 || cx > vw * 0.8) return;
      s -= Math.hypot((cx - vw / 2) / vw, (cy - vh / 2) / vh) * 3;
      if (s > bestS) { bestS = s; best = n; }
    });
    return best;
  }

  function findImageEditButton() {
    const btns = [...document.querySelectorAll('button,[role="button"]')]
      .filter(b => notMine(b) && visible(b) && safeToClick(b) && (b.textContent || "").trim() === "Edit");
    for (const b of btns) {
      let n = b;
      for (let i = 0; i < 6 && n.parentElement; i++) {
        n = n.parentElement;
        if (/\b(Replace|BG Remover|Flip|Eraser|Crop)\b/.test(n.innerText || "")) return b;
      }
    }
    return null;
  }

  function findEditImagePanel() {
    return panelAround(n => hasLeaf(n, /^edit image$/i) && hasLeaf(n, /^adjust$/i), /^edit image$/i);
  }

  function findAdjustPanel() {
    return panelAround(n => hasLeaf(n, /^auto[- ]?adjust$/i)
      || (hasLeaf(n, /^sharpness$/i) && hasLeaf(n, /^(temperature|brightness)$/i)),
      /^(adjust|sharpness|temperature|brightness)$/i);
  }

  /* ---------- finding and selecting the photo ---------- */

  // A photo's toolbar has Replace or BG Remover. "Flip", "Crop" and "Eraser"
  // alone aren't enough: the bottom fade can show those too, and the old,
  // looser check could mistake the fade for the photo.
  function photoToolbarStrict() {
    const b = findImageEditButton();
    if (!b) return false;
    let n = b;
    for (let i = 0; i < 7 && n.parentElement; i++) {
      n = n.parentElement;
      if (/\b(BG Remover|Replace)\b/.test(n.innerText || "")) return true;
    }
    return false;
  }

  // What a frame actually shows: Canva crops a photo by clipping a larger
  // image inside it, so cut the image's box down by any clipping parent.
  function shownRect(el) {
    let r = el.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    let n = el.parentElement;
    for (let i = 0; i < 6 && n && n !== document.body; i++, n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const p = n.getBoundingClientRect();
        L = Math.max(L, p.left); T = Math.max(T, p.top); R = Math.min(R, p.right); B = Math.min(B, p.bottom);
      }
    }
    return { left: L, top: T, right: R, bottom: B, width: Math.max(0, R - L), height: Math.max(0, B - T) };
  }

  // The large images on the page, told apart: the fade is a wide band resting
  // on the bottom of the page; the photo is the large image that reaches highest.
  function photoAndFade() {
    // Before a run, the box still holds the template's text, not the new
    // story — so fall back to the page's main text to find the headline. Without
    // it, the fade could be taken for the photo.
    const he = headlineEl() || headlineAny() || pageMainHeadline();
    const hr = he ? textRect(he) : null;          // the letters, not the box around them
    const side = [findColorPanel(), findNotesPanel(), findEditImagePanel(), findAdjustPanel()].filter(Boolean);
    const vw = window.innerWidth, vh = window.innerHeight;
    const imgs = [...document.querySelectorAll("img, svg image")].filter(n => {
      if (mine(n) || !visible(n)) return false;
      if (n.closest('a,[href],nav,header,button,[role="button"]')) return false;
      if (side.some(p => p.contains(n))) return false;
      const r = shownRect(n);
      if (r.width < 120 || r.height < 80) return false;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return false;
      if (hr) {
        const ov = Math.min(r.right, hr.right) - Math.max(r.left, hr.left);
        if (ov < Math.min(r.width, hr.width) * 0.5) return false;
      }
      return true;
    }).map(n => ({ n, r: shownRect(n) }));
    if (!imgs.length) return { photo: null, fade: null, hr };

    const bottom = Math.max(...imgs.map(i => i.r.bottom));
    const widest = Math.max(...imgs.map(i => i.r.width));
    // The fade lies behind the headline: wide, and covering the headline from
    // above it to below it. A photo — even a wide one — sits above the headline.
    const isFade = (i) => {
      if (i.r.width / Math.max(1, i.r.height) <= 1.25) return false;
      if (hr) return i.r.top <= hr.top + 4 && i.r.bottom >= hr.bottom - 4;
      return imgs.length > 1 && Math.abs(i.r.bottom - bottom) < 8 && i.r.width >= widest * 0.95;
    };
    const fade = imgs.find(isFade) || null;
    const rest = imgs.filter(i => i !== fade);
    rest.sort((a, b) => (a.r.top - b.r.top) || (b.r.width * b.r.height - a.r.width * a.r.height));
    return { photo: rest[0] || null, fade, hr };
  }

  // Is the selected layer the bottom fade? That's the only wrong pick that
  // would do damage, so it's the only one refused. (An earlier version
  // demanded a match with the photo's on-screen shape instead, and refused
  // correctly selected photos whenever Canva cropped them in a way the page
  // can't measure.)
  function looksLikeFade(w, h) {
    if (!(w > 0) || !(h > 0)) return false;
    const { photo, fade } = photoAndFade();
    if (!fade) return false;
    const a = w / h;
    const near = (b) => b > 0 && Math.abs(a - b) / b < 0.08;
    const shapes = (o) => { const f = o.n.getBoundingClientRect(); return [o.r.width / o.r.height, f.width / f.height]; };
    if (!shapes(fade).some(near)) return false;
    // A photo the same shape as the fade can't be told apart this way: allow it.
    if (photo && shapes(photo).some(near)) return false;
    return true;
  }


  function directClick(el, x, y) {
    clicking = true;
    setTimeout(() => { clicking = false; }, 400);
    const o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    try { el.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerId: 1, isPrimary: true, buttons: 1 })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mousedown", { ...o, buttons: 1 }));
    try { el.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerId: 1, isPrimary: true })); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
  }

  // Way 1: click where only the photo can be — above the headline and the fade.
  async function selectPhotoByClick(log, until) {
    const { photo, fade, hr } = photoAndFade();
    if (!photo) return fade ? "none" : "fail";
    const r = photo.r;
    let lowest = r.bottom - 6;
    if (fade) lowest = Math.min(lowest, fade.r.top - 12);
    if (hr) lowest = Math.min(lowest, hr.top - 50);
    const highest = Math.max(r.top + 6, 4);
    if (lowest - highest < 16) { log("No clear spot on the photo above the headline."); return "fail"; }

    const spots = [];
    for (const fy of [0.35, 0.15, 0.6, 0.85]) {
      for (const fx of [0.5, 0.3, 0.7]) {
        spots.push({ x: r.left + r.width * fx, y: highest + (lowest - highest) * fy });
      }
    }
    let tries = 0, covered = 0;
    for (const pt of spots) {
      if (Date.now() > until || tries >= 4) break;
      if (!pointOK(pt.x, pt.y, photo.n)) continue;
      tries++;
      await clickAt(pt.x, pt.y, 1, photo.n);
      if (await waitFor(photoToolbarStrict, 800)) return "ok";
      if (somethingSelected()) {
        // Canva answered with something else: a layer sits over the photo here.
        await deselect();
        if (++covered >= 2) { log("Something sits over the photo \u2014 using the Layers list instead."); break; }
        continue;
      }
      // Nothing answered: Canva may only listen on the image itself.
      directClick(photo.n, pt.x, pt.y);
      if (await waitFor(photoToolbarStrict, 700)) return "ok";
      if (somethingSelected()) {
        await deselect();
        if (++covered >= 2) break;
      }
    }
    return "fail";
  }

  // Rows in Canva's Layers list, top to bottom: each holds a thumbnail.
  function layerRows(panel) {
    if (!panel) return [];
    const pr = panel.getBoundingClientRect();
    const rows = new Set();
    panel.querySelectorAll("img, canvas, svg").forEach(t => {
      const row = t.closest('[role="button"],button,[draggable="true"],[role="option"],[role="listitem"],li,[tabindex]');
      if (!row || !panel.contains(row) || mine(row)) return;
      const r = row.getBoundingClientRect();
      if (r.height < 30 || r.height > 120 || r.width < pr.width * 0.55) return;
      if (/^(all|overlapping|arrange|layers)$/i.test((row.textContent || "").trim())) return;
      rows.add(row);
    });
    return [...rows].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  // Way 2: pick the photo from Position -> Layers, checking each layer.
  async function selectPhotoByLayers(log, until) {
    // Position only opens with something selected; the headline is safe to pick.
    if (!somethingSelected()) {
      const he = headlineEl() || headlineAny();
      if (he) await clickHeadline(he, 1, log);
    }
    if (!(await openPositionPanel(log))) return "fail";
    const toTab = async (re) => {
      const p = findPositionPanel();
      const t = p && findTextEl(p, re);
      const c = t && clickable(t);
      if (c) { realClick(c); await sleep(450); }
    };
    await toTab(/^layers$/i);
    if (!layerRows(findPositionPanel()).length) { log("Couldn't read the Layers list."); return "fail"; }
    // Read the list fresh each time: switching tabs redraws it.
    for (let i = 0; ; i++) {
      if (Date.now() > until) break;
      const rows = layerRows(findPositionPanel());
      if (i >= rows.length) break;
      const row = rows[i];
      realClick(row) || uiClick(row);
      if (!(await waitFor(photoToolbarStrict, 900))) continue;
      // Confirm by shape before trusting it: Arrange shows the size.
      await toTab(/^arrange$/i);
      const f = await positionFields();
      const ok = f && f.w && f.h && !looksLikeFade(readNum(f.w), readNum(f.h));
      if (ok) { log("Selected the photo from the Layers list."); return "ok"; }
      log("That layer isn't the photo \u2014 checking the next one.");
      await toTab(/^layers$/i);
    }
    return "fail";
  }

  // Returns "ok", "none" (only graphics here, no photo) or "fail". Never runs
  // longer than about 14 seconds, so a run can't sit waiting.
  async function selectPhoto(log) {
    if (photoToolbarStrict()) return "ok";
    const until = Date.now() + 14000;

    // The headline's floating bar sits over the top of the photo. Clear it.
    await deselect();

    const a = await selectPhotoByClick(log, until);
    if (a === "ok") { log("Selected the photo."); return "ok"; }
    if (a === "none") { log("No photo on this page \u2014 only the fade. Skipped."); return "none"; }

    if (Date.now() < until) {
      log("Clicking didn't select the photo \u2014 trying Canva's Layers list.");
      const b = await selectPhotoByLayers(log, until);
      if (b === "ok") return "ok";
    }
    await deselect();
    log("Couldn't select the photo. Click it once in Canva, then try again.");
    return "fail";
  }


  const ADJUST_LABELS = /^(temperature|tint|brightness|contrast|highlights|shadows|whites|blacks|vibrance|saturation|sharpness|clarity|vignette)$/i;

  async function setAdjust(label, value, log) {
    const panel = findAdjustPanel();
    if (!panel) { log("Adjust panel closed before " + label + "."); return false; }
    const L = leafs(panel).find(e => new RegExp("^" + label + "$", "i").test((e.textContent || "").trim()))
      || [...panel.querySelectorAll("div,span,p,label")].find(e =>
        !e.childElementCount && new RegExp("^" + label + "$", "i").test((e.textContent || "").trim()));
    if (!L) { log(label + " not found in Adjust."); return false; }

    L.scrollIntoView({ block: "center" });
    await sleep(260);

    const lr = L.getBoundingClientRect();
    const next = leafs(panel)
      .filter(e => ADJUST_LABELS.test((e.textContent || "").trim()))
      .map(e => e.getBoundingClientRect())
      .filter(r => r.top > lr.bottom + 2)
      .sort((a, b) => a.top - b.top)[0];
    const limit = next ? next.top : lr.bottom + 90;
    const inRow = (n) => { const r = n.getBoundingClientRect(); return r.height > 0 && r.top >= lr.top - 6 && r.top < limit; };

    const inputs = [...panel.querySelectorAll("input")].filter(i => visible(i) && inRow(i));
    const box = inputs.find(i => i.type !== "range");
    const range = inputs.find(i => i.type === "range");
    const knob = [...panel.querySelectorAll('[role="slider"]')].find(n => visible(n) && inRow(n));

    const reads = () => {
      if (box) return readNum(box);
      if (range) return parseFloat(range.value);
      if (knob) return parseFloat(knob.getAttribute("aria-valuenow"));
      return NaN;
    };

    if (box) await setNum(box, value);
    else if (range) { setNativeValue(range, String(value)); await sleep(120); }
    else if (knob) {
      knob.focus();
      const now = parseFloat(knob.getAttribute("aria-valuenow"));
      if (!isNaN(now)) {
        const key = value > now ? "ArrowRight" : "ArrowLeft";
        const steps = Math.min(250, Math.round(Math.abs(value - now)));
        for (let i = 0; i < steps; i++) {
          knob.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true }));
          knob.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true }));
          if (i % 20 === 19) await sleep(8);
        }
      }
    } else { log("No control found for " + label + "."); return false; }

    await sleep(260);
    const got = reads();
    if (Math.abs(got - value) <= 0.5) { log(label + " set to " + value + "."); return true; }
    log(label + " didn't take \u2014 reads " + (isNaN(got) ? "nothing" : got) + ".");
    return false;
  }

  async function enhancePhoto(log) {
    if (!findAdjustPanel()) {
      const pick = await selectPhoto(log);
      if (pick === "none") return true;
      if (pick !== "ok") return false;

      if (!findEditImagePanel()) {
        const edit = findImageEditButton();
        if (!edit) { log("The photo's Edit button isn't showing."); return false; }
        realClick(edit);
        if (!(await waitFor(findEditImagePanel, 2600))) { log("Edit image didn't open."); return false; }
      }
      log("Opened Edit image.");

      const adj = clickableLeaf(findEditImagePanel(), /^adjust$/i);
      if (!adj) { log("Couldn't find Adjust in Edit image."); return false; }
      realClick(adj);
      if (!(await waitFor(findAdjustPanel, 2600))) { log("Adjust didn't open."); return false; }
    }
    log("Opened Adjust.");

    if (state.photoAuto) {
      const auto = clickableLeaf(findAdjustPanel(), /^auto[- ]?adjust$/i);
      if (auto) { realClick(auto); log("Auto-adjust applied."); await sleep(1600); }
      else log("Auto-adjust button not found \u2014 skipped it.");
    }

    let ok = true;
    for (const [label, key] of [["Sharpness", "photoSharp"], ["Clarity", "photoClarity"], ["Vignette", "photoVignette"]]) {
      if (!(await setAdjust(label, state[key], log))) ok = false;
    }
    return ok;
  }



  /* ---------- panel ---------- */

  let root, wrap;

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function build() {
    root = el("div", "hh-root hh-appear");
    root.setAttribute("dir", "ltr");
    setTimeout(() => root.classList.remove("hh-appear"), 400);
    wrap = el("div", "hh-panel");
    root.appendChild(wrap);
    document.body.appendChild(root);
    render();
    place();
  }

  // Everything here is derived from the live viewport. A size or position saved
  // on one screen must not strand the panel off-view on a smaller one.
  function place() {
    if (!root) return;
    const vw = window.innerWidth, vh = window.innerHeight;

    const maxW = Math.max(260, vw - 16);
    const w = Math.min((state.size && state.size.w) || 344, maxW);
    root.style.width = w + "px";

    // Keep at least a grabbable strip of the header on screen.
    const keep = Math.min(120, w);
    const defaultX = Math.max(4, vw - w - 24);
    let x = state.pos.x == null ? defaultX : state.pos.x;
    x = Math.max(4 - (w - keep), Math.min(x, vw - keep - 4));
    let y = Math.max(4, Math.min(state.pos.y == null ? 96 : state.pos.y, vh - 48));

    root.style.left = Math.round(x) + "px";
    root.style.top = Math.round(y) + "px";
    applySize();
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!root) return;
      if (state.size && state.size.w) state.size.w = Math.min(state.size.w, Math.max(260, window.innerWidth - 16));
      if (state.size && state.size.h) state.size.h = Math.min(state.size.h, Math.max(220, window.innerHeight - 16));
      place();
    }, 120);
  });


  /* ---------- Canva photo tools ---------- */

  const TI = (d) => '<svg viewBox="0 0 16 16" aria-hidden="true">' + d + '</svg>';

  const POSITION_TOOLS = [
    { id: "align", label: "Line up headline", group: "position",
      tip: "Stretch the headline to the page width, centre it, and sit it just above your @handle",
      icon: TI('<path d="M4 3.5h8M3 6.3h10M5 9.1h6"/><path d="M3 12.8h10" stroke-dasharray="1.6 1.6"/>') },
    { id: "undoalign", label: "Undo line-up", group: "position",
      tip: "Put the headline back where it was before the last line-up",
      icon: TI('<path d="M5.5 3.8L3 6.3l2.5 2.5"/><path d="M3 6.3h6.5a3.4 3.4 0 010 6.8H7"/>') },
    { id: "fillphoto", label: "Fill with photo", group: "position",
      tip: "Grow the photo evenly to fill the page from the top corners, then send it behind the headline",
      icon: TI('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5.5 5.5h5v4h-5z"/><path d="M5.5 5.5L3.2 3.2M10.5 5.5l2.3-2.3"/>') },
    { id: "undofill", label: "Undo photo fill", group: "position",
      tip: "Put the photo back as it was before the last fill",
      icon: TI('<path d="M5.5 3.8L3 6.3l2.5 2.5"/><path d="M3 6.3h6.5a3.4 3.4 0 010 6.8H7"/>') },
    { id: "tofront", label: "To front", group: "position",
      tip: "Put the selected layer in front of everything",
      icon: TI('<rect x="5" y="5" width="8.5" height="8.5" rx="1.2"/><path d="M2.5 10V3.5a1 1 0 011-1H10"/><path d="M9.2 11.2V7.6M7.6 9.2l1.6-1.6 1.6 1.6"/>') },
    { id: "forward", label: "Forward", group: "position",
      tip: "Move the selected layer up one",
      icon: TI('<path d="M8 12.5V4M5 7l3-3 3 3"/>') },
    { id: "backward", label: "Backward", group: "position",
      tip: "Move the selected layer down one",
      icon: TI('<path d="M8 3.5V12M5 9l3 3 3-3"/>') },
    { id: "toback", label: "To back", group: "position",
      tip: "Put the selected layer behind everything. With nothing selected, it takes the photo",
      icon: TI('<rect x="6" y="2.5" width="7.5" height="6" rx="1.2"/><path d="M4 6H3.5a1 1 0 00-1 1v5.5a1 1 0 001 1H9a1 1 0 001-1V12"/><path d="M7.5 10.5l-2.5 2.5"/>') }
  ];

  const PHOTO_TOOLS = [
    { id: "upscale", label: "Upscale", re: /^upscale$/i, apply: /^upscale( image)?$/i,
      icon: TI('<path d="M9.5 3H13v3.5M13 3L8.5 7.5"/><path d="M11 9.5V13H3V5h3.5"/>') },
    { id: "adjust", label: "Adjust", re: /^adjust$/i,
      icon: TI('<path d="M3 4.5h6M12 4.5h1M3 8h1M7 8h6M3 11.5h5M11 11.5h2"/><circle cx="10.5" cy="4.5" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="9.5" cy="11.5" r="1.5"/>') },
    { id: "bgremove", label: "BG Remover", re: /^bg remover$/i,
      icon: TI('<circle cx="8" cy="6.3" r="2"/><path d="M4.8 12.2c.6-1.8 1.8-2.7 3.2-2.7s2.6.9 3.2 2.7"/><path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11"/>') },
    { id: "eraser", label: "Magic Eraser", re: /^magic eraser$/i,
      icon: TI('<path d="M9.8 3.2l3 3-5.6 5.6H4.3L2.8 10.3a1 1 0 010-1.4z"/><path d="M6.2 6.8l3 3M7.3 11.8H13"/>') },
    { id: "magicedit", label: "Magic Edit", re: /^magic edit$/i,
      icon: TI('<path d="M3 13l7-7"/><path d="M10.5 2.5v2M13.5 5.5h-2M12.4 3.6l-1.2 1.2M6 3l.3 1.2M3 6l1.2.3"/>') },
    { id: "layers", label: "Magic Layers", re: /^magic layers$/i,
      icon: TI('<path d="M8 2.8l5.2 2.7L8 8.2 2.8 5.5z"/><path d="M2.8 8.2L8 10.9l5.2-2.7M2.8 10.8L8 13.5l5.2-2.7"/>') },
    { id: "bggen", label: "BG Generator", re: /^bg generator$/i,
      icon: TI('<rect x="2.5" y="4" width="11" height="8.5" rx="1.5"/><path d="M4.5 11l2.5-2.7 1.8 1.8 1.4-1.4 1.8 2.3"/><path d="M11.5 1.5v2M10.5 2.5h2"/>') },
    { id: "video", label: "Image to Video", re: /^image to video$/i,
      icon: TI('<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M7 6.3v3.4l2.8-1.7z"/>') }
  ];

  PHOTO_TOOLS.forEach(t => {
    t.group = "photo";
    t.tip = t.id === "adjust" ? "Auto-adjust, then your sharpness, clarity and vignette from Settings"
      : "Select the photo and open " + t.label;
  });
  const ALL_TOOLS = POSITION_TOOLS.concat(PHOTO_TOOLS);

  const ICON_TOOLS = TI('<rect x="3" y="3" width="4" height="4" rx="1"/><rect x="9" y="3" width="4" height="4" rx="1"/><rect x="3" y="9" width="4" height="4" rx="1"/><rect x="9" y="9" width="4" height="4" rx="1"/>');

  // The smallest element whose whole text is the label. Works when Canva wraps
  // a label over two lines ("Magic / Layers") or splits it across spans.
  function findTextEl(scope, re, maxLeft) {
    let best = null, bestA = Infinity;
    (scope || document.body).querySelectorAll("span,div,p,button,label").forEach(e => {
      if (mine(e) || !visible(e)) return;
      // innerText keeps a line break as a space, so "Magic<br>Layers" reads as
      // "Magic Layers". textContent would give "MagicLayers" and never match.
      const t = (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 40 || !re.test(t)) return;
      const r = e.getBoundingClientRect();
      if (maxLeft != null && r.left > maxLeft) return;
      const a = r.width * r.height;
      if (a < bestA) { bestA = a; best = e; }
    });
    return best;
  }

  // A tool's own panel may still be open from last time. Step back to the list.
  function findPanelBack() {
    return [...document.querySelectorAll('button,[role="button"]')]
      .filter(b => notMine(b) && visible(b) && safeToClick(b))
      .find(b => /^(back|go back)$/i.test((b.getAttribute("aria-label") || "").trim())
        && b.getBoundingClientRect().left < window.innerWidth * 0.45) || null;
  }

  async function openEditImage(log) {
    const pick = await selectPhoto(log);
    if (pick === "none") return { ok: false, why: "No photo on this page" };
    if (pick !== "ok") return { ok: false, why: "Couldn't select the photo" };

    for (let i = 0; i < 3 && !findEditImagePanel(); i++) {
      const back = findPanelBack();
      if (back) {
        realClick(back);
        if (await waitFor(findEditImagePanel, 1500)) break;
        continue;
      }
      const edit = findImageEditButton();
      if (!edit) break;
      realClick(edit);
      if (await waitFor(findEditImagePanel, 2400)) break;
    }
    if (!findEditImagePanel()) return { ok: false, why: "Edit image didn't open" };
    log("Opened Edit image.");
    return { ok: true };
  }

  async function openPhotoTool(t, log) {
    const e = await openEditImage(log);
    if (!e.ok) return { ok: false, msg: e.why };

    let tile = findTextEl(findEditImagePanel(), t.re);
    if (!tile) {
      // Only eight tools show at first; the rest sit behind "See all".
      const panel = findEditImagePanel();
      const heading = findTextEl(panel, /^tools$/i);
      const hy = heading ? heading.getBoundingClientRect().top : null;
      const more = [...(panel ? panel.querySelectorAll("span,div,p,button") : [])]
        .filter(x => visible(x) && /^see all$/i.test((x.innerText || x.textContent || "").replace(/\s+/g, " ").trim()))
        .sort((a, b) => Math.abs(a.getBoundingClientRect().top - (hy || 0)) - Math.abs(b.getBoundingClientRect().top - (hy || 0)))[0];
      if (more) {
        const c = clickable(more);
        if (c) { realClick(c); await sleep(800); }
        tile = findTextEl(document.body, t.re, window.innerWidth * 0.45);
      }
    }
    const btn = tile && clickable(tile);
    if (!btn) return { ok: false, msg: t.label + " isn't in Canva's Edit image panel" };

    realClick(btn);
    log("Opened " + t.label + ".");

    if (t.apply) {
      // Tools with a single go button get it pressed too.
      const go = await waitFor(() => [...document.querySelectorAll('button,[role="button"]')]
        .filter(b => notMine(b) && visible(b) && safeToClick(b) && b !== btn)
        .filter(b => t.apply.test((b.innerText || b.textContent || "").replace(/\s+/g, " ").trim()))
        .find(b => b.getBoundingClientRect().width > 120), 2600);
      if (go) { realClick(go); log("Started " + t.label + "."); return { ok: true, msg: t.label + " started" }; }
      log("Finish " + t.label + " in Canva's panel.");
    }
    return { ok: true, msg: t.label + " opened" };
  }

  // Canva's four Arrange buttons, under Position -> Arrange. They act on the
  // selected layer. "To back" with nothing selected takes the photo, since
  // that's the layer you'd usually want behind the text.
  const ARRANGE = {
    toback:   { re: /^to back$/i,  name: "To back",  done: "Sent to back",     already: "Already at the back",  pickPhoto: true },
    tofront:  { re: /^to front$/i, name: "To front", done: "Brought to front", already: "Already at the front" },
    forward:  { re: /^forward$/i,  name: "Forward",  done: "Moved forward",    already: "Already at the front" },
    backward: { re: /^backward$/i, name: "Backward", done: "Moved backward",   already: "Already at the back" }
  };

  async function arrangeLayer(id, log) {
    const a = ARRANGE[id];
    if (!somethingSelected()) {
      if (!a.pickPhoto) return { ok: false, msg: "Select a layer first" };
      log("Nothing selected \u2014 picking the photo.");
      const pick = await selectPhoto(log);
      if (pick !== "ok") return { ok: false, msg: "Select a layer first" };
    }
    if (!(await openPositionPanel(log))) return { ok: false, msg: "Position didn't open" };

    const findBtn = () => {
      const p = findPositionPanel();
      const t = p && findTextEl(p, a.re);
      return t ? clickable(t) : null;
    };
    let btn = findBtn();
    if (!btn) {
      // The panel remembers its last tab. These buttons live under Arrange.
      const p = findPositionPanel();
      const tab = p && findTextEl(p, /^arrange$/i);
      const c = tab && clickable(tab);
      if (c) { realClick(c); log("Switched to Arrange."); }
      btn = await waitFor(findBtn, 1800);
    }
    if (!btn) return { ok: false, msg: "Couldn't find " + a.name };
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") {
      log(a.already + ".");
      return { ok: true, msg: a.already };
    }
    realClick(btn);
    log(a.done + ".");
    return { ok: true, msg: a.done };
  }

  async function runPhotoTool(id, btn) {
    if (running) { toast("Wait for the current run to finish"); return; }
    const t = ALL_TOOLS.find(x => x.id === id);
    if (!t) return;
    running = true;
    logClear();
    const setTool = (st) => {
      toolState = { id: st ? t.id : null, s: st };
      const live = document.querySelector('.hh-pins [aria-label="' + t.label + '"]') || btn;
      if (!live) return;
      live.classList.remove("busy", "ok", "bad");
      if (st) live.classList.add(st);
      live.setAttribute("aria-busy", st === "busy" ? "true" : "false");
    };
    setTool("busy");
    let ok = false, msg = "";
    try {
      await clearLeftPanel(log);
      const once = async () => {
      if (t.id === "adjust") {
        ok = await enhancePhoto(log);
        msg = ok ? "Photo adjusted" : "Adjust didn't finish";
      } else if (ARRANGE[t.id]) {
        const r = await arrangeLayer(t.id, log);
        ok = r.ok;
        msg = r.msg;
      } else if (t.id === "fillphoto") {
        const r = await fillWithPhoto(log);
        ok = r.ok && !r.none;
        msg = r.msg;
      } else if (t.id === "undofill") {
        const r = await undoPhotoFill(log);
        ok = r.ok;
        msg = r.msg;
      } else if (t.id === "align") {
        ok = await placeHeadline(log);
        msg = ok ? "Headline lined up" : "Couldn't line it up";
      } else if (t.id === "undoalign") {
        const had = !!lastAlign;
        ok = await undoAlign(log);
        msg = ok ? "Headline put back" : had ? "Couldn't put it back" : "Nothing to undo yet";
      } else {
        const r = await openPhotoTool(t, log);
        ok = r.ok;
        msg = r.msg;
      }
      return ok;
      };
      // "Nothing to undo" and "select a layer first" aren't things a retry fixes.
      const worthRetry = () => !ok && !/nothing to undo|select a layer|no photo|select the photo/i.test(msg);
      await once();
      if (worthRetry()) {
        log("Trying " + t.label + " again after clearing the screen\u2026");
        await clearLeftPanel(log);
        await sleep(200);
        await once();
      }
    } catch (e) {
      log("Error: " + (e && e.message ? e.message : String(e)));
      msg = t.label + " didn't finish";
    } finally {
      running = false;
      setTool(ok ? "ok" : "bad");
      setTimeout(() => { if (toolState.id === t.id) setTool(null); }, 1300);
      celebrate(ok ? "done" : "fail", msg);
    }
  }

  /* ---------- view layer ---------- */

  // Plays the entrance motion only when the view actually changes. render() runs
  // on every edit, and replaying the motion each time would make the panel twitch.
  let lastViewKey = "";
  let showLog = false;
  let confirmClear = false;
  let toolMenuOpen = false;
  let toolState = { id: null, s: null };   // pinned tool mid-run: "busy" | "ok" | "bad"

  const ICON_CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l2.9 2.9 6.1-6.3"/></svg>';
  const ICON_CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';

  function sw(on, onToggle, label) {
    const b = el("button", "hh-switch" + (on ? " on" : ""));
    b.type = "button";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", on ? "true" : "false");
    if (label) b.setAttribute("aria-label", label);
    b.appendChild(el("span", "hh-knob"));
    b.onclick = (e) => {
      e.preventDefault();
      if (b.disabled) return;
      const next = !b.classList.contains("on");
      b.classList.toggle("on", next);
      b.setAttribute("aria-checked", next ? "true" : "false");
      onToggle(next);
    };
    return b;
  }

  function settingRow(label, hint, on, onToggle, extra) {
    const row = el("div", "hh-setting");
    const txt = el("div", "hh-settxt");
    txt.appendChild(el("div", "hh-setlabel", label));
    if (hint) txt.appendChild(el("div", "hh-sethint", hint));
    row.appendChild(txt);
    if (extra) row.appendChild(extra);
    row.appendChild(sw(on, onToggle, label));
    return row;
  }

  // A segmented control whose highlight slides to the new choice before the
  // view swaps, so the motion shows where you went.
  function segmented(options, current, onPick, cls) {
    const wrapEl = el("div", "hh-segmented " + (cls || ""));
    const ind = el("span", "hh-segind");
    wrapEl.appendChild(ind);
    const idx = Math.max(0, options.findIndex(o => o[0] === current));
    wrapEl.style.setProperty("--n", options.length);
    ind.style.transform = "translateX(" + (idx * 100) + "%)";
    options.forEach(([v, label], i) => {
      const b = el("button", "hh-segopt" + (v === current ? " on" : ""), label);
      b.type = "button";
      b.onclick = () => {
        if (v === current) return;
        ind.style.transform = "translateX(" + (i * 100) + "%)";
        wrapEl.querySelectorAll(".hh-segopt").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        setTimeout(() => onPick(v), 170);
      };
      wrapEl.appendChild(b);
    });
    return wrapEl;
  }

  function logDisclosure(body) {
    const det = el("div", "hh-details" + (showLog ? " open" : ""));
    const tog = el("button", "hh-linkbtn", showLog ? "Hide details" : "Show details");
    tog.type = "button";
    tog.onclick = () => {
      showLog = !showLog;
      det.classList.toggle("open", showLog);
      tog.textContent = showLog ? "Hide details" : "Show details";
      if (showLog) paintLog();
    };
    det.appendChild(tog);
    const box = el("div", "hh-log");
    box.id = "hh-log";
    det.appendChild(box);
    body.appendChild(det);
    if (showLog) paintLog();
  }

  function render() {
    wrap.innerHTML = "";
    root.style.setProperty("--hh-accent", firstStop(state.active) || "#FFC93C");
    root.style.setProperty("--hh-accent-ink", readable(state.active));

    /* header */
    const head = el("div", "hh-head");
    const grip = el("div", "hh-grip");
    grip.appendChild(el("span", "hh-dot"));
    grip.appendChild(el("span", "hh-title", "Highlighter"));
    const pill = el("span", "hh-autopill", "Auto");
    pill.title = "Automation is on: stories from Claude or ChatGPT run by themselves";
    grip.appendChild(pill);
    head.appendChild(grip);

    const tools = el("div", "hh-headtools");

    // Pinned Canva photo tools: one click each.
    const pins = el("div", "hh-pins");
    (state.pinnedTools || []).slice(0, 3).forEach(id => {
      const t = ALL_TOOLS.find(x => x.id === id);
      if (!t) return;
      const b = el("button", "hh-icon hh-tool");
      b.type = "button";
      b.innerHTML = '<span class="hh-ticon">' + t.icon + '</span>'
        + '<span class="hh-spinner" aria-hidden="true"></span>'
        + '<span class="hh-tstate ok" aria-hidden="true">' + ICON_CHECK + '</span>'
        + '<span class="hh-tstate bad" aria-hidden="true">' + ICON_CROSS + '</span>';
      if (toolState.id === t.id && toolState.s) b.classList.add(toolState.s);
      b.title = t.label;
      b.setAttribute("aria-label", t.label);
      b.onclick = () => runPhotoTool(t.id, b);
      pins.appendChild(b);
    });
    tools.appendChild(pins);

    const menuBtn = el("button", "hh-icon hh-tool" + (toolMenuOpen ? " on" : ""));
    menuBtn.type = "button";
    menuBtn.id = "hh-toolbtn";
    menuBtn.innerHTML = ICON_TOOLS;
    menuBtn.title = "Quick tools";
    menuBtn.setAttribute("aria-label", "Quick tools");
    menuBtn.setAttribute("aria-expanded", toolMenuOpen ? "true" : "false");
    menuBtn.onclick = () => { toolMenuOpen = !toolMenuOpen; confirmClear = false; render(); };
    tools.appendChild(menuBtn);
    tools.appendChild(el("span", "hh-headsep"));

    const rst = el("button", "hh-icon" + (confirmClear ? " armed" : ""), "\u21ba");
    rst.type = "button";
    rst.title = "Clear everything for the next post";
    rst.onclick = () => { confirmClear = !confirmClear; toolMenuOpen = false; render(); };
    tools.appendChild(rst);

    const grow = el("button", "hh-icon hh-tool" + (state.compact ? " on" : ""));
    grow.type = "button";
    grow.innerHTML = state.compact
      ? TI('<path d="M9.5 2.5h4v4M13.5 2.5l-4.5 4.5M6.5 13.5h-4v-4M2.5 13.5L7 9"/>')
      : TI('<path d="M13 7H9V3M9 7l4.5-4.5M3 9h4v4M7 9l-4.5 4.5"/>');
    grow.title = state.compact ? "Show the full panel" : "Compact: just the status and Run, so the design stays visible";
    grow.setAttribute("aria-label", grow.title);
    grow.setAttribute("aria-pressed", state.compact ? "true" : "false");
    grow.onclick = () => { state.compact = !state.compact; toolMenuOpen = false; store.save(); render(); };
    tools.appendChild(grow);

    const fold = el("button", "hh-icon", state.collapsed ? "+" : "\u2013");
    fold.type = "button";
    fold.title = state.collapsed ? "Expand" : "Collapse";
    fold.onclick = () => { state.collapsed = !state.collapsed; store.save(); render(); };
    tools.appendChild(fold);

    head.appendChild(tools);
    wrap.appendChild(head);

    if (toolMenuOpen && !state.collapsed) {
      const menu = el("div", "hh-toolmenu");
      menu.id = "hh-toolmenu";
      const addItem = (grid, t) => {
        const item = el("div", "hh-toolitem");
        const go = el("button", "hh-toolgo");
        go.type = "button";
        go.innerHTML = t.icon;
        go.appendChild(el("span", null, t.label));
        go.title = t.tip || t.label;
        go.onclick = () => { toolMenuOpen = false; render(); runPhotoTool(t.id, document.querySelector('.hh-pins [aria-label="' + t.label + '"]')); };
        item.appendChild(go);

        const pinned = (state.pinnedTools || []).includes(t.id);
        const pin = el("button", "hh-pin" + (pinned ? " on" : ""));
        pin.type = "button";
        pin.innerHTML = TI('<path d="M8 2.6l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.8l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"/>');
        pin.title = pinned ? "Unpin from the header" : "Pin to the header";
        pin.setAttribute("aria-label", pin.title + ": " + t.label);
        pin.onclick = () => {
          let list = (state.pinnedTools || []).slice();
          if (list.includes(t.id)) list = list.filter(x => x !== t.id);
          else {
            if (list.length >= 3) { toast("Three pins max \u2014 unpin one first"); return; }
            list.push(t.id);
          }
          state.pinnedTools = list;
          store.save();
          render();
        };
        item.appendChild(pin);
        grid.appendChild(item);
      };

      [["position", "Position"], ["photo", "Canva Edit image"]].forEach(([g, title]) => {
        menu.appendChild(el("div", "hh-menutitle", title));
        const grid = el("div", "hh-toolgrid");
        ALL_TOOLS.filter(t => t.group === g).forEach(t => addItem(grid, t));
        menu.appendChild(grid);
      });
      menu.appendChild(el("div", "hh-hint",
        "Star up to three to keep them in the header. Position tools act on the layer you've selected. Adjust uses your photo values from Settings."));
      wrap.appendChild(menu);
    }

    if (confirmClear && !state.collapsed) {
      const bar = el("div", "hh-confirm");
      bar.appendChild(el("span", "hh-confirmtxt", "Clear the paste box, headline, caption and results?"));
      const yes = el("button", "hh-btn danger", "Clear");
      yes.type = "button";
      yes.onclick = () => { confirmClear = false; clearAll(); render(); toast("Cleared \u2014 ready for the next post"); };
      const no = el("button", "hh-btn", "Cancel");
      no.type = "button";
      no.onclick = () => { confirmClear = false; render(); };
      bar.appendChild(yes);
      bar.appendChild(no);
      wrap.appendChild(bar);
      setTimeout(() => yes.focus(), 0);
    }
    head.addEventListener("pointerdown", startMove);
    if (state.collapsed) { applySize(); return; }

    const body = el("div", "hh-body");
    wrap.appendChild(body);
    wrap.appendChild(renderFooter());
    addGrips();

    if (!state.compact) {
    body.appendChild(segmented([["quick", "Quick"], ["manual", "Manual"]], state.view,
      (v) => { state.view = v; store.save(); render(); }, "hh-mode"));
    // A new version waiting: shown in both views, except on the Settings tab,
    // where the Updates section already says it.
    if (!(state.view === "manual" && state.mtab === "settings")) renderUpdateBar(body);
    }

    const view = el("div", "hh-view");
    const key = state.view + ":" + (state.view === "manual" ? state.mtab : "");
    if (key !== lastViewKey) { view.classList.add("hh-enter"); lastViewKey = key; }
    body.appendChild(view);

    const pillEl = root.querySelector(".hh-autopill");
    if (pillEl) pillEl.hidden = !state.autoMode;
    fitHeader();
    if (state.compact && !state.collapsed) { renderCompact(view); }
    else if (state.view === "quick") renderQuick(view);
    else {
      if (!["headline", "caption", "settings"].includes(state.mtab)) state.mtab = "headline";
      view.appendChild(segmented(
        [["headline", "Headline"], ["caption", "Caption"], ["settings", "Settings"]],
        state.mtab, (v) => { state.mtab = v; store.save(); render(); }, "hh-subtabs"));
      const inner = el("div", "hh-inner");
      view.appendChild(inner);
      if (state.mtab === "caption") renderCaption(inner);
      else if (state.mtab === "settings") renderSettings(inner);
      else renderHeadline(inner);
    }
    applySize();
  }

  /* ---------- Quick ---------- */

  const STAGES = [
    { id: "censor", label: "Censor words", key: "censorOn", desc: "Headline, caption and hashtags" },
    { id: "colour", label: "Colour the headline", key: "runHighlight", desc: "Picked phrases in your colour, the rest white" },
    { id: "align", label: "Fit and line up the headline", key: "alignAfter", desc: "Full width, centred, just above your @handle" },
    { id: "fill", label: "Fill the page with the photo", key: "photoFill", desc: "Full width from the top corners, behind the headline" },
    { id: "photo", label: "Enhance the photo", key: "photoInRun", desc: "Auto-adjust, then sharpness and clarity" },
    { id: "notes", label: "Fill Notes", key: "runNotes", desc: "Caption and hashtags" }
  ];

  let run = null;   // { status, detail, result } for the current or last run

  // No labels at all: a short single block is taken as a headline.
  function looseBundle(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    if (t.length <= 320 && !/\n\s*\n/.test(t)) return { headline: t };
    return null;
  }

  function quickBundle() {
    return parseBundle(state.bundle) || looseBundle(state.bundle);
  }

  function renderQuick(view) {
    const auto = el("div", "hh-autorow" + (state.autoMode ? " on" : ""));
    const at = el("div", "hh-autotext");
    at.appendChild(el("div", "hh-autotitle", "Automation"));
    at.appendChild(el("div", "hh-autosub", state.autoMode
      ? "On. Stories from Claude or ChatGPT go in and run by themselves."
      : "Off. Turn on to run stories from Claude or ChatGPT by themselves."));
    auto.appendChild(at);
    const asw = sw(!!state.autoMode, (on) => {
      state.autoMode = on;
      if (on) {
        state.autoOpenBox = true;          // automation needs to open the headline itself
        toast("Automation on \u2014 the next story runs by itself");
      } else {
        stopHold();
        toast("Automation off");
      }
      store.save();
      render();
    }, "Automation");
    auto.appendChild(asw);
    view.appendChild(auto);

    const ta = el("textarea", "hh-input hh-paste");
    ta.placeholder = "Paste your post here \u2014\n\nHeadline:\n\u2026\n\nCaption:\n\u2026\n\nHashtags:\n#one #two";
    ta.value = state.bundle;
    ta.spellcheck = false;
    ta.oninput = () => { state.bundle = ta.value; run = null; store.save(); paintDetected(); paintStages(); };
    ta.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuick(); } };
    view.appendChild(ta);

    const opts = el("div", "hh-options");
    opts.id = "hh-options";
    view.appendChild(opts);

    const found = el("div", "hh-found");
    found.id = "hh-found";
    view.appendChild(found);
    paintDetected();

    const sheet = el("div", "hh-sheet");
    sheet.id = "hh-steps";
    STAGES.forEach((st, i) => {
      const row = el("div", "hh-step");
      row.dataset.id = st.id;
      const mark = el("span", "hh-mark");
      mark.appendChild(el("span", "hh-num", String(i + 1)));
      const ok = el("span", "hh-ok"); ok.innerHTML = ICON_CHECK; mark.appendChild(ok);
      const no = el("span", "hh-no"); no.innerHTML = ICON_CROSS; mark.appendChild(no);
      mark.appendChild(el("span", "hh-spin"));
      row.appendChild(mark);

      const txt = el("div", "hh-steptxt");
      txt.appendChild(el("div", "hh-steplabel", st.label));
      txt.appendChild(el("div", "hh-stepdetail", st.desc));
      row.appendChild(txt);

      row.appendChild(sw(!!state[st.key], (on) => {
        state[st.key] = on;
        if (st.id === "censor") {
          if (state.text.trim()) prepHeadline();
          if (state.raw.trim()) state.caption = formatCaption(state.raw);
        }
        store.save();
        if (run && !running) run = null;
        paintStages();
      }, st.label));
      sheet.appendChild(row);
    });
    view.appendChild(sheet);

    if (autoHold && state.autoMode) {
      const hold = el("div", "hh-hold");
      hold.setAttribute("role", "status");
      const h = autoHold;
      const title = h.why === "nohead" ? "Waiting for a page with a headline"
        : h.why === "finished" ? "Waiting for a new page"
        : h.what === "arriving" ? "Photo arriving\u2026"
        : h.what === "checking" ? "Checking the photo\u2026"
        : "Waiting for the photo";
      const text = h.why === "nohead"
        ? "There's no headline box on this page. Open your template page and the story runs there by itself."
        : h.why === "finished"
        ? "This page already has a finished post (\u201c" + h.what + "\u2026\u201d). Open a new page and the story runs there by itself."
        : h.what === "same"
        ? "This page still has the last post's photo. Send the new one from PromptSnap and the run starts by itself."
        : h.what === "arriving"
        ? "A new photo is coming into the design. The run starts as soon as it has fully loaded."
        : h.what === "checking"
        ? "There's a new photo in the design. Making sure it has finished loading, then the run starts."
        : "No photo in the design yet. Send it from PromptSnap, or add it yourself, and the run starts by itself.";
      hold.appendChild(el("div", "hh-holdtitle", title));
      hold.appendChild(el("div", "hh-holdtext", text));
      const row = el("div", "hh-holdrow");
      const here = el("button", "hh-btn", h.why === "photo" ? "Run now" : "Run here anyway");
      here.type = "button";
      here.onclick = () => {
        stopHold(); render();
        if (h.why === "photo") { photoSkip = true; autoStart(); } else runQuick();
      };
      const stop = el("button", "hh-btn", "Stop waiting");
      stop.type = "button";
      stop.onclick = () => { stopHold(); render(); toast("Stopped \u2014 press Run when you're ready"); };
      row.appendChild(here);
      row.appendChild(stop);
      hold.appendChild(row);
      view.appendChild(hold);
    }

    const go = el("button", "hh-go");
    go.id = "hh-go";
    go.type = "button";
    go.appendChild(el("span", "hh-golabel", "Run"));
    const bar = el("span", "hh-gobar");
    bar.id = "hh-gobar";
    go.appendChild(bar);
    go.onclick = runQuick;
    view.appendChild(go);

    const result = el("div", "hh-result");
    result.id = "hh-result";
    view.appendChild(result);

    view.appendChild(el("div", "hh-hint hh-center", "Ctrl + Enter runs it from the paste box."));
    logDisclosure(view);

    paintStages();
    paintResult();
  }

  function paintDetected() {
    const host = document.getElementById("hh-found");
    const optHost = document.getElementById("hh-options");
    if (!host) return;
    host.innerHTML = "";
    if (optHost) optHost.innerHTML = "";

    if (!state.bundle.trim()) { host.classList.add("empty"); return; }
    host.classList.remove("empty");

    const opts = splitOptions(state.bundle);
    if (opts && optHost) {
      optHost.appendChild(segmented(opts.map((o, i) => [i, o.label + (o.rating ? "  " + o.rating : "")]),
        Math.min(state.optionIndex || 0, opts.length - 1),
        (i) => { state.optionIndex = i; store.save(); paintDetected(); }, "hh-optseg"));
    }

    const b = quickBundle();
    const cell = (label, value, ok) => {
      const c = el("div", "hh-cell" + (ok ? "" : " miss"));
      c.appendChild(el("div", "hh-cellval", value));
      c.appendChild(el("div", "hh-celllabel", label));
      host.appendChild(c);
    };
    if (!b) {
      host.appendChild(el("div", "hh-foundnote",
        "No Headline or Caption labels found. Add them, or paste just the headline on its own."));
      return;
    }
    const n = bundleTagCount(b);
    cell("Headline", b.headline ? b.headline.trim().length + " chars" : "Missing", !!b.headline);
    cell("Caption", b.caption ? b.caption.trim().length.toLocaleString() + " chars" : "None", !!b.caption);
    cell("Hashtags", n ? String(n) : "None", n > 0);
  }

  function paintStages() {
    paintCompact();
    const host = document.getElementById("hh-steps");
    if (!host) return;
    const b = run ? null : (state.bundle.trim() ? quickBundle() : null);
    STAGES.forEach(st => {
      const row = host.querySelector('[data-id="' + st.id + '"]');
      if (!row) return;
      let s, detail = st.desc;
      if (run) {
        s = run.status[st.id] || "wait";
        if (run.detail[st.id]) detail = run.detail[st.id];
      } else {
        s = state[st.key] ? "ready" : "off";
        if (s === "ready" && b) {
          if ((st.id === "colour" || st.id === "align") && !b.headline) detail = "No headline in what you pasted";
          if (st.id === "notes" && !b.caption && !b.tags) detail = "No caption in what you pasted";
        }
        if (s === "off") detail = "Off";
      }
      row.dataset.s = s;
      row.querySelector(".hh-stepdetail").textContent = detail;
      const t = row.querySelector(".hh-switch");
      if (t) t.disabled = running;
    });

    const bar = document.getElementById("hh-gobar");
    const go = document.getElementById("hh-go");
    if (go) {
      const label = go.querySelector(".hh-golabel");
      go.classList.toggle("busy", running);
      if (running && run) {
        const live = STAGES.filter(st => run.status[st.id] !== "skip");
        const settled = live.filter(st => ["done", "fail"].includes(run.status[st.id])).length;
        const cur = live.findIndex(st => run.status[st.id] === "run");
        if (bar) bar.style.transform = "scaleX(" + (live.length ? settled / live.length : 0) + ")";
        if (label) label.textContent = cur >= 0 ? "Step " + (cur + 1) + " of " + live.length + ": " + live[cur].label : "Running";
      } else {
        if (bar) bar.style.transform = "scaleX(0)";
        if (label) label.textContent = run && run.result ? "Run again" : "Run";
      }
    }
  }

  function paintResult() {
    paintCompact();
    const host = document.getElementById("hh-result");
    if (!host) return;
    host.innerHTML = "";
    host.className = "hh-result";
    if (!run || !run.result) return;
    host.classList.add("show", run.result.kind);
    const ic = el("span", "hh-resicon");
    ic.innerHTML = run.result.kind === "done" ? ICON_CHECK : ICON_CROSS;
    host.appendChild(ic);
    host.appendChild(el("span", "hh-restext", run.result.text));
    if (run.result.kind === "done") {
      const next = el("button", "hh-linkbtn", "Clear for next post");
      next.type = "button";
      next.onclick = () => { clearAll(); render(); };
      host.appendChild(next);
    } else if (!showLog) {
      const why = el("button", "hh-linkbtn", "See what happened");
      why.type = "button";
      why.onclick = () => { showLog = true; render(); };
      host.appendChild(why);
    }
  }

  function setStage(id, s, detail) {
    if (!run) return;
    run.status[id] = s;
    if (detail != null) run.detail[id] = detail;
    paintStages();
  }

  const censoredWords = (s) => (String(s || "").match(/[A-Za-z]*[*\u00a3][A-Za-z*\u00a3]*/g) || []).length;

  async function runQuick() {
    if (running) return;
    if (!state.bundle.trim()) { toast("Paste your post first"); return; }
    const b = quickBundle();
    if (!b) { toast("Add Headline: and Caption: labels, or paste just the headline"); return; }

    running = true;
    logClear();
    finished = false;
    run = { status: {}, detail: {}, result: null };
    STAGES.forEach(st => { run.status[st.id] = state[st.key] ? "wait" : "skip"; });
    if (!b.headline) ["colour", "align"].forEach(id => {
      if (run.status[id] !== "skip") { run.status[id] = "skip"; run.detail[id] = "No headline in what you pasted"; }
    });
    if (!b.caption && !b.tags && run.status.notes !== "skip") {
      run.status.notes = "skip"; run.detail.notes = "No caption in what you pasted";
    }
    paintResult();
    paintStages();

    let done = 0, failed = 0;
    const step = async (id, fn) => {
      if (run.status[id] === "skip") return null;
      setStage(id, "run");
      let ok = false, detail = null;
      try {
        const r = await fn();
        ok = r === true || !!(r && r.ok);
        detail = r && r.detail;
      } catch (e) {
        log("Error: " + (e && e.message ? e.message : String(e)));
      }
      setStage(id, ok ? "done" : "fail", detail || (ok ? "Done" : "Didn't finish"));
      ok ? done++ : failed++;
      return ok;
    };

    try {
      // Splitting, dash tidying and caption formatting always happen. Censoring
      // is part of the same pass when its step is on.
      const before = censoredWords([b.headline, b.caption, b.tags].join(" "));
      await step("censor", async () => {
        applyBundle(b);
        const n = censoredWords(state.text + " " + state.caption) - before;
        return { ok: true, detail: n > 0 ? n + " word" + (n === 1 ? "" : "s") + " censored" : "Nothing needed censoring" };
      });
      if (run.status.censor === "skip") applyBundle(b);
      log("Caption formatted \u2014 " + state.caption.length + " characters.");

      const coloured = await step("colour", async () => {
        await clearLeftPanel(log);
        const ok = await withRetry(async () => {
          const r = await coreSet();
          if (!r) setStage("colour", "run", "Trying again\u2026");
          return r;
        }, log, "the colouring");
        const n = state.phrases.length;
        return { ok, detail: ok ? n + " phrase" + (n === 1 ? "" : "s") + " coloured" : "Couldn't finish colouring" };
      });

      if (coloured === false && run.status.align === "wait") {
        run.status.align = "skip";
        run.detail.align = "Skipped \u2014 the headline didn't finish";
        paintStages();
      }
      await step("align", async () => {
        await clearLeftPanel(log);
        const ok = await withRetry(async () => {
          const r = await placeHeadline(log);
          if (!r) setStage("align", "run", "Trying again\u2026");
          return r;
        }, log, "the line-up");
        return { ok, detail: ok ? "Sitting just above the handle" : "Couldn't line it up" };
      });

      await step("fill", async () => {
        await clearLeftPanel(log);
        const r = await withRetry(async () => {
          const x = await fillWithPhoto(log);
          if (!x.ok) setStage("fill", "run", "Trying again\u2026");
          return x;
        }, log, "the photo fill");
        return { ok: r.ok, detail: r.msg };
      });

      await step("photo", async () => {
        await clearLeftPanel(log);
        const ok = await withRetry(async () => {
          const r = await enhancePhoto(log);
          if (!r) setStage("photo", "run", "Trying again\u2026");
          return r;
        }, log, "the photo");
        const none = logLines.some(l => /^No photo on this page/.test(l));
        return { ok, detail: none ? "No photo on this page" : ok ? "Adjusted" : "Couldn't finish the photo" };
      });

      // Opening Notes pulls focus away from the text box, so it goes last.
      await step("notes", async () => {
        await clearLeftPanel(log, { keepNotes: true });
        await sleep(250);
        const ok = await withRetry(async () => {
          const r = await coreNotes();
          if (!r) setStage("notes", "run", "Trying again\u2026");
          return r;
        }, log, "Notes", { keepNotes: true });
        return { ok, detail: ok ? "Caption is in Notes" : "Copied \u2014 paste it into Notes" };
      });
    } finally {
      const total = done + failed;
      const kind = failed ? (done ? "part" : "fail") : "done";
      run.result = {
        kind,
        text: !total ? "Nothing to run" : failed ? done + " of " + total + " steps done" : "All " + total + " steps done"
      };
      finished = !failed;
      running = false;
      if (done && b.headline) {
        const pn = pageNumber();
        const pp = pagePhoto();
        state.lastPost = { key: storyKey(state.text || b.headline), page: pn ? pn.cur : null, photo: pp ? photoKey(pp.src) : null };
      }
      photoSkip = false;
      store.save();
      paintStages();
      paintResult();
      chime(kind);
      setTimeout(drainQueue, 900);
    }
  }

  function clearAll() {
    resetWork();
    state.bundle = "";
    state.optionIndex = 0;
    run = null;
    store.save();
  }

  /* ---------- Manual: Headline ---------- */

  function renderHeadline(body) {
    const ta = el("textarea", "hh-input");
    ta.placeholder = "Paste the headline here.";
    ta.value = state.text;
    ta.oninput = () => {
      state.text = ta.value;
      state.tokens = tokenize(state.text);
      state.phrases = [];
      state.cursor = -1;
      store.save();
      renderChips();
      renderList();
    };
    // Tidy on paste rather than on every keystroke, so a dash can still be typed.
    ta.onpaste = () => setTimeout(() => {
      const b = parseBundle(ta.value);
      if (b) {
        state.bundle = ta.value;
        applyBundle(b);
        render();
        toast("Split into " + bundleSummary(b));
        return;
      }
      state.text = ta.value;
      prepHeadline();
      render();
    }, 0);
    body.appendChild(ta);

    /* colour */
    const colours = el("div", "hh-group");
    colours.appendChild(el("div", "hh-grouptitle", "Colour"));

    const pal = el("div", "hh-pal");
    state.palette.forEach((hex, i) => {
      const s = el("button", "hh-sw" + (hex === state.active ? " on" : ""));
      s.type = "button";
      s.style.background = cssFor(hex);
      s.title = labelFor(hex) + (isGrad(hex)
        ? " \u2014 gradient. Click to use, Alt-click to remove."
        : " \u2014 click to use, double-click to edit, Alt-click to remove");
      s.onclick = (e) => {
        if (e.altKey) {
          if (state.palette.length <= 2) { toast("Keep at least two colours"); return; }
          state.palette.splice(i, 1);
          if (state.active === hex) state.active = state.palette[0];
          store.save(); render(); return;
        }
        state.active = hex; store.save(); render();
      };
      s.ondblclick = (e) => {
        e.preventDefault();
        if (isGrad(hex)) { toast("Gradients can't be edited here"); return; }
        const inp = el("input");
        inp.type = "color"; inp.value = hex; inp.className = "hh-hidden";
        document.body.appendChild(inp);
        inp.oninput = () => {
          const nv = inp.value.toUpperCase();
          state.palette[i] = nv;
          if (state.active === hex) state.active = nv;
          state.tokens.forEach(t => { if (t.color === hex) t.color = nv; });
          buildPhrases(); store.save(); render();
        };
        inp.onchange = () => inp.remove();
        inp.click();
      };
      pal.appendChild(s);
    });
    colours.appendChild(pal);

    const hexRow = el("div", "hh-hexrow");
    const prev = el("span", "hh-prev");
    prev.style.background = cssFor(state.active);
    hexRow.appendChild(prev);
    const hexIn = el("input", "hh-hexin");
    hexIn.type = "text";
    hexIn.placeholder = "Paste a colour code";
    hexIn.value = isGrad(state.active) ? gradStops(state.active).join(", ") : state.active.toUpperCase();
    hexIn.spellcheck = false;
    hexRow.appendChild(hexIn);
    const useBtn = el("button", "hh-btn", "Use");
    useBtn.type = "button";
    hexRow.appendChild(useBtn);
    const commit = () => {
      const h = useColor(hexIn.value);
      if (!h) { toast("That isn't a colour code"); return; }
      render();
      toast(h + " ready");
    };
    useBtn.onclick = commit;
    hexIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } };
    hexIn.oninput = () => {
      const h = normalizeHex(hexIn.value);
      prev.style.background = h || "transparent";
      hexIn.classList.toggle("bad", !!hexIn.value.trim() && !h);
    };
    hexIn.onfocus = () => hexIn.select();
    colours.appendChild(hexRow);

    const pickBtn = el("button", "hh-btn wide", "Pick colours from this design");
    pickBtn.type = "button";
    pickBtn.title = "Read the swatches in Canva's Text color panel and the colours in your text box";
    pickBtn.onclick = pickFromDesign;
    colours.appendChild(pickBtn);
    body.appendChild(colours);

    /* phrases */
    const phr = el("div", "hh-group");
    phr.appendChild(el("div", "hh-grouptitle", "Highlights"));

    const acts = el("div", "hh-acts");
    const mk = (label, cls, fn, tip) => {
      const b = el("button", "hh-btn " + cls, label);
      b.type = "button";
      if (tip) b.title = tip;
      b.onclick = fn;
      acts.appendChild(b);
    };
    mk("Auto-pick", "", () => { prepHeadline(); render(); }, "Censor, tidy, then pick the strongest phrases");
    mk("Censor", "", () => {
      state.text = applyCensor(state.text, state.censorMap);
      state.tokens = tokenize(state.text);
      state.phrases = []; state.cursor = -1;
      autoPick(); store.save(); render();
    }, "Apply the censor list now");
    mk("Clear", "", () => { state.tokens.forEach(t => t.color = null); state.phrases = []; state.cursor = -1; render(); },
      "Remove every highlight");
    mk("Copy", "", async () => {
      try { await navigator.clipboard.writeText(state.text); toast("Headline copied"); } catch (e) { toast("Copy failed"); }
    }, "Copy the headline text");
    phr.appendChild(acts);

    phr.appendChild(segmented([["light", "Light"], ["medium", "Medium"], ["heavy", "Heavy"]], state.strength, (v) => {
      state.strength = v; store.save();
      if (state.text.trim()) { if (!state.tokens.length) state.tokens = tokenize(state.text); autoPick(); }
      render();
    }, "hh-small"));

    const chipWrap = el("div", "hh-chips");
    chipWrap.id = "hh-chips";
    phr.appendChild(chipWrap);
    phr.appendChild(el("div", "hh-hint", "Click a word to add or remove it."));

    const listWrap = el("div", "hh-list");
    listWrap.id = "hh-list";
    phr.appendChild(listWrap);
    body.appendChild(phr);

    const setBtn = el("button", "hh-btn primary wide", "Set all highlights");
    setBtn.id = "hh-set";
    setBtn.type = "button";
    setBtn.title = "Colour every phrase in the open Canva text box";
    setBtn.onclick = runSet;
    body.appendChild(setBtn);

    const r2 = el("div", "hh-run");
    const next = el("button", "hh-btn wide", "Select next phrase");
    next.type = "button";
    next.title = "Select one phrase in Canva so you can colour it yourself (Alt + N)";
    next.onclick = stepNext;
    r2.appendChild(next);
    const prog = el("div", "hh-prog");
    prog.id = "hh-prog";
    r2.appendChild(prog);
    body.appendChild(r2);

    logDisclosure(body);
    renderChips();
    renderList();
  }

  /* ---------- Manual: Caption ---------- */

  function renderCaption(body) {
    const raw = el("textarea", "hh-input hh-tall");
    raw.placeholder = "Paste the caption here.";
    raw.value = state.raw;
    raw.oninput = () => { state.raw = raw.value; store.save(); };
    raw.onpaste = () => setTimeout(() => {
      const b = parseBundle(raw.value);
      if (b && b.headline) {
        state.bundle = raw.value;
        applyBundle(b);
        render();
        toast("Split into " + bundleSummary(b));
        return;
      }
      state.raw = raw.value;
      store.save();
    }, 0);
    body.appendChild(raw);

    const acts = el("div", "hh-acts hh-acts3");
    const mk = (label, cls, fn, tip) => {
      const b = el("button", "hh-btn " + cls, label);
      b.type = "button";
      if (tip) b.title = tip;
      b.onclick = fn;
      acts.appendChild(b);
    };
    mk("Format", "primary", () => {
      if (!state.raw.trim()) { toast("Paste the caption first"); return; }
      state.caption = formatCaption(state.raw);
      store.save(); render();
    }, "Clean it up, split paragraphs, censor, add hashtags");
    mk("Re-tag", "", () => {
      if (!state.caption) { toast("Format it first"); return; }
      const stripped = state.caption.replace(/\n\n(#[^\n]*)$/, "");
      const srcTags = (state.raw.match(TAG_RE) || []);
      let tags = buildTags(stripped, srcTags).join(" ");
      if (state.censorOn && tags) tags = applyCensor(tags, state.censorMap);
      state.caption = stripped + (tags ? "\n\n" + tags : "");
      store.save(); render();
    }, "Rebuild the hashtag line");
    mk("Copy", "", async () => {
      try { await navigator.clipboard.writeText(state.caption); toast("Caption copied"); } catch (e) { toast("Copy failed"); }
    });
    body.appendChild(acts);

    const fmt2 = el("div", "hh-group");
    fmt2.appendChild(el("div", "hh-grouptitle", "Paragraphs"));
    fmt2.appendChild(segmented([[2, "2"], [3, "3"], [4, "4"], [0, "Keep mine"]], state.paras, (v) => {
      state.paras = v;
      if (state.raw.trim()) state.caption = formatCaption(state.raw);
      store.save(); render();
    }, "hh-small"));
    fmt2.appendChild(el("div", "hh-grouptitle", "Hashtags"));
    fmt2.appendChild(segmented([["keep", "Keep mine"], ["suggest", "Suggest"], ["both", "Both"], ["none", "None"]], state.tagMode, (v) => {
      state.tagMode = v;
      if (state.raw.trim()) state.caption = formatCaption(state.raw);
      store.save(); render();
    }, "hh-small"));

    const tagRow = el("div", "hh-hexrow");
    tagRow.appendChild(el("span", "hh-taglabel", "Always add"));
    const tagIn = el("input", "hh-hexin hh-taginput");
    tagIn.type = "text";
    tagIn.value = state.tags;
    tagIn.placeholder = "#viralstory";
    tagIn.oninput = () => { state.tags = tagIn.value; store.save(); };
    tagRow.appendChild(tagIn);
    fmt2.appendChild(tagRow);
    body.appendChild(fmt2);

    const out = el("textarea", "hh-input hh-tall");
    out.placeholder = "The finished caption appears here. You can edit it.";
    out.value = state.caption;
    const count = el("div", "hh-count", state.caption.length.toLocaleString() + " / 5,000");
    if (state.caption.length > 5000) count.classList.add("over");
    out.oninput = () => {
      state.caption = out.value;
      count.textContent = state.caption.length.toLocaleString() + " / 5,000";
      count.classList.toggle("over", state.caption.length > 5000);
      store.save();
    };
    body.appendChild(out);
    body.appendChild(count);

    const notesBtn = el("button", "hh-btn primary wide", "Send to Notes");
    notesBtn.id = "hh-notes";
    notesBtn.type = "button";
    notesBtn.onclick = runNotes;
    body.appendChild(notesBtn);

    body.appendChild(el("div", "hh-hint", "Format cleans and paragraphs the text. It doesn't rewrite the story."));
    logDisclosure(body);
  }

  /* ---------- Manual: Settings ---------- */

  function renderSettings(body) {
    renderUpdates(body);

    const g1 = el("div", "hh-group");
    g1.appendChild(el("div", "hh-grouptitle", "Headline"));
    g1.appendChild(settingRow("Censor sensitive words", "Headline, caption and hashtags", !!state.censorOn, (on) => {
      state.censorOn = on; store.save();
      if (on && state.text.trim()) prepHeadline();
      if (state.raw.trim()) state.caption = formatCaption(state.raw);
    }));
    g1.appendChild(settingRow("Drop the full stop at the end", "Also clears any empty line left under the headline", !!state.dropStop, (on) => {
      state.dropStop = on; store.save(); if (on && state.text.trim()) prepHeadline();
    }));
    g1.appendChild(settingRow("Turn dashes into commas", "Hyphens inside words are left alone", !!state.headDashes, (on) => {
      state.headDashes = on; store.save(); if (on) tidyHeadline();
    }));

    const baseSw = el("button", "hh-basesw");
    baseSw.type = "button";
    baseSw.style.background = state.baseColor;
    baseSw.title = state.baseColor + " \u2014 click to change";
    baseSw.onclick = (e) => {
      e.preventDefault();
      const inp = el("input");
      inp.type = "color"; inp.value = state.baseColor; inp.className = "hh-hidden";
      document.body.appendChild(inp);
      inp.oninput = () => { state.baseColor = inp.value.toUpperCase(); baseSw.style.background = state.baseColor; store.save(); };
      inp.onchange = () => inp.remove();
      inp.click();
    };
    g1.appendChild(settingRow("Keep the rest of the headline this colour", "Checked letter by letter after every run",
      !!state.resetBase, (on) => { state.resetBase = on; store.save(); }, baseSw));
    g1.appendChild(settingRow("Fit and line up the headline after colouring", "Also used by Set all highlights",
      !!state.alignAfter, (on) => { state.alignAfter = on; store.save(); }));
    g1.appendChild(settingRow("Stretch to fill the width", "Widens the box to the page and grows the text with it, then centres",
      !!state.fitWidth, (on) => { state.fitWidth = on; store.save(); }));

    g1.appendChild(el("div", "hh-setlabel hh-spaced", "How colour is applied"));
    g1.appendChild(segmented([["auto", "Auto"], ["paste", "Paste"], ["toolbar", "Colour panel"]], state.method,
      (v) => { state.method = v; store.save(); render(); }, "hh-small"));
    body.appendChild(g1);

    const g2 = el("div", "hh-group");
    g2.appendChild(el("div", "hh-grouptitle", "Caption"));
    g2.appendChild(settingRow("Strip # marks and bullets", "Real hashtags are kept", !!state.tidyMarks, (on) => {
      state.tidyMarks = on; store.save(); if (state.raw.trim()) state.caption = formatCaption(state.raw);
    }));
    g2.appendChild(settingRow("Turn dashes into commas", "In the caption", !!state.tidyDashes, (on) => {
      state.tidyDashes = on; store.save(); if (state.raw.trim()) state.caption = formatCaption(state.raw);
    }));
    body.appendChild(g2);

    const gp = el("div", "hh-group");
    gp.appendChild(el("div", "hh-grouptitle", "Photo"));
    gp.appendChild(el("div", "hh-hint", "Used by the Adjust tool and the Enhance the photo step."));
    gp.appendChild(settingRow("Run Auto-adjust first", "Clicks Canva's Auto-adjust before the values below",
      !!state.photoAuto, (on) => { state.photoAuto = on; store.save(); }));
    const grid = el("div", "hh-nums");
    [["Sharpness", "photoSharp"], ["Clarity", "photoClarity"], ["Vignette", "photoVignette"]].forEach(([label, k]) => {
      const cell = el("label", "hh-num");
      cell.appendChild(el("span", null, label));
      const inp = el("input", "hh-hexin hh-numin");
      inp.type = "number"; inp.min = "-100"; inp.max = "100"; inp.step = "1";
      inp.value = String(state[k]);
      inp.oninput = () => { state[k] = Math.max(-100, Math.min(100, Math.round(+inp.value || 0))); store.save(); };
      cell.appendChild(inp);
      grid.appendChild(cell);
    });
    gp.appendChild(grid);
    body.appendChild(gp);

    const g3 = el("div", "hh-group");
    g3.appendChild(el("div", "hh-grouptitle", "Canva"));
    g3.appendChild(settingRow("Open the text box for me", "Clicks a word in your headline, never Canva's buttons",
      !!state.autoOpenBox, (on) => { state.autoOpenBox = on; store.save(); }));
    g3.appendChild(settingRow("Automation", "Stories from Claude or ChatGPT go in and run by themselves, only on a safe page",
      !!state.autoMode, (on) => { state.autoMode = on; if (on) state.autoOpenBox = true; else stopHold(); store.save(); render(); }));
    g3.appendChild(settingRow("Wait for the photo", "With Automation on, the run starts once a new photo is in the design \u2014 from PromptSnap or added yourself",
      !!state.waitPhoto, (on) => { state.waitPhoto = on; store.save(); }));
    g3.appendChild(settingRow("Close side panels first", "Shuts Elements, Notes and the like before a task, so nothing covers the design",
      !!state.closePanels, (on) => { state.closePanels = on; store.save(); }));
    g3.appendChild(settingRow("Sounds", "A short chime when a run finishes", !state.muted, (on) => {
      state.muted = !on; store.save(); if (on) chime("done");
    }));
    body.appendChild(g3);

    const g4 = el("div", "hh-group");
    g4.appendChild(el("div", "hh-grouptitle", "Your censor list"));
    g4.appendChild(el("div", "hh-hint", "One per line, like kill=k*ll. A built-in list is always applied too. Use word=word to switch one off."));
    const cta = el("textarea", "hh-censor");
    cta.value = state.censorMap;
    cta.spellcheck = false;
    cta.oninput = () => { state.censorMap = cta.value; store.save(); };
    g4.appendChild(cta);
    body.appendChild(g4);
  }

  function renderChips() {
    const host = document.getElementById("hh-chips");
    if (!host) return;
    host.innerHTML = "";
    if (!state.tokens.length && state.text) state.tokens = tokenize(state.text);
    state.tokens.forEach((tok, i) => {
      if (!tok.word) { host.appendChild(document.createTextNode(" ")); return; }
      const c = el("button", "hh-chip", tok.t);
      if (tok.color) {
        c.style.background = cssFor(tok.color);
        c.style.color = readable(tok.color);
        c.classList.add("lit");
      }
      c.onclick = () => {
        tok.color = tok.color === state.active ? null : state.active;
        buildPhrases(); renderChips(); renderList();
      };
      host.appendChild(c);
    });
  }

  function renderList() {
    const host = document.getElementById("hh-list");
    const prog = document.getElementById("hh-prog");
    if (!host) return;
    host.innerHTML = "";
    if (!state.phrases.length) {
      host.appendChild(el("div", "hh-empty", "No phrases picked yet."));
      if (prog) prog.textContent = "";
      return;
    }
    state.phrases.forEach((p, i) => {
      const r = el("div", "hh-row" + (i === state.cursor ? " on" : ""));
      const dot = el("span", "hh-rdot");
      dot.style.background = cssFor(p.color);
      r.appendChild(dot);
      r.appendChild(el("span", "hh-rtxt", p.text));
      const hex = el("code", "hh-hex", isGrad(p.color) ? "gradient" : p.color.toUpperCase());
      hex.title = "Copy " + labelFor(p.color);
      hex.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(labelFor(p.color)).then(() => toast("Copied"));
      };
      r.appendChild(hex);
      r.onclick = () => { state.cursor = i; doSelect(i); };
      host.appendChild(r);
    });
    if (prog) prog.textContent = (state.cursor + 1) + " / " + state.phrases.length;
  }

  function stepNext() {
    if (!state.phrases.length) { toast("Pick some words first"); return; }
    state.cursor = (state.cursor + 1) % state.phrases.length;
    doSelect(state.cursor);
  }

  function doSelect(i) {
    const p = state.phrases[i];
    const res = selectPhrase(p.text, p.occ);
    renderList();
    if (!res.ok) { toast(res.why); return; }
    toast("Selected — now click " + p.color.toUpperCase() + " in Canva");
  }

  let logLines = [];

  function log(msg) {
    logLines.push(msg);
    const host = document.getElementById("hh-log");
    if (!host) return;
    const line = el("div", "hh-logline", msg);
    host.appendChild(line);
    host.scrollTop = host.scrollHeight;
  }

  function logClear() {
    logLines = [];
    const host = document.getElementById("hh-log");
    if (host) host.innerHTML = "";
  }

  function paintLog() {
    const host = document.getElementById("hh-log");
    if (!host) return;
    host.innerHTML = "";
    logLines.forEach(m => host.appendChild(el("div", "hh-logline", m)));
    host.scrollTop = host.scrollHeight;
  }

  function setBusy(on) {
    const b = document.getElementById("hh-set");
    if (!b) return;
    b.disabled = on;
    b.textContent = on ? "Working…" : "Set all highlights";
  }

  /* ---------- misc ---------- */

  function readable(color) {
    const hex = firstStop(color);
    const n = parseInt(hex.slice(1), 16);
    const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.6 ? "#12131A" : "#FFFFFF";
  }

  // Short chimes built in the browser — no audio files, so nothing to load and
  // nothing for a content-security policy to block.
  function chime(kind) {
    if (state.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const notes = kind === "done"
        ? [[659.25, 0, 0.10], [987.77, 0.10, 0.12], [1318.51, 0.20, 0.30]]   // E-B-E, rising
        : kind === "part"
          ? [[587.33, 0, 0.12], [739.99, 0.11, 0.22]]
          : [[392.00, 0, 0.14], [293.66, 0.13, 0.26]];                        // falling, gentle

      notes.forEach(([f, t, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.09, now + t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + dur + 0.02);
      });
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1400);
    } catch (e) {}
  }

  /* ---------- notifications ---------- */

  // One card, outside the panel: below it, or above, or beside it — wherever
  // it fits. Clicks pass straight through it, so it never covers a control.
  let noticeEl = null, noticeTimer = null;

  function placeNotice() {
    const n = noticeEl;
    if (!n || !root) return;
    const pr = root.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 10;
    const w = n.offsetWidth, h = n.offsetHeight;
    let top, left, side;
    if (pr.bottom + gap + h <= vh - 8) { top = pr.bottom + gap; side = "below"; }
    else if (pr.top - gap - h >= 8) { top = pr.top - gap - h; side = "above"; }
    else { top = Math.max(8, Math.min(pr.top + 12, vh - h - 8)); left = pr.left - gap - w; side = "beside"; }
    if (left == null) left = pr.right - w;
    left = Math.max(8, Math.min(left, vw - w - 8));
    n.style.left = Math.round(left) + "px";
    n.style.top = Math.round(top) + "px";
    n.dataset.side = side;
  }

  function notify(kind, text) {
    if (!noticeEl || !noticeEl.isConnected) {
      noticeEl = document.createElement("div");
      noticeEl.setAttribute("role", "status");
      noticeEl.setAttribute("aria-live", "polite");
      document.documentElement.appendChild(noticeEl);
    }
    const icon = kind === "done" ? ICON_CHECK : (kind === "fail" || kind === "part") ? ICON_CROSS : "";
    noticeEl.className = "hh-notice " + kind;
    noticeEl.innerHTML = '<span class="hh-nicon">' + icon + '</span><span class="hh-ntext"></span>';
    noticeEl.querySelector(".hh-ntext").textContent = text;
    noticeEl.style.setProperty("--acc", firstStop(state.active) || "#FFC93C");
    placeNotice();
    noticeEl.classList.remove("show");
    void noticeEl.offsetWidth;               // restart the entrance
    noticeEl.classList.add("show");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => noticeEl && noticeEl.classList.remove("show"),
      kind === "fail" || kind === "part" ? 3400 : kind === "info" ? 2700 : 2300);
  }

  function celebrate(kind, label) {
    chime(kind);
    notify(kind, label || (kind === "done" ? "Done" : "Not finished"));
  }

  function toast(msg) {
    notify("info", msg);
  }

  // One shared pointer session for moving and resizing. The old dragify added a
  // fresh pair of window listeners on every render, which piled up over a session.
  let drag = null;

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();        // Canva shouldn't act on a panel drag
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    const vw = window.innerWidth, vh = window.innerHeight;

    if (drag.mode === "move") {
      state.pos = { x: drag.ox + dx, y: drag.oy + dy };
    } else {
      const m = drag.mode;
      let w = drag.ow, h = drag.oh, x = drag.ox;
      if (m.includes("e")) w = drag.ow + dx;
      if (m.includes("w")) w = drag.ow - dx;
      if (m.includes("s")) h = drag.oh + dy;
      // The edge being dragged stays on screen, so the grip is always reachable.
      let maxW = vw - 16;
      if (m.includes("e")) maxW = Math.min(maxW, vw - Math.max(drag.ox, 0) - 8);
      if (m.includes("w")) maxW = Math.min(maxW, drag.ox + drag.ow - 8);
      w = Math.max(280, Math.min(w, maxW));
      h = Math.max(220, Math.min(h, vh - Math.max(drag.oy, 0) - 8));
      if (m.includes("w")) x = drag.ox + (drag.ow - w);
      state.size = { w, h: m === "e" || m === "w" ? (state.size && state.size.h) || null : h };
      state.pos = { x, y: drag.oy };
    }
    place();
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    root.classList.remove("hh-dragging");
    store.save();
  }

  // Capture phase on the window runs before any of Canva's own handlers, so
  // Canva can't swallow the movement mid-drag.
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("pointerup", endDrag, true);
  window.addEventListener("pointercancel", endDrag, true);
  window.addEventListener("blur", endDrag);

  function startMove(e) {
    if (e.button !== 0 || e.target.closest("button,input,textarea,select,a")) return;
    drag = { mode: "move", sx: e.clientX, sy: e.clientY, ox: root.offsetLeft, oy: root.offsetTop };
    root.classList.add("hh-dragging");
    e.preventDefault();
  }

  function startResize(mode, e) {
    if (e.button !== 0) return;
    drag = {
      mode, sx: e.clientX, sy: e.clientY,
      ow: root.offsetWidth, oh: wrap.offsetHeight, ox: root.offsetLeft, oy: root.offsetTop
    };
    root.classList.add("hh-dragging");
    e.preventDefault();
    e.stopPropagation();
  }

  function addGrips() {
    if (state.collapsed || state.compact) return;
    [["e", "hh-resize-e"], ["w", "hh-resize-w"], ["s", "hh-resize-s"],
     ["se", "hh-resize-se"], ["sw", "hh-resize-sw"]].forEach(([mode, cls]) => {
      const g = el("div", "hh-resize " + cls);
      g.title = "Drag to resize \u2014 double-click to reset";
      g.addEventListener("pointerdown", (e) => startResize(mode, e));
      g.addEventListener("dblclick", (e) => { e.stopPropagation(); resetSize(); });
      wrap.appendChild(g);
    });
  }


  // Keep every header button on screen. When the panel is narrow, pinned
  // tools step aside first (they're all in the grid menu), then the AUTO badge
  // shrinks to a dot, then the title shortens. Menu, reset, Compact and fold
  // always stay.
  function fitHeader() {
    const head = wrap && wrap.querySelector(".hh-head");
    if (!head) return;
    const pins = [...head.querySelectorAll(".hh-pins .hh-tool")];
    const pill = head.querySelector(".hh-autopill");
    pins.forEach(p => { p.hidden = false; });
    if (pill) pill.classList.remove("mini");
    const title = head.querySelector(".hh-title");
    // Crowded means: something spills over, or the title has been cut short.
    const over = () => head.scrollWidth > head.clientWidth + 1
      || (title && title.scrollWidth > title.clientWidth + 1);
    for (let i = pins.length - 1; i >= 0 && over(); i--) pins[i].hidden = true;
    if (over() && pill && !pill.hidden) pill.classList.add("mini");
  }

  function applySize() {
    if (!wrap) return;
    fitHeader();
    const body = wrap.querySelector(".hh-body");
    const top = root ? root.getBoundingClientRect().top : 0;
    const room = Math.max(180, window.innerHeight - top - 24);

    if (state.size.h && !state.collapsed && !state.compact) {
      wrap.style.height = Math.min(state.size.h, room) + "px";
      wrap.classList.add("hh-sized");
      if (body) { body.classList.add("hh-sized"); body.style.maxHeight = ""; }
    } else {
      wrap.style.height = "";
      wrap.classList.remove("hh-sized");
      if (body) {
        body.classList.remove("hh-sized");
        // Header is roughly 40px; leave the rest to the scrolling body.
        // Room left after the header and the footer strip.
        const foot = wrap.querySelector(".hh-foot");
        const footH = foot ? foot.getBoundingClientRect().height : 0;
        body.style.maxHeight = Math.max(140, room - 44 - footH) + "px";
      }
    }
  }

  function resetSize() {
    state.size = { w: 344, h: null };
    store.save();
    render();
    place();          // the width is applied when the panel is placed
  }



  /* ---------- boot ---------- */



  /* ---------- updates from GitHub ---------- */

  // The check itself runs in the background (updates.js). This part shows it:
  // the Updates section in Settings, a small notice in Quick, and the version
  // in the footer.
  const INSTALLED = (() => { try { return chrome.runtime.getManifest().version; } catch (e) { return "0"; } })();
  const UPDATE_EVERY = 12 * 60 * 60 * 1000;

  function cmpVer(a, b) {
    const p = (v) => String(v || "").trim().replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
    const x = p(a), y = p(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  // Saved under its own key, apart from the panel's settings.
  let upd = { auto: true, last: null, dismissed: "", downloaded: null, checkedAt: 0 };
  let updBusy = "";          // "check" | "download" | "reload" while working
  let updMsg = null;         // what the last button press ran into, if anything

  const updSave = () => { try { chrome.storage.local.set({ hhUpdate: upd }); } catch (e) {} };

  // After the extension reloads, this page's old copy can no longer talk to it.
  const contextGone = () => { try { return !chrome.runtime || !chrome.runtime.id; } catch (e) { return true; } };

  function askBg(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function updateReady() {
    const l = upd.last;
    return !!(l && l.ok && cmpVer(l.latest, INSTALLED) > 0);
  }

  // Re-draw when it's safe: never while you're typing in the panel.
  function refreshSoon() {
    const a = document.activeElement;
    if (root && a && root.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) {
      a.addEventListener("blur", () => setTimeout(refreshSoon, 0), { once: true });
      return;
    }
    if (running) { setTimeout(refreshSoon, 3000); return; }
    render();
  }

  async function checkUpdates(quiet) {
    if (updBusy) return;
    updBusy = "check";
    if (!quiet) { updMsg = null; render(); }
    const knew = updateReady() ? upd.last.latest : "";
    const r = await askBg({ type: "hh-update-check" });
    updBusy = "";
    upd.checkedAt = Date.now();
    if (r && r.ok) {
      upd.last = { ok: true, latest: r.latest, info: r.info, page: r.page, checkedAt: r.checkedAt };
      if (quiet && updateReady() && knew !== r.latest) notify("info", "Version " + r.latest + " is ready — see Settings");
    } else if (!quiet) {
      updMsg = { why: r ? r.why : (contextGone() ? "reloaded" : "offline"), status: r && r.status };
    }
    updSave();
    if (quiet) { if (updateReady()) refreshSoon(); } else render();
  }

  // Checks on its own every 12 hours. Reads the saved time first, so two
  // Canva tabs don't both check.
  function maybeAutoCheck() {
    try {
      chrome.storage.local.get("hhUpdate", (r) => {
        const saved = r && r.hhUpdate;
        if (saved && saved.checkedAt) upd.checkedAt = Math.max(upd.checkedAt || 0, saved.checkedAt);
        if (upd.auto && Date.now() - (upd.checkedAt || 0) > UPDATE_EVERY) checkUpdates(true);
      });
    } catch (e) {}
  }

  async function downloadUpdate() {
    if (updBusy || !updateReady()) return;
    updBusy = "download";
    updMsg = null;
    render();
    const l = upd.last;
    const r = await askBg({ type: "hh-update-download", url: l.info.download, version: l.latest });
    updBusy = "";
    if (r && r.ok) { upd.downloaded = { version: l.latest, id: r.id }; updSave(); }
    else updMsg = { why: r ? r.why : (contextGone() ? "reloaded" : "offline") };
    render();
  }

  async function showDownload() {
    const d = upd.downloaded;
    const r = d ? await askBg({ type: "hh-update-show", id: d.id }) : null;
    if (!r || !r.ok) notify("info", "It's in your Downloads folder");
  }

  async function reloadHighlighter() {
    if (running) { toast("Wait for the run to finish first"); return; }
    if (updBusy) return;
    updBusy = "reload";
    updMsg = null;
    render();
    const r = await askBg({ type: "hh-reload", from: INSTALLED });
    if (!r || !r.ok) {
      updBusy = "";
      updMsg = { why: contextGone() ? "reloaded" : "error" };
      render();
      return;
    }
    // The Highlighter is restarting. Once this copy has been switched off,
    // give the new one a moment to load, then refresh this tab so it runs here.
    const t0 = Date.now();
    const wait = () => {
      if (contextGone() || Date.now() - t0 > 5000) setTimeout(() => location.reload(), 1500);
      else setTimeout(wait, 100);
    };
    wait();
  }

  function openUpdates() {
    state.view = "manual";
    state.mtab = "settings";
    state.compact = false;
    state.collapsed = false;
    store.save();
    render();
    const card = root && root.querySelector("#hh-upd");
    if (card) card.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // "2026-10-25" -> "25 Oct 2026" in Chrome's own language.
  function niceDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || "").trim());
    if (!m) return String(d || "");
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function agoText(t) {
    if (!t) return "";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  const UPD_PROBLEMS = {
    offline: "Couldn't reach GitHub. Check your internet and try again.",
    empty: "Nothing on GitHub yet. Upload version.json and canva-headline-highlighter.zip to the repo.",
    bad: "version.json on GitHub can't be read. Check it's written correctly.",
    busy: "GitHub is busy. Try again in a minute.",
    error: "GitHub didn't answer properly. Try again later.",
    nozip: "The zip isn't on GitHub. Upload canva-headline-highlighter.zip to the repo.",
    interrupted: "The download stopped. Try again.",
    reloaded: "The Highlighter was reloaded. Refresh this tab, then try again."
  };

  // Every entry newer than the one installed (for "What's new"), or the one
  // installed (for "In this version").
  function updEntries(which) {
    const info = upd.last && upd.last.info;
    if (!info) return [];
    const all = [info].concat(info.history || []);
    const seen = new Set();
    return all.filter(e => {
      if (!e || seen.has(e.version)) return false;
      seen.add(e.version);
      const c = cmpVer(e.version, INSTALLED);
      return which === "newer" ? c > 0 : which === "current" ? c === 0 : c < 0;
    }).sort((a, b) => cmpVer(b.version, a.version));
  }

  function updList(items, cls, max) {
    const ul = el("ul", "hh-updlist" + (cls ? " " + cls : ""));
    items.slice(0, max).forEach(t => ul.appendChild(el("li", null, t)));
    return ul;
  }

  function updNotes(box, entries, maxNew, maxFixed) {
    const added = [], fixed = [];
    entries.forEach(e => { added.push(...e.added, ...e.notes); fixed.push(...e.fixed); });
    const both = added.length && fixed.length;    // a label only helps when there are two lists
    if (added.length) {
      if (both) box.appendChild(el("div", "hh-updsub", "New"));
      box.appendChild(updList(added, "", maxNew));
    }
    if (fixed.length) {
      if (both || !added.length) box.appendChild(el("div", "hh-updsub", "Fixed"));
      box.appendChild(updList(fixed, "fixed", maxFixed));
    }
    const more = Math.max(0, added.length - maxNew) + Math.max(0, fixed.length - maxFixed);
    if (more) {
      const m = el("button", "hh-linkbtn hh-updmore", "+" + more + " more on GitHub");
      m.type = "button";
      m.onclick = () => askBg({ type: "hh-open-repo" });
      box.appendChild(m);
    }
    return added.length + fixed.length;
  }

  function updPill(version, label, isNew) {
    const p = el("span", "hh-pill" + (isNew ? " new" : ""));
    p.appendChild(el("b", null, version));
    p.appendChild(el("span", null, label));
    return p;
  }

  function renderUpdates(body) {
    const g = el("div", "hh-group hh-upd" + (updateReady() ? " ready" : ""));
    g.id = "hh-upd";

    const head = el("div", "hh-updhead");
    head.appendChild(el("div", "hh-grouptitle", "Updates"));
    const chk = el("button", "hh-btn hh-updcheck", updBusy === "check" ? "Checking…" : "Check for updates");
    chk.type = "button";
    chk.disabled = !!updBusy;
    chk.onclick = () => checkUpdates(false);
    head.appendChild(chk);
    g.appendChild(head);

    const ready = updateReady();
    const pills = el("div", "hh-updpills");
    pills.appendChild(updPill(INSTALLED, "Installed", false));
    if (ready) {
      pills.appendChild(el("span", "hh-updarrow", "→"));
      pills.appendChild(updPill(upd.last.latest, "New", true));
    }
    g.appendChild(pills);

    let status, bad = false;
    if (updBusy === "check") status = "Asking GitHub…";
    else if (updMsg && !ready) { status = UPD_PROBLEMS[updMsg.why] || UPD_PROBLEMS.error; bad = updMsg.why !== "empty"; }
    else if (ready) {
      const d = upd.last.info.date;
      status = "Version " + upd.last.latest + " is ready" + (d ? " \u00b7 published " + niceDate(d) : "") + ".";
    } else if (upd.last && upd.last.ok) status = "You're up to date · checked " + agoText(upd.checkedAt) + ".";
    else status = "Checks your GitHub repo for a newer version.";
    const st = el("div", "hh-updstatus" + (bad ? " bad" : ""), status);
    st.setAttribute("role", "status");
    g.appendChild(st);
    if (!ready && !updBusy && updMsg && updMsg.why === "empty") {
      const open = el("button", "hh-linkbtn", "Open the repo");
      open.type = "button";
      open.onclick = () => askBg({ type: "hh-open-repo" });
      g.appendChild(open);
    }

    if (ready) {
      const news = el("div", "hh-updnotes");
      if (updNotes(news, updEntries("newer"), 6, 4)) {
        news.insertBefore(el("div", "hh-updtitle", "What's new"), news.firstChild);
        g.appendChild(news);
      }

      const dl = upd.downloaded && upd.downloaded.version === upd.last.latest;
      const row = el("div", "hh-updrow");
      if (dl) {
        row.appendChild(el("span", "hh-updok", "Downloaded ✓"));
        const show = el("button", "hh-btn", "Show the file");
        show.type = "button";
        show.onclick = showDownload;
        row.appendChild(show);
        const again = el("button", "hh-linkbtn", "Download again");
        again.type = "button";
        again.disabled = !!updBusy;
        again.onclick = downloadUpdate;
        row.appendChild(again);
      } else {
        const get = el("button", "hh-btn primary wide", updBusy === "download" ? "Downloading…" : "Download update");
        get.type = "button";
        get.disabled = !!updBusy;
        get.onclick = downloadUpdate;
        row.appendChild(get);
      }
      g.appendChild(row);
      if (updMsg && UPD_PROBLEMS[updMsg.why]) g.appendChild(el("div", "hh-updstatus bad", UPD_PROBLEMS[updMsg.why]));

      const steps = el("div", "hh-updsteps");
      const s1 = el("div", "hh-updstep");
      s1.appendChild(el("span", "hh-updnum", "1"));
      const t1 = el("div", "hh-updsteptext", "Unzip it, and copy the files into your Highlighter folder, replacing the old ones. ");
      const where = el("button", "hh-linkbtn", "Where's my folder?");
      where.type = "button";
      where.title = "Opens the Highlighter's page in Chrome — the folder is next to “Loaded from”";
      where.onclick = () => askBg({ type: "hh-open-extensions" });
      t1.appendChild(where);
      s1.appendChild(t1);
      steps.appendChild(s1);

      const s2 = el("div", "hh-updstep");
      s2.appendChild(el("span", "hh-updnum", "2"));
      const t2 = el("div", "hh-updstepact");
      const rl = el("button", "hh-btn", updBusy === "reload" ? "Reloading…" : "Reload the Highlighter");
      rl.type = "button";
      rl.disabled = !!updBusy || running;
      rl.onclick = reloadHighlighter;
      t2.appendChild(rl);
      t2.appendChild(el("div", "hh-hint", "Your settings stay. Canva and chat tabs refresh."));
      s2.appendChild(t2);
      steps.appendChild(s2);
      g.appendChild(steps);
    } else if (upd.last && upd.last.ok) {
      const cur = updEntries("current");
      if (cur.length) {
        const det = el("details", "hh-upddetails");
        det.appendChild(el("summary", null, "In this version"));
        if (updNotes(det, cur, 12, 12)) g.appendChild(det);
      }
    }

    const older = updEntries("older");
    if (older.length) {
      const det = el("details", "hh-upddetails");
      det.appendChild(el("summary", null, "Earlier versions"));
      older.slice(0, 15).forEach(e => {
        det.appendChild(el("div", "hh-updver", e.version + (e.date ? " \u00b7 " + niceDate(e.date) : "")));
        const items = e.added.concat(e.notes, e.fixed);
        if (items.length) det.appendChild(updList(items, "small", 8));
      });
      g.appendChild(det);
    }

    g.appendChild(settingRow("Check automatically", "Every 12 hours, quietly", upd.auto !== false, (on) => {
      upd.auto = on;
      updSave();
      if (on) maybeAutoCheck();
    }));
    body.appendChild(g);
  }

  // A small notice at the top of Quick when a new version is waiting.
  function renderUpdateBar(view) {
    if (!updateReady()) return;
    const l = upd.last;
    if (!l.info.required && upd.dismissed === l.latest) return;
    const bar = el("div", "hh-updbar");
    bar.setAttribute("role", "status");
    bar.appendChild(el("span", "hh-upddot"));
    bar.appendChild(el("span", "hh-updbartext", "Version " + l.latest + " is ready"));
    const see = el("button", "hh-btn", "See update");
    see.type = "button";
    see.onclick = openUpdates;
    bar.appendChild(see);
    if (!l.info.required) {
      const x = el("button", "hh-icon hh-updx", "×");
      x.type = "button";
      x.title = "Hide until the next version";
      x.setAttribute("aria-label", "Hide this notice");
      x.onclick = () => { upd.dismissed = l.latest; updSave(); render(); };
      bar.appendChild(x);
    }
    view.appendChild(bar);
  }

  function renderFooter() {
    const f = el("div", "hh-foot");
    f.appendChild(document.createTextNode("Created by Oeng Kimchour · "));
    const v = el("button", "hh-footver" + (updateReady() ? " has-update" : ""), "v" + INSTALLED);
    v.type = "button";
    v.title = updateReady() ? "Version " + upd.last.latest + " is ready" : "Check for updates";
    v.onclick = openUpdates;
    f.appendChild(v);
    return f;
  }

  // Runs once the panel is up: loads the saved update state, says what a
  // reload just did, and checks GitHub if it's been 12 hours.
  function startUpdates() {
    // Saying hello wakes the background, so a reload that's waiting to finish
    // (refreshing other Canva and chat tabs) can finish. The answer says which
    // tab this is, so "Updated to …" shows only where you pressed Reload.
    askBg({ type: "hh-hello" }).then((hello) => {
      const myTab = hello && hello.tabId;
      try {
        chrome.storage.local.get(["hhUpdate", "hhJustReloaded"], (r) => {
          if (r && r.hhUpdate && typeof r.hhUpdate === "object") upd = Object.assign(upd, r.hhUpdate);
          if (upd.downloaded && cmpVer(INSTALLED, upd.downloaded.version) >= 0) { upd.downloaded = null; updSave(); }
          const jr = r && r.hhJustReloaded;
          if (jr && Date.now() - (jr.at || 0) < 3 * 60 * 1000 && (!jr.self || jr.self === myTab)) {
            try { chrome.storage.local.remove("hhJustReloaded"); } catch (e) {}
            setTimeout(() => {
              if (jr.from && cmpVer(INSTALLED, jr.from) !== 0) celebrate("done", "Updated to " + INSTALLED);
              else if (updateReady()) notify("part", "Still " + INSTALLED + " \u2014 the new files weren't copied into the Highlighter's folder");
              else notify("info", "Highlighter reloaded");
            }, 900);
          }
          render();
          setTimeout(maybeAutoCheck, 4000);
        });
      } catch (e) {}
    });
    setInterval(maybeAutoCheck, 30 * 60 * 1000);
  }


  /* ---------- compact view ---------- */

  // One line of status, a progress bar and Run. Small enough to leave the
  // design in view while a run or Automation works.
  function compactStatus() {
    if (autoHold && state.autoMode) {
      const h = autoHold;
      return h.why === "nohead" ? "Waiting for a page with a headline"
        : h.why === "finished" ? "Waiting for a new page"
        : h.what === "arriving" ? "Photo arriving\u2026"
        : h.what === "checking" ? "Checking the photo\u2026"
        : h.what === "same" ? "Waiting for the new photo" : "Waiting for the photo";
    }
    if (running && run) {
      const on = STAGES.filter(st => run.status[st.id] && run.status[st.id] !== "skip");
      const cur = on.find(st => run.status[st.id] === "run");
      const n = on.indexOf(cur) + 1;
      return cur ? "Step " + n + " of " + on.length + ": " + cur.label + "\u2026" : "Working\u2026";
    }
    if (run && run.result) return run.result.text;
    return state.autoMode ? "Automation is on \u2014 waiting for a story" : "Ready";
  }

  function compactProgress() {
    if (!run) return 0;
    const on = STAGES.filter(st => run.status[st.id] && run.status[st.id] !== "skip");
    if (!on.length) return 0;
    const fin = on.filter(st => run.status[st.id] === "done" || run.status[st.id] === "fail").length;
    return fin / on.length;
  }

  function paintCompact() {
    const s = root && root.querySelector("#hh-cstatus");
    if (!s) return;
    s.textContent = compactStatus();
    const kind = run && run.result ? run.result.kind : "";
    s.dataset.kind = running ? "run" : kind;
    const bar = root.querySelector("#hh-cbar");
    if (bar) bar.style.transform = "scaleX(" + (running ? Math.max(0.04, compactProgress()) : run && run.result ? 1 : 0) + ")";
    const go = root.querySelector("#hh-cgo");
    if (go) { go.disabled = running; go.textContent = running ? "Running\u2026" : run && run.result ? "Run again" : "Run"; }
  }

  function renderCompact(view) {
    const card = el("div", "hh-compact");
    const st = el("div", "hh-cstatus");
    st.id = "hh-cstatus";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    card.appendChild(st);
    const track = el("div", "hh-ctrack");
    const bar = el("div", "hh-cbar");
    bar.id = "hh-cbar";
    track.appendChild(bar);
    card.appendChild(track);
    const row = el("div", "hh-crow");
    if (autoHold && state.autoMode) {
      const photoWait = autoHold.why === "photo";
      const here = el("button", "hh-btn", photoWait ? "Run now" : "Run here anyway");
      here.type = "button";
      here.onclick = () => {
        stopHold(); render();
        if (photoWait) { photoSkip = true; autoStart(); } else runQuick();
      };
      row.appendChild(here);
    }
    const go = el("button", "hh-go hh-cgo", "Run");
    go.type = "button";
    go.id = "hh-cgo";
    go.onclick = () => runQuick();
    row.appendChild(go);
    card.appendChild(row);
    view.appendChild(card);
    paintCompact();
  }

  /* ---------- automation ---------- */

  let autoHold = null;          // { why, what } while waiting for a safe page
  let autoStarting = false;     // the short pause before an automatic run
  let holdTimer = null;
  const storyQueue = [];        // stories that arrived during a run

  // Canva's page counter at the bottom: "175 / 175".
  let pageCounterEl = null;
  function pageNumber() {
    const vh = window.innerHeight;
    const isCounter = (e) => e && e.isConnected && notMine(e) && visible(e)
      && /^\s*\d+\s*\/\s*\d+\s*$/.test(e.textContent || "") && e.getBoundingClientRect().top > vh * 0.7;
    // The counter rarely moves; only look for it again when it's gone.
    if (!isCounter(pageCounterEl)) pageCounterEl = leafs(document.body).find(isCounter) || null;
    const el = pageCounterEl;
    if (!el) return null;
    const m = el.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    return { cur: +m[1], total: +m[2] };
  }

  // The page's headline: its longest piece of design text.
  function pageMainHeadline() {
    // canvasTextCandidates gives { n: element, txt: its text, ... } records.
    const c = canvasTextCandidates().filter(o => o.txt.replace(/\s+/g, " ").length >= 30);
    if (!c.length) return null;
    c.sort((a, b) => b.txt.length - a.txt.length);
    return c[0].n;
  }

  // How many colours the headline's letters use (3+ letters each).
  function colourCount(el) {
    const tally = {};
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) {
      const n = w.currentNode;
      const k = (n.nodeValue || "").replace(/\s/g, "").length;
      if (!k || !n.parentElement) continue;
      const c = getComputedStyle(n.parentElement).color;
      tally[c] = (tally[c] || 0) + k;
    }
    return Object.values(tally).filter(v => v >= 3).length;
  }

  // A short fingerprint of a headline, censored the same way, letters and digits only.
  function storyKey(t) {
    let x = String(t || "");
    if (state.censorOn) x = applyCensor(x, state.censorMap);
    return asRead(x).replace(/[^a-z0-9]/g, "").slice(0, 28);
  }

  // Is it safe to run the story on the page that's open now?
  function pageVerdict(headline) {
    const el = pageMainHeadline();
    if (!el) return { ok: false, why: "nohead", what: "" };
    const onPage = storyKey(el.innerText);
    const shown = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (onPage && onPage === storyKey(headline)) return { ok: true };            // same story: a re-run
    const pn = pageNumber();
    const lp = state.lastPost;
    if (lp && onPage === lp.key && pn && pn.cur !== lp.page) return { ok: true }; // a copy of the last post
    if (colourCount(el) < 2) return { ok: true };                                // a template, not finished
    return { ok: false, why: "finished", what: shown };
  }

  function stopHold() {
    autoHold = null;
    if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
  }

  // Start the Quick run on its own, but only on a page where it's safe.
  /* ---------- waiting for the photo ---------- */

  // The photo in the design, and where it comes from. Canva may add a fresh
  // signature (?…) to the same photo's address on each page, so compare the
  // address without it — otherwise a copied old photo could pass as new.
  const photoKey = (src) => String(src || "").split(/[?#]/)[0];

  function pagePhoto() {
    const { photo } = photoAndFade();
    if (!photo) return null;
    const n = photo.n;
    const src = n.currentSrc || n.src || n.getAttribute("href") || n.getAttribute("xlink:href") || "";
    const loaded = n.tagName === "IMG" ? (n.complete && n.naturalWidth > 0) : true;
    return { n, src, loaded };
  }

  let photoWatch = null;        // { key, since } while a new photo settles
  let photoSkip = false;        // "Run without the photo" was pressed

  // Is a new photo in the design, fully loaded and steady for 2 seconds?
  // While uploading, Canva often swaps a quick preview for the final image,
  // which restarts the 2 seconds — so the run never starts on a half-loaded photo.
  function photoReady(headline) {
    const p = pagePhoto();
    if (!p || !p.src) { photoWatch = null; return { ok: false, why: "photo", what: "none" }; }
    const key = photoKey(p.src);
    const lp = state.lastPost;
    // A different story still showing the last post's photo must wait. The
    // same story again is fine: that photo is its own.
    const sameStory = lp && headline && lp.key === storyKey(headline);
    if (lp && lp.photo && key === lp.photo && !sameStory) { photoWatch = null; return { ok: false, why: "photo", what: "same" }; }
    // blob: is how Chrome shows an image that is still uploading.
    if (!p.loaded || /^blob:/i.test(p.src)) { photoWatch = null; return { ok: false, why: "photo", what: "arriving" }; }
    if (!photoWatch || photoWatch.key !== key) {
      photoWatch = { key, since: Date.now() };
      return { ok: false, why: "photo", what: "checking" };
    }
    if (Date.now() - photoWatch.since < 2000) return { ok: false, why: "photo", what: "checking" };
    return { ok: true };
  }

  // Safe page first, then (with Automation) a new photo in the design.
  function autoReady(headline) {
    const v = pageVerdict(headline);
    if (!v.ok) return v;
    if (state.waitPhoto && !photoSkip) return photoReady(headline);
    return { ok: true };
  }

  const holdSay = (h) => h.why === "nohead" ? "waiting for a page with a headline"
    : h.why === "finished" ? "waiting for a new page"
    : h.what === "arriving" ? "the photo is coming in"
    : h.what === "checking" ? "checking the photo" : "waiting for the photo";

  async function autoStart(source) {
    if (!state.autoMode || running) return;
    const b = quickBundle();
    if (!b || !b.headline) return;
    const v = autoReady(b.headline);
    const from = source ? "Story from " + source + " \u2014 " : "";
    if (!v.ok) {
      toast(from + holdSay(v));
      autoHold = { why: v.why, what: v.what };
      if (!holdTimer) holdTimer = setInterval(() => {
        if (!autoHold || !state.autoMode) { stopHold(); render(); return; }
        const bb = quickBundle();
        if (!bb || !bb.headline) return;
        const r = autoReady(bb.headline);
        if (r.ok) { stopHold(); render(); autoStart(); return; }
        // Keep the message current: no photo -> photo arriving, and so on.
        if (r.why !== autoHold.why || r.what !== autoHold.what) { autoHold = { why: r.why, what: r.what }; render(); }
      }, 900);
      render();
      return;
    }
    stopHold();
    render();
    if (from) toast(from + "running it now");
    autoStarting = true;
    try {
      await sleep(700);
    } finally {
      autoStarting = false;
    }
    if (!state.autoMode || running) { drainQueue(); return; }
    runQuick();
  }


  function drainQueue() {
    if (running || !storyQueue.length) return;
    const next = storyQueue.shift();
    receiveStory(next.text, next.source);
  }

  /* ---------- stories sent from Claude or ChatGPT ---------- */

  let queuedStory = null;

  function receiveStory(text, source) {
    if (!text) return;
    if (!root) { queuedStory = { text, source }; return; }
    // The same story delivered twice (a chat re-send, a saved copy picked up on
    // load): ignore it if it's running now, already queued, or already done here.
    const flat = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const sameAsNow = flat(text) === flat(state.bundle);
    if ((running || autoStarting) && (sameAsNow || storyQueue.some(q => flat(q.text) === flat(text)))) return;
    if (sameAsNow && finished && state.lastPost) {
      const pn = pageNumber();
      if (pn && pn.cur === state.lastPost.page) { toast("That story is already done on this page"); return; }
    }

    // Never swap the story out from under a run: it waits its turn.
    if (running || autoStarting) {
      storyQueue.push({ text, source });
      toast("Next story is queued \u2014 it starts when this run finishes");
      return;
    }
    stopHold();
    photoSkip = false;
    photoWatch = null;
    state.bundle = text;
    state.optionIndex = 0;
    state.view = "quick";
    state.collapsed = false;
    root.style.display = "";
    run = null;
    toolMenuOpen = false;
    confirmClear = false;
    store.save();
    render();
    const ta = root.querySelector(".hh-paste");
    if (ta) {
      ta.scrollTop = 0;
      ta.classList.add("hh-flash");
      setTimeout(() => ta.classList.remove("hh-flash"), 1100);
    }
    if (state.autoMode) {
      autoStart(source || "chat");
    } else {
      toast("Story from " + (source || "chat") + " is ready \u2014 press Run");
    }
  }

  store.load(() => {
    if (!state.fillIntroduced) {
      state.photoFill = true;
      state.fillIntroduced = true;
      store.save();
    }
    if (!state.fitIntroduced) {
      state.alignAfter = true;
      state.fitIntroduced = true;
      store.save();
    }
    state.tokens = tokenize(state.text || "");
    build();
    startUpdates();
    if (queuedStory) { receiveStory(queuedStory.text, queuedStory.source); queuedStory = null; }
    // A story sent while no Canva design was open waits here.
    try {
      chrome.storage.local.get("hhPending", (r) => {
        const p = r && r.hhPending;
        if (!p || !p.text) return;
        chrome.storage.local.remove("hhPending");
        if (Date.now() - (p.at || 0) < 6 * 60 * 60 * 1000) receiveStory(p.text, p.source);
      });
    } catch (e) {}
  });

  try {
    chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
      if (!m) return;
      if (m.type === "hh-toggle") {
        if (root) root.style.display = root.style.display === "none" ? "" : "none";
        return;
      }
      if (m.type === "hh-story") {
        receiveStory(m.text, m.source);
        sendResponse({ ok: true });
      }
    });
  } catch (e) {}

  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "n" || e.key === "N")) { e.preventDefault(); stepNext(); }
    if (e.key === "Escape" && (toolMenuOpen || confirmClear) && e.isTrusted) {
      toolMenuOpen = false; confirmClear = false; render();
    }
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (!toolMenuOpen || !e.isTrusted) return;
    const m = document.getElementById("hh-toolmenu");
    const b = document.getElementById("hh-toolbtn");
    if ((m && m.contains(e.target)) || (b && b.contains(e.target))) return;
    toolMenuOpen = false;
    render();
  }, true);
})();
