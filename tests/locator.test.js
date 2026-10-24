/* Which text box on a design is the headline: the ranking the panel uses.
   Font size is one clue among several and never decides it alone. */
const test = require("node:test");
const assert = require("node:assert");
const E = require("../sat-highlighter/engine.js");

const box = (text, o) => Object.assign({ text, fontSize: 30, lines: 2, colours: 1, aboveHandle: false, offCenter: 0.1 }, o || {});

test("matching words win over bigger text", () => {
  const r = E.rankHeadlines([
    box("SALE ENDS TONIGHT AT MIDNIGHT", { fontSize: 44 }),
    box("FAMILY STUNNED AS LOST DOG RETURNS HOME", { fontSize: 30 })
  ], { want: "Family stunned as lost dog returns home" });
  assert.strictEqual(r.top.text, "FAMILY STUNNED AS LOST DOG RETURNS HOME");
  assert.ok(r.confidence >= 0.9, String(r.confidence));
});

test("a censored headline still matches what you pasted", () => {
  const r = E.rankHeadlines([box("MAN WHO K*LLED NEIGHBOUR'S DOG JAILED"), box("Breaking news today", { fontSize: 14 })],
    { want: "Man who killed neighbour's dog jailed" });
  assert.ok(r.top.sim >= 0.92);
});

test("the old headline above the @handle is found on a fresh page", () => {
  const r = E.rankHeadlines([
    box("OLD HEADLINE FROM THE LAST POST STILL HERE", { aboveHandle: true, colours: 2 }),
    box("Breaking news", { fontSize: 13 }),
    box("@dailystories", { fontSize: 15 })
  ], { want: "A brand new story about something else", last: "Old headline from the last post still here" });
  assert.strictEqual(r.top.text, "OLD HEADLINE FROM THE LAST POST STILL HERE");
  assert.ok(r.confidence >= 0.8, String(r.confidence));
});

test("two equally likely boxes: not sure, so the panel asks", () => {
  const r = E.rankHeadlines([box("FIRST BIG LINE OF TEXT ON THE PAGE"), box("SECOND BIG LINE OF TEXT ON THE PAGE", { fontSize: 29 })], {});
  assert.ok(r.confidence < 0.45, String(r.confidence));
});

test("the biggest text alone isn't enough to act on", () => {
  const r = E.rankHeadlines([box("A LARGE PROMO BANNER LINE", { fontSize: 60 }), box("small print under the banner", { fontSize: 12 })], {});
  assert.ok(r.confidence < 0.6, String(r.confidence));
});

test("handles, page counters, links and page-wide groups never win", () => {
  const r = E.rankHeadlines([
    box("@dailystories", { fontSize: 90 }), box("3 / 12", { fontSize: 90 }), box("www.example.com/story", { fontSize: 90 }),
    box("Breaking news HEADLINE TEXT HERE @dailystories", { fontSize: 90, container: true }),
    box("THE REAL HEADLINE TEXT HERE", { fontSize: 30, aboveHandle: true })
  ], {});
  assert.strictEqual(r.top.text, "THE REAL HEADLINE TEXT HERE");
});

test("a confirmed layout is learned and raises confidence next time", () => {
  const cands = [box("ANY HEADLINE ON A NEW PAGE HERE", { fontSize: 30 }), box("Some other caption-ish text on the page", { fontSize: 18 })];
  const before = E.rankHeadlines(cands, {}).confidence;
  const prof = E.learnProfile(null, cands[0], 30);
  const after = E.rankHeadlines(cands, { profile: prof }).confidence;
  assert.ok(after > before, before + " -> " + after);
  assert.strictEqual(prof.n, 1);
});
