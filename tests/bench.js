/* Accuracy benchmark for the recognition engine, the task engine and the
   headline ranking.

   Builds posts the way people and chatbots actually write them — labelled,
   bold labels, headings, unlabelled, reordered, wrapped in chat, hashtags at
   the start, middle or end, missing parts — from stories whose right answer
   is known, then measures:
     - extraction accuracy per field and for all three together
     - "confidently wrong": a wrong headline it didn't ask about (the one
       mistake that matters most)
     - how often it asks, and whether asking was warranted
     - false positives on replies that aren't stories
     - response time
     - task completion: does "copy the caption and hashtags" produce exactly
       the right text
     - intent accuracy and headline-ranking accuracy

   node tests/bench.js [--write]   (--write saves tests/BENCHMARK.md)        */

const fs = require("fs");
const path = require("path");
const E = require("../sat-highlighter/engine.js");
const IN = require("../sat-highlighter/intent.js");
const corpus = require("./fixtures/corpus.js");
const intents = require("./fixtures/intents.js");
const { run, diff } = require("./lib/check.js");

const STORIES = [
  { h: "TSA AGENT FIRED AFTER VIRAL VIDEO SHOWED HIM TAKING CASH FROM BAGS", c: ["A TSA agent at Miami airport was fired after a passenger filmed him going through her bag. The clip passed ten million views in a day.", "The agency said he had been removed from duty the same afternoon."], t: ["#tsa", "#travel", "#viral"] },
  { h: "Woman returns $50,000 she found inside a thrift store couch", c: ["She paid $40 for the couch. Inside the cushions was an envelope of cash.", "She drove it straight back to the family who had donated it."], t: ["#kindness", "#truestory"] },
  { h: "Pilot lands plane alone after co-pilot faints mid-flight", c: ["Forty minutes out of Denver the co-pilot slumped over the controls. The captain landed the plane alone while a nurse on board helped."], t: ["#aviation", "#pilot", "#avgeek"] },
  { h: "GRANDMA, 92, GRADUATES COLLEGE 70 YEARS AFTER DROPPING OUT", c: ["She left school in 1954 to care for her family. This spring she walked across the stage in a cap and gown.", "Her great-grandchildren held the banner."], t: ["#neverquit", "#graduation"] },
  { h: "Dog walks 20 miles to find the family that gave him away", c: ["Cooper was rehomed in March. Three days later he turned up on their porch, paws sore, tail wagging. They kept him."], t: ["#dogs", "#loyalty"] },
  { h: "“PAY ME BACK BY BEING KIND”: MECHANIC FIXES SINGLE MUM'S CAR FOR FREE", c: ["She came in expecting a bill she couldn't pay. He handed her the keys and a note instead.", "She has since paid it forward three times."], t: ["#kindness", "#mechanic"] },
  { h: "Teen builds prosthetic arm for his little brother using a library 3D printer", c: ["Leo, 16, spent four months designing the arm after school. His brother can now hold a bike handle."], t: ["#engineering", "#family", "#inspiration"] },
  { h: "Firefighter adopts the kitten he pulled from a burning house", c: ["The kitten was hiding under a bed when the crew went in. Two weeks later he came back to the shelter for her."], t: ["#firefighter", "#adoptdontshop"] },
  { h: "MAN FINDS WEDDING RING HIS WIFE LOST 13 YEARS AGO — GROWING AROUND A CARROT", c: ["She lost it weeding the garden in 2011. He pulled up a carrot last week and there it was."], t: ["#garden", "#love"] },
  { h: "Bus driver stops his route to help a lost toddler in the rain", c: ["The driver spotted the boy alone at a crossing. He waited with him, holding an umbrella, until police found his mum.", "The bus company gave him an award."], t: ["#busdriver", "#hero"] },
  { h: "SHE WAS TOLD SHE'D NEVER WALK AGAIN. NOW SHE RUNS MARATHONS", c: ["She was 16 when a car crash left her paralysed. Ten years later she finished her fifth marathon."], t: ["#running", "#inspiration"] },
  { h: "Library forgives 40 years of fines after man returns his mother's book", c: ["He found it in his late mother's attic, still with the 1984 due-date stamp.", "The librarian framed the receipt."], t: ["#library", "#books"] }
];

// Each template: (story) => { text, expect }. expect.headline "" means the
// post really has none; the engine must not make one up.
const cap = (s) => s.c.join("\n\n");
const tags = (s) => s.t.join(" ");
const TEMPLATES = {
  "labels": (s) => ({ text: "Headline:\n" + s.h + "\n\nCaption:\n" + cap(s) + "\n\nHashtags:\n" + tags(s) }),
  "inline labels": (s) => ({ text: "Headline: " + s.h + "\nCaption: " + s.c.join("\n\n") + "\nHashtags: " + tags(s) }),
  "bold labels in chat": (s) => ({ text: "Sure! Here's your post:\n\n**Headline:** " + s.h + "\n\n**Caption:** " + cap(s) + "\n\n" + tags(s) + "\n\nWant me to write another version?" }),
  "heading labels": (s) => ({ text: "### HEADLINE\n" + s.h + "\n\n### CAPTION\n" + cap(s) + "\n\n### HASHTAGS\n" + tags(s) }),
  "title/description": (s) => ({ text: "Title: " + s.h + "\nDescription: " + cap(s) + "\n" + tags(s) }),
  "caption first": (s) => ({ text: "Caption: " + cap(s) + "\n\nHeadline: " + s.h + "\n\nHashtags: " + tags(s) }),
  "unlabelled": (s) => ({ text: s.h + "\n\n" + cap(s) + "\n\n" + tags(s) }),
  "unlabelled one block": (s) => ({ text: s.h + "\n" + s.c.join("\n") + "\n" + tags(s), expect: { caption: s.c.join("\n") } }),
  "markdown heading": (s) => ({ text: "Here's a draft for you:\n\n# " + s.h + "\n\n" + cap(s) + "\n\n" + tags(s) + "\n\nLet me know if you'd like changes!" }),
  "bold headline": (s) => ({ text: "**" + s.h + "**\n\n" + cap(s) + "\n\n" + tags(s) }),
  "tags first": (s) => ({ text: tags(s) + "\n\n" + s.h + "\n\n" + cap(s) }),
  "tags inline": (s) => ({ text: "Headline: " + s.h + "\nCaption: " + s.c[0].replace(/\.$/, "") + " " + s.t[0] + ". " + s.c.slice(1).join(" ") + "\nHashtags: " + s.t.slice(1).join(" "),
    expect: { caption: (s.c[0].replace(/\.$/, "") + " " + s.t[0] + ". " + s.c.slice(1).join(" ")).trim() } }),
  "headline only": (s) => ({ text: s.h, expect: { caption: "", hashtags: [] } }),
  "caption only": (s) => ({ text: cap(s), expect: { headline: "", hashtags: [] } }),
  "no hashtags": (s) => ({ text: "Headline: " + s.h + "\n\nCaption: " + cap(s), expect: { hashtags: [] } }),
  "messy spacing": (s) => ({ text: "  Headline:   " + s.h + "  \r\n\r\n\r\nCaption:\r\n   " + s.c.join("\r\n\r\n") + "   \r\n" + tags(s) + "  " }),
  "reply blocks": (s) => ({ blocks: [{ tag: "p", text: "Here's a post for you:" }, { tag: "h3", text: s.h }].concat(s.c.map(p => ({ tag: "p", text: p })), [{ tag: "p", text: tags(s) }, { tag: "p", text: "Want me to make it shorter?" }]) })
};

const NONSTORIES = [
  "Here's how to reverse a list in Python:\n\nYou can use slicing. It returns a new list.\n\nLet me know if you need more help!",
  "Sure, happy to help! What would you like the post to be about?",
  "1. Drink more water.\n2. Sleep eight hours.\n3. Walk every day.\n\nWould you like more tips?",
  "Easy banana bread\n\nIngredients:\n- 3 ripe bananas\n- 1 cup sugar\n\nMash the bananas. Bake for an hour.",
  "The capital of Australia is Canberra. It was chosen as a compromise between Sydney and Melbourne.",
  "Thanks! I've updated the document with your changes. Anything else?",
  "Meeting notes\n\nAttendees: Sam, Priya\nAction items: ship the beta on Friday.",
  "I can't browse the internet, but I can help you write the post if you share the details.",
  "Error: the request timed out. Please try again later.",
  "Dear team,\n\nPlease remember the office is closed on Monday. Enjoy the long weekend.\n\nBest,\nAlex"
];

const norm = (s) => String(s || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();

function pctStr(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "—"; }

function main() {
  const rows = [];
  let n = 0, hOK = 0, cOK = 0, tOK = 0, allOK = 0, asked = 0, askedWrong = 0, confWrong = 0, taskOK = 0;
  const times = [];
  const byTemplate = {};
  const confRight = [], confWrongArr = [];
  for (const [tname, tpl] of Object.entries(TEMPLATES)) {
    byTemplate[tname] = { n: 0, all: 0 };
    for (const s of STORIES) {
      const built = tpl(s);
      const ex = Object.assign({ headline: s.h, caption: cap(s), hashtags: s.t }, built.expect || {});
      const input = built.blocks ? { blocks: built.blocks } : built.text;
      const t0 = process.hrtime.bigint();
      const r = E.analyze(input);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      n++; byTemplate[tname].n++;
      const h = norm(r.headline) === norm(ex.headline);
      const c = norm(r.caption) === norm(ex.caption);
      const t = JSON.stringify(r.hashtags.map(x => x.toLowerCase())) === JSON.stringify(ex.hashtags.map(x => x.toLowerCase()));
      hOK += h; cOK += c; tOK += t;
      if (h && c && t) { allOK++; byTemplate[tname].all++; }
      if (r.needsConfirm) { asked++; if (!h) askedWrong++; }
      if (!h && !r.needsConfirm && r.headline) confWrong++;
      if (r.headline) (h ? confRight : confWrongArr).push(r.confidence.headline);
      // Task: "copy the caption and hashtags"
      const want = E.copyText({ headline: ex.headline, caption: ex.caption, hashtags: ex.hashtags }, ["caption", "hashtags"]);
      if (norm(E.copyText(r, ["caption", "hashtags"])) === norm(want)) taskOK++;
      if (!(h && c && t)) rows.push(tname + " / " + s.h.slice(0, 40) + ": " + [!h && "headline " + JSON.stringify(r.headline.slice(0, 50)), !c && "caption", !t && "hashtags " + r.hashtags.join(" ")].filter(Boolean).join(", "));
    }
  }

  // Hand-written corpus (the unit-test cases).
  let corpusPass = 0;
  corpus.forEach(c => { if (!diff(c, run(c)).length) corpusPass++; });

  // False positives: replies that aren't stories must not be offered.
  let fp = 0;
  NONSTORIES.forEach(t => { if (E.isStory(E.analyze(t), "strict")) fp++; });
  corpus.filter(c => c.group === "nonstory").forEach(c => { if (E.isStory(run(c), "strict")) fp++; });
  const nonN = NONSTORIES.length + corpus.filter(c => c.group === "nonstory").length;
  // ...and real stories should be offered.
  let offered = 0, offerN = 0;
  for (const tname of ["labels", "bold labels in chat", "unlabelled", "markdown heading", "reply blocks"]) {
    for (const s of STORIES) {
      const b = TEMPLATES[tname](s);
      offerN++;
      if (E.isStory(E.analyze(b.blocks ? { blocks: b.blocks } : b.text), "strict")) offered++;
    }
  }

  // Intents.
  let intentOK = 0;
  intents.forEach(c => {
    const p = IN.parse(c.say, c.ctx || {});
    const got = p.steps.map(s => s.fields && ["extract", "copy", "detect"].includes(s.op) ? [s.op, s.fields] : [s.op]);
    if (JSON.stringify(got) === JSON.stringify(c.steps)) intentOK++;
  });

  // Headline ranking on synthetic pages.
  const pages = [];
  const page = (o) => pages.push(o);
  STORIES.forEach((s, i) => {
    const other = STORIES[(i + 1) % STORIES.length].h;
    const head = { text: s.h, fontSize: 30, lines: 2, colours: 1, aboveHandle: true, offCenter: 0.1 };
    const deco = [{ text: "Breaking news", fontSize: 13, offCenter: 0.3 }, { text: "@dailystories", fontSize: 15, offCenter: 0.2 }, { text: "Swipe for more", fontSize: 12, offCenter: 0.4 }];
    page({ name: "pasted headline", cands: [head].concat(deco), want: s.h, right: s.h, sure: true });
    page({ name: "old headline above handle", cands: [Object.assign({}, head, { text: other, colours: 2 })].concat(deco), want: s.h, last: other, right: other, sure: true });
    page({ name: "big banner competing", cands: [Object.assign({}, head), { text: "LIMITED TIME OFFER INSIDE", fontSize: 48, offCenter: 0.2 }].concat(deco), want: s.h, right: s.h, sure: true });
    page({ name: "two equal boxes, nothing to go on", cands: [{ text: s.h, fontSize: 30 }, { text: other, fontSize: 30 }], want: "", right: null, sure: false });
  });
  let rankOK = 0, rankSafe = 0;
  pages.forEach(p => {
    const r = E.rankHeadlines(p.cands, { want: p.want, last: p.last });
    const acted = r.confidence >= 0.6;
    if (p.sure) { if (acted && r.top.text === p.right) rankOK++; if (!acted || r.top.text === p.right) rankSafe++; }
    else { if (!acted) { rankOK++; rankSafe++; } }
  });

  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  const mean = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : "—";

  const lines = [];
  const L = (s) => lines.push(s);
  L("# Benchmark");
  L("");
  L("Generated by `node tests/bench.js --write` — engine " + E.VERSION + ", " + new Date().toISOString().slice(0, 10) + ".");
  L("");
  L("The posts below were written to cover the layouts and edge cases in the brief, alongside the engine. They are a");
  L("regression baseline, not a sample of real posts: a layout that isn't here can still trip it up. Add any post that");
  L("does to `tests/fixtures/corpus.js` and it is checked from then on.");
  L("");
  L("## Extraction (" + n + " generated posts: " + STORIES.length + " stories × " + Object.keys(TEMPLATES).length + " layouts)");
  L("");
  L("| Measure | Result |");
  L("|---|---|");
  L("| Headline correct | " + pctStr(hOK, n) + " |");
  L("| Caption correct | " + pctStr(cOK, n) + " |");
  L("| Hashtags correct | " + pctStr(tOK, n) + " |");
  L("| All three correct | " + pctStr(allOK, n) + " |");
  L("| Wrong headline used without asking | " + pctStr(confWrong, n) + " |");
  L("| Asked to confirm | " + pctStr(asked, n) + " (" + askedWrong + " of those were genuinely wrong) |");
  L("| Mean confidence when right / wrong | " + mean(confRight) + " / " + mean(confWrongArr) + " |");
  L("| Task: “copy the caption and hashtags” exact | " + pctStr(taskOK, n) + " |");
  L("| Hand-written corpus cases passing | " + corpusPass + " / " + corpus.length + " |");
  L("| Response time (mean / p95 / max) | " + avg.toFixed(2) + " ms / " + p95.toFixed(2) + " ms / " + times[times.length - 1].toFixed(2) + " ms |");
  L("");
  L("## By layout");
  L("");
  L("| Layout | All three correct |");
  L("|---|---|");
  Object.entries(byTemplate).forEach(([k, v]) => L("| " + k + " | " + v.all + " / " + v.n + " |"));
  L("");
  L("## Chat pages");
  L("");
  L("| Measure | Result |");
  L("|---|---|");
  L("| Non-story replies offered as a story (false positives) | " + fp + " / " + nonN + " |");
  L("| Real stories offered without asking | " + offered + " / " + offerN + " |");
  L("");
  L("Without labels, a card comes up unasked only for a heading, or a first or bold line in CAPS or Title Case: a sentence-case first line plus hashtags is just as often a tweet or LinkedIn draft. Those stories are still found when you click the toolbar icon.");
  L("");
  L("## Instructions and the design");
  L("");
  L("| Measure | Result |");
  L("|---|---|");
  L("| Instructions turned into the right plan | " + intentOK + " / " + intents.length + " |");
  L("| Headline ranking: right box, or asked when it couldn't tell | " + rankOK + " / " + pages.length + " |");
  L("| Headline ranking: never acted on a wrong box | " + rankSafe + " / " + pages.length + " |");
  if (rows.length) {
    L("");
    L("## Misses");
    L("");
    L("A short caption pasted on its own reads like a two-sentence headline (\u201cHe waited 40 years for this letter. Then");
    L("it finally arrived.\u201d) or a headline with one line of story under it, so its first line is taken as the headline");
    L("and marked to check first: nothing runs on it until you confirm. 3.4 took any short single block as the headline");
    L("without asking.");
    L("");
    rows.slice(0, 40).forEach(r => L("- " + r));
  }
  const md = lines.join("\n") + "\n";
  console.log(md);
  if (process.argv.includes("--write")) fs.writeFileSync(path.join(__dirname, "BENCHMARK.md"), md);
}

main();
