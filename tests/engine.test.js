/* The recognition engine against the labelled corpus, plus the guarantees
   that matter most: nothing invented, original wording kept, never a crash. */

const test = require("node:test");
const assert = require("node:assert");
const corpus = require("./fixtures/corpus.js");
const { run, diff, E } = require("./lib/check.js");

for (const c of corpus) {
  test("[" + c.group + "] " + c.name, () => {
    const r = run(c);
    const d = diff(c, r);
    assert.deepStrictEqual(d, [], d.join("; "));
  });
}

test("never invents text: every field comes from the input", () => {
  for (const c of corpus) {
    const r = run(c);
    const src = c.blocks ? c.blocks.map(b => b.text).join("\n") : c.text;
    const flat = (s) => s.replace(/\s+/g, " ").toLowerCase();
    const words = (s) => (s.match(/[\p{L}\p{N}']+/gu) || []);
    for (const w of words(r.headline + " " + r.caption)) {
      assert.ok(flat(src).includes(w.toLowerCase()), c.name + ": '" + w + "' is not in the input");
    }
    for (const t of r.hashtags) {
      // A Hashtags label over plain words is the one place a # is added.
      assert.ok(flat(src).includes(t.slice(1).toLowerCase()), c.name + ": " + t + " is not in the input");
    }
  }
});

test("keeps capitals, punctuation and emoji exactly", () => {
  const r = E.analyze("Headline: “I’ve waited 30 years” – Woman meets her birth mother 💞\nCaption: She CRIED. Then she laughed!!! 😂");
  assert.strictEqual(r.headline, "“I’ve waited 30 years” – Woman meets her birth mother 💞");
  assert.strictEqual(r.caption, "She CRIED. Then she laughed!!! 😂");
});

test("empty, odd and huge inputs never throw", () => {
  for (const t of ["", "   ", "\n\n\n", "#", "##", "Headline:", "Caption:", ":::", "🙂🙂🙂", null, undefined, 42, "a".repeat(20000), "Headline: x\n".repeat(500)]) {
    const r = E.analyze(t);
    assert.ok(r && typeof r.headline === "string" && Array.isArray(r.hashtags));
  }
});

test("reanalysis with the first headline rejected picks a different one or none", () => {
  const text = "MAN RETURNS LIBRARY BOOK 50 YEARS LATE\n\nA retired teacher walked into his local library with a book he borrowed in 1974. He paid the fine.\n\nLibrary staff framed the receipt";
  const first = E.analyze(text);
  const again = E.analyze(text, { exclude: [first.strategy], avoid: [first.headline] });
  assert.notStrictEqual(again.headline, first.headline);
});

test("strategies are reported, in order, with the one used", () => {
  const r = E.analyze("Headline: A dog came home after three years\nCaption: The family cried when he walked in.");
  assert.strictEqual(r.strategy, "labels");
  assert.strictEqual(r.tried[0].strategy, "labels");
  assert.ok(r.ms >= 0);
});

test("formatBlock and copyText give clean, separated output", () => {
  const r = E.analyze("Headline: Dog comes home\nCaption: He was gone for #three years. #dogs\nHashtags: #dogs #love");
  assert.strictEqual(E.formatBlock(r), "Headline:\nDog comes home\n\nCaption:\nHe was gone for #three years.\n\nHashtags:\n#three #dogs #love");
  // Hashtags already in the caption aren't repeated underneath.
  assert.strictEqual(E.copyText(r), "Dog comes home\n\nHe was gone for #three years.\n\n#dogs #love");
  assert.strictEqual(E.copyText(r, ["hashtags"]), "#three #dogs #love");
});

test("options are kept apart and can all be sent", () => {
  const t = "OPTION 1 (Rated 9/10)\nHeadline: First one about a dog\nCaption: One.\n\nOPTION 2\nHeadline: Second one about a dog\nCaption: Two.";
  const r = E.analyze(t);
  assert.strictEqual(r.options.length, 2);
  assert.strictEqual(r.options[0].rating, "9/10");
  const block = E.formatBlock(r, { allOptions: true });
  assert.ok(/^OPTION 1 \(Rated 9\/10\)\nHeadline:/.test(block));
  assert.ok(block.includes("OPTION 2\nHeadline:\nSecond one about a dog"));
});
