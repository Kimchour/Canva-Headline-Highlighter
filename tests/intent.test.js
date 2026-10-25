const test = require("node:test");
const assert = require("node:assert");
const IN = require("../sat-highlighter/intent.js");
const cases = require("./fixtures/intents.js");

for (const c of cases) {
  test("“" + c.say + "”", () => {
    const p = IN.parse(c.say, c.ctx || {});
    // Fields matter where you can choose them: extract, copy, detect.
    const got = p.steps.map(s => s.fields && ["extract", "copy", "detect"].includes(s.op) ? [s.op, s.fields] : [s.op]);
    assert.deepStrictEqual(got, c.steps);
    assert.strictEqual(p.understood, c.steps.length > 0);
    if (c.n) assert.strictEqual(p.steps[0].n, c.n);
    if (c.value) assert.strictEqual(p.steps[0].value, c.value);
    if (c.from) assert.strictEqual(p.steps[0].from, c.from);
    if (c.steps.length) assert.ok(p.summary.length > 0);
  });
}

test("every plan step is something the panel can carry out", () => {
  const known = new Set(Object.keys(IN.OP_LABEL));
  for (const c of cases) for (const s of IN.parse(c.say, c.ctx || {}).steps) assert.ok(known.has(s.op), s.op);
});

test("confidence drops when much of the instruction isn't understood", () => {
  const clear = IN.parse("copy the caption");
  const fuzzy = IN.parse("copy the flibbertigibbet wobble caption zork");
  assert.ok(clear.confidence > fuzzy.confidence);
  assert.ok(fuzzy.unknown.includes("flibbertigibbet"));
});

test("what an instruction leaves alone", () => {
  assert.deepStrictEqual(IN.parse("remove the hashtags from the caption").steps[0].fields, ["hashtags"]);
  assert.deepStrictEqual(IN.parse("remove the hashtags, keep the caption").steps[0].fields, ["hashtags"]);
  assert.deepStrictEqual(IN.parse("undo the fill and the line up").steps[0].what, ["fill", "lineup"]);
  assert.deepStrictEqual(IN.parse("run it but don't fill the notes").steps[0].skip, ["notes"]);
  assert.notStrictEqual(IN.parse("delete the caption's last line").steps[0] && IN.parse("delete the caption's last line").steps[0].op, "clearfield");
  // "go ahead" on its own, with nothing to answer, is still a run.
  assert.strictEqual(IN.parse("go ahead").steps[0].op, "run");
});
