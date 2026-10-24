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
    ["clear", /\b(?:clear(?: (?:it|all|everything|the box))?|reset|start over|start again|new post|wipe|empty the box|next post)\b/],
    ["confirm", /^(?:yes|yep|yeah|correct|right|that'?s (?:it|right|correct|the one)|confirm|looks good|use (?:it|that|this)|ok(?:ay)?|good|perfect)\b/],
    ["reanalyze", /\b(?:fix(?: (?:it|the selection|that|this|the headline|the detection))?|re-?analy[sz]e|re-?detect|re-?check|re-?scan|re-?do|redo|retry|try again|again|wrong(?: one)?|incorrect|not (?:the|that|it|right|this)(?: one)?|that'?s not|isn'?t (?:the|it|right)|other one|different one|next (?:one|candidate)|another (?:one|candidate)|correct (?:the|it|this)|look again|pick another|no\b)/],
    ["undo", /\b(?:undo|put (?:it )?back|revert)\b/],
    ["locate", /\b(?:locate|where(?:'?s| is| are)|point (?:to|at|out)|show (?:me )?where|which (?:one|text|box) is)\b/],
    ["highlight", /\b(?:highlight|colou?r(?: in)?|paint|mark|emphasi[sz]e|accent)\b/],
    ["notes", /\b(?:(?:fill|send|put|write|paste|add)(?: [a-z]+){0,3} (?:in|into|to) notes|fill notes|notes)\b/],
    ["lineup", /\b(?:line(?:s)? (?:it |them )?up|line-?up|align|cent(?:er|re)|fit (?:the )?(?:headline|title|text|it))\b/],
    ["fill", /\b(?:fill (?:the )?(?:page|design|it|frame)?\s*(?:with (?:the )?(?:photo|image|picture))|fill with photo|photo fill)\b/],
    ["photo", /\b(?:enhance|improve|sharpen|adjust|auto-?adjust)(?: (?:the|my))? (?:photo|image|picture)|(?:photo|image|picture) (?:enhance|adjust)/],
    ["censor", /\b(?:censor|bleep|mask|clean up (?:the )?(?:words|language))\b/],
    ["strength_up", /\b(?:heavier|more (?:highlights?|colou?rs?|words|phrases)|highlight more|colou?r more|heavy)\b/],
    ["strength_down", /\b(?:lighter|less|fewer (?:highlights?|colou?rs?|words|phrases)|highlight less|colou?r less|light)\b/],
    ["strength_mid", /\b(?:medium|normal amount|in between)\b/],
    ["copy", /\b(?:copy|clipboard)\b/],
    ["run", /\b(?:run(?: it| everything| all| the (?:whole|full) (?:thing|post|run))?|do (?:it|everything|the (?:whole|full) (?:thing|post))|process|finish (?:it|the post)|complete (?:it|the post)|make the post|send (?:it |this )?to canva|apply (?:it|everything)|go|execute|automate)\b/],
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
    strength: "Highlight amount", automation: "Automation", help: "Help"
  };

  function normalize(s) {
    return String(s || "").toLowerCase()
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/\s*[&+]\s*/g, " and ")
      .replace(/[^a-z0-9#'" -]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }

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

  function fieldsFor(targets, ctx, fallback) {
    let f = [];
    targets.forEach(t => {
      if (t === "all") f.push(...ALL);
      else if (t === "main") f.push("headline", "caption");
      else if (t === "prev") f.push(...((ctx && ctx.lastFields && ctx.lastFields.length) ? ctx.lastFields : (fallback || ALL)));
      else if (FIELD_NAMES[t]) f.push(t);
    });
    f = uniq(f);
    return f.length ? ALL.filter(x => f.includes(x)) : (fallback || ALL).slice();
  }

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

  // "set the headline to …", "change the caption to …" keep your exact words.
  function setCommand(raw) {
    const m = String(raw || "").match(/^\s*(?:set|change|make|replace|rename|update)\s+(?:the\s+)?(headline|title|caption|hashtags?|tags)\s+(?:to|with|as|=|:)\s*([\s\S]+)$/i);
    if (!m) return null;
    const k = m[1].toLowerCase();
    const field = /^(headline|title)$/.test(k) ? "headline" : k === "caption" ? "caption" : "hashtags";
    let value = m[2].trim().replace(/^["“'](.*)["”']$/s, "$1");
    return { op: "set", field, value };
  }

  function describe(steps) {
    return steps.map(s => {
      const base = OP_LABEL[s.op] || s.op;
      if (s.fields && ["extract", "copy", "detect"].includes(s.op) && !(s.fields.length === 3 && s.op === "detect"))
        return base + " " + (s.fields.length === 3 ? "everything" : s.fields.join(" + ")) + (s.from === "page" ? " from the design" : "");
      if (s.op === "option" || s.op === "pick") return base + " " + (s.n === -1 ? "last" : s.n);
      if (s.op === "set") return "Set " + s.field;
      if (s.op === "strength") return "Highlight " + s.level;
      if (s.op === "automation") return "Automation " + (s.on ? "on" : "off");
      return base + (s.from === "page" ? " on the design" : "");
    }).join(" → ");
  }

  // ctx (optional): { lastPlan, lastOp, lastFields, lastFailed, hasOptions, hasCandidates, pendingConfirm }
  function parse(input, ctx) {
    ctx = ctx || {};
    const raw = String(input || "").trim();
    const text = normalize(raw);
    const out = { input: raw, steps: [], understood: false, confidence: 0, summary: "", followUp: false, unknown: [] };
    if (raw === "?") { out.steps = [{ op: "help" }]; out.understood = true; out.confidence = 1; out.summary = "Help"; return out; }
    if (!text) return out;

    const set = setCommand(raw);
    if (set) {
      out.steps = [set];
      out.understood = true; out.confidence = 0.95; out.summary = describe(out.steps);
      return out;
    }

    let verbs = scan(text, VERBS);
    const targets = scan(text, TARGETS).filter(t => !verbs.some(v => t.at < v.end && v.at < t.end && v.key !== "extract" && v.key !== "detect"));
    // A target word inside a verb phrase ("fill notes", "fit the headline")
    // belongs to the verb.
    verbs = verbs.filter(v => !(v.key === "strength_down" && /\bless\b/.test(v.text) && targets.length === 0 && verbs.length > 1));
    const onPage = /\b(?:on|in|from) (?:the |this |my )?(?:page|design|canvas|canva|template|slide)\b/.test(text);
    const n = ordinal(text);

    // Yes / no answers to a question the panel asked.
    if (ctx.pendingConfirm && verbs.length && verbs[0].key === "confirm" && verbs.length === 1) {
      out.steps = [{ op: "confirm" }];
    }

    if (!out.steps.length) {
      // Walk the words in order: each verb starts a step, the targets after it
      // belong to it.
      const tokens = verbs.map(v => ({ kind: "v", ...v })).concat(targets.map(t => ({ kind: "t", ...t })))
        .sort((a, b) => a.at - b.at);
      const steps = [];
      let pendingTargets = [];
      tokens.forEach(tk => {
        if (tk.kind === "v") {
          const step = { op: tk.key, targets: pendingTargets.slice() };
          pendingTargets = [];
          // "copy and highlight the headline": the target is shared.
          steps.push(step);
        } else if (steps.length) steps[steps.length - 1].targets.push(tk.key);
        else pendingTargets.push(tk.key);
      });
      // Verbs with nothing between them share the next targets.
      for (let i = steps.length - 2; i >= 0; i--) {
        if (!steps[i].targets.length && steps[i + 1].targets.length && ["copy", "extract", "detect", "highlight", "locate"].includes(steps[i].op)) {
          steps[i].targets = steps[i + 1].targets.slice();
        }
      }

      // Targets but no verb: a follow-up ("and the hashtags") or a plain ask
      // ("caption and hashtags") — repeat the last action, or extract.
      if (!steps.length && pendingTargets.length) {
        const also = /\b(?:and|also|too|as well|plus)\b/.test(text);
        const op = ctx.lastOp && ["copy", "extract", "highlight", "locate"].includes(ctx.lastOp) ? ctx.lastOp : "extract";
        let ts = pendingTargets;
        if (also && ctx.lastFields) ts = ts.concat(ctx.lastFields.filter(f => ALL.includes(f)));
        steps.push({ op, targets: ts });
        out.followUp = !!ctx.lastOp;
      }
      // A number on its own: pick an option, or another headline candidate.
      if (!steps.length && n) {
        steps.push({ op: ctx.hasOptions ? "option" : "pick", n });
        out.followUp = true;
      }

      steps.forEach(s => {
        const ts = s.targets || [];
        if (ts.includes("prev")) out.followUp = true;
        switch (s.op) {
          case "detect":
          case "extract": {
            s.fields = fieldsFor(ts, ctx, ALL);
            if (onPage) s.from = "page";
            if (ts.includes("main")) s.main = true;
            break;
          }
          case "copy":
            s.fields = fieldsFor(ts, ctx, ctx.lastFields && ctx.lastFields.length ? ctx.lastFields : ALL);
            break;
          case "highlight":
          case "locate":
            s.fields = ["headline"];
            if (onPage || s.op === "locate") s.from = "page";
            break;
          case "reanalyze":
            if (n) { s.op = ctx.hasOptions && /option|version/.test(text) ? "option" : "pick"; s.n = n; break; }
            // After a failure, "again" means run that again; otherwise look again.
            if (/^(?:again|try again|retry|one more time|repeat)$/.test(text) && ctx.lastFailed && ctx.lastPlan && ctx.lastPlan.length) {
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
        delete s.targets;
      });

      // Option words win over plain picking: "use option 2".
      if (n && /\b(option|version)\b/.test(text) && !steps.some(s => s.op === "option")) {
        steps.unshift({ op: "option", n });
      }

      // "find the headline" means detect it and show it, not just analyse.
      const cleaned = [];
      steps.forEach((s, i) => {
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
    scan(text, VERBS).concat(scan(text, TARGETS)).forEach(h => { for (let i = h.at; i < h.end; i++) covered[i] = true; });
    const FILLER = /^(?:the|a|an|and|then|please|pls|now|also|too|for|me|my|to|of|from|on|in|this|that|it|just|can|you|could|would|i|want|need|with|all|both|page|design|canvas|canva|template|again|one|ok|okay|so|then|first|next|after|that|as|well|plus|is|are|be|some|its|out|up|real|quick|quickly|thanks|thank|make|do|use|pick|take|try|option|version|candidate|number|no|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th|hey|hi)$/;
    let left = 0, total = 0;
    text.split(" ").reduce((pos, w) => {
      const at = text.indexOf(w, pos);
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
