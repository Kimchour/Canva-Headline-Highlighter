/* Which phrases of a headline get coloured. */
const test = require("node:test");
const assert = require("node:assert");
const E = require("../sat-highlighter/engine.js");

const pick = (h, s) => {
  const w = h.split(/\s+/);
  return E.pickSpans(w, s).map(([a, b]) => w.slice(a, b + 1).join(" "));
};

test("a quote is always coloured whole", () => {
  const p = pick('Mechanic tells mum "PAY ME BACK BY BEING KIND" after fixing car');
  assert.ok(p.includes('"PAY ME BACK BY BEING KIND"'), p.join(" | "));
});

test("a number stays with what it counts", () => {
  const p = pick("WOMAN WAITS 15 YEARS FOR HER STOLEN CAR TO BE FOUND");
  assert.ok(p.some(x => /15 YEARS/.test(x)), p.join(" | "));
});

test("never ends on a word that leaves the phrase hanging", () => {
  for (const h of ["BURGLAR BROKE INTO THE HOME OF A RETIRED JUDGE", "PILOT DIVERTS FLIGHT TO DENVER AFTER PASSENGER STORMED COCKPIT"]) {
    for (const x of pick(h, "heavy")) assert.ok(!/\b(INTO|OF|TO|THE|A|AND|FOR|WITH|FROM)$/.test(x), x);
  }
});

test("more for heavy, less for light", () => {
  const h = "AIRLINE BANNED PASSENGER FOR LIFE AFTER HE REFUSED TO SIT DOWN AND YELLED AT CREW FOR 40 MINUTES";
  const count = (s) => pick(h, s).join(" ").split(" ").length;
  assert.ok(count("heavy") > count("light"));
});

test("an empty headline picks nothing", () => {
  assert.deepStrictEqual(E.pickSpans([], "medium"), []);
});
