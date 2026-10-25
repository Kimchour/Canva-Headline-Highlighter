const test = require("node:test");
const assert = require("node:assert");
const U = require("../sat-highlighter/updates.js");
const fs = require("fs");
const path = require("path");

const fakeFetch = (routes) => async (url) => {
  const key = Object.keys(routes).find(k => url.includes(k));
  const r = key ? routes[key] : { status: 404 };
  if (r.throws) throw new Error("offline");
  return { status: r.status, ok: r.status === 200, text: async () => r.body || "" };
};

test("version comparison", () => {
  assert.strictEqual(U.cmpVer("4.0.0", "3.4.0"), 1);
  assert.strictEqual(U.cmpVer("3.10.0", "3.9.2"), 1);
  assert.strictEqual(U.cmpVer("v4.0", "4.0.0"), 0);
  assert.strictEqual(U.cmpVer("3.4.0", "4.0.0"), -1);
});

test("a newer version.json is reported with its notes", async () => {
  const body = JSON.stringify({ version: "4.1.0", date: "2026-11-02", added: ["A"], fixed: ["B"], history: [{ version: "4.0.0", added: ["C"] }] });
  const r = await U.check("4.0.0", fakeFetch({ "version.json": { status: 200, body } }));
  assert.ok(r.ok && r.newer);
  assert.strictEqual(r.latest, "4.1.0");
  assert.deepStrictEqual(r.info.added, ["A"]);
  assert.strictEqual(r.info.history[0].version, "4.0.0");
});

test("up to date, offline, missing, broken and busy are told apart", async () => {
  const same = await U.check("4.1.0", fakeFetch({ "version.json": { status: 200, body: '{"version":"4.1.0"}' } }));
  assert.ok(same.ok && !same.newer);
  assert.strictEqual((await U.check("4.0.0", fakeFetch({ "version.json": { throws: true }, "manifest.json": { throws: true } }))).why, "offline");
  assert.strictEqual((await U.check("4.0.0", fakeFetch({}))).why, "empty");
  assert.strictEqual((await U.check("4.0.0", fakeFetch({ "version.json": { status: 200, body: "{nope" } }))).why, "bad");
  assert.strictEqual((await U.check("4.0.0", fakeFetch({ "version.json": { status: 429 } }))).why, "busy");
});

test("downloads only ever come from GitHub", () => {
  assert.ok(U.safeDownload("https://evil.example.com/x.zip", "4.1.0").startsWith("https://raw.githubusercontent.com/Kimchour/"));
  assert.strictEqual(U.safeDownload("https://raw.githubusercontent.com/Kimchour/Canva-Headline-Highlighter/main/canva-headline-highlighter.zip?v=4.1.0", "4.1.0"),
    "https://raw.githubusercontent.com/Kimchour/Canva-Headline-Highlighter/main/canva-headline-highlighter.zip?v=4.1.0");
});

test("the repo's version.json matches the extension's manifest", () => {
  const root = path.join(__dirname, "..");
  const vj = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
  const mf = JSON.parse(fs.readFileSync(path.join(root, "sat-highlighter", "manifest.json"), "utf8"));
  assert.strictEqual(vj.version, mf.version);
  assert.ok(U.normalize(vj), "version.json reads cleanly");
  // A commit's zip (never changes), or main's with ?v=<version>.
  const pin = vj.download.match(/\/([0-9a-f]{40})\/canva-headline-highlighter\.zip$/);
  assert.ok(pin || vj.download.endsWith("?v=" + vj.version), vj.download);
  if (pin) {
    // That commit holds this version, not the last release's.
    const { execFileSync } = require("child_process");
    let mf = null;
    try { mf = JSON.parse(execFileSync("git", ["-C", root, "show", pin[1] + ":sat-highlighter/manifest.json"], { stdio: ["ignore", "pipe", "ignore"] }).toString()); } catch (e) {}
    if (mf) assert.strictEqual(mf.version, vj.version, "the pinned commit is this version's");
  }
  assert.strictEqual(U.safeDownload(vj.download, vj.version), vj.download, "the update check accepts the link as it is");
});
