/* Shared by the browser tests: a local server, the chrome.* stub, the mock
   Canva page with the extension's own files injected, and pass/fail output. */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "sat-highlighter");
const argShots = process.argv.indexOf("--shots");
const SHOTS = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : path.join(ROOT, "tests", "ui", "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const read = (f) => fs.readFileSync(path.join(EXT, f), "utf8");

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" });
      res.end(fs.readFileSync(p));
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

// chrome.* for the page: storage in memory, and a background that answers
// the update check the way the test says.
const STUB = (seed) => `
  window.__store = ${JSON.stringify(seed || {})};
  window.__sent = [];
  window.__upd = "current";
  const UPD = {
    current: { ok: true, latest: "4.0.0", newer: false, info: { version: "4.0.0", date: "2026-10-25", added: ["Smart Detect"], fixed: [], notes: [], history: [{ version: "3.4.0", date: "2026-10-25", added: ["Check for updates"], fixed: [], notes: [] }] } },
    newer: { ok: true, latest: "4.1.0", newer: true, info: { version: "4.1.0", date: "2026-11-02", required: false,
      added: ["Reads captions from Notes in other languages", "Faster headline ranking on long pages"], fixed: ["The Ask box kept its old answer after Clear"], notes: [],
      download: "https://raw.githubusercontent.com/Kimchour/Canva-Headline-Highlighter/main/canva-headline-highlighter.zip?v=4.1.0",
      history: [{ version: "4.0.0", date: "2026-10-25", added: ["Smart Detect"], fixed: [], notes: [] }] } },
    offline: { ok: false, why: "offline" }
  };
  window.chrome = {
    runtime: {
      id: "test", lastError: null,
      getManifest: () => ({ version: "4.0.0" }),
      sendMessage: (msg, cb) => {
        window.__sent.push(msg);
        let res = { ok: true };
        let wait = 30;
        if (msg.type === "hh-hello") res = { ok: true, tabId: 1 };
        if (msg.type === "hh-update-check") { res = Object.assign({ page: "https://github.com/x", checkedAt: Date.now(), installed: "4.0.0" }, UPD[window.__upd]); wait = 650; }
        if (msg.type === "hh-send-story") res = { ok: true };
        setTimeout(() => cb && cb(res), wait);
      },
      onMessage: { addListener: (fn) => { window.__onMsg = fn; } }
    },
    storage: {
      local: {
        get: (k, cb) => { const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach(x => { if (x in window.__store) o[x] = JSON.parse(JSON.stringify(window.__store[x])); }); setTimeout(() => cb(o), 0); },
        set: (o, cb) => { Object.assign(window.__store, JSON.parse(JSON.stringify(o))); cb && cb(); },
        remove: (k) => { (Array.isArray(k) ? k : [k]).forEach(x => delete window.__store[x]); }
      },
      onChanged: { addListener: () => {} }
    }
  };
`;

const tally = { passed: 0, failed: 0, results: [] };
function check(name, ok, detail) {
  tally.results.push({ name, ok: !!ok, detail });
  if (ok) tally.passed++; else tally.failed++;
  console.log((ok ? "  ✓ " : "  ✗ ") + name + (ok || !detail ? "" : " — " + detail));
}

async function openCanva(browser, base, seed, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(STUB(seed));
  await page.goto(base + "/tests/fixtures/canva-mock.html");
  if (opts && opts.twin) await page.evaluate(() => document.body.classList.add("twin"));
  await page.addStyleTag({ content: read("panel.css") });
  for (const f of ["engine.js", "intent.js", "content.js"]) await page.addScriptTag({ content: read(f) });
  await page.waitForSelector(".hh-root .hh-panel");
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}

const shot = async (page, name, el) => {
  const file = path.join(SHOTS, name + ".png");
  if (el) await page.locator(el).screenshot({ path: file });
  else await page.screenshot({ path: file });
  return file;
};

module.exports = { ROOT, EXT, SHOTS, read, serve, STUB, check, tally, openCanva, shot, chromium, fs, path };
