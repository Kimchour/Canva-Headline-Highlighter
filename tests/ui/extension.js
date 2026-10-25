/* The real extension, loaded unpacked into Chromium: claude.ai and canva.com
   are served from the mock pages, so the manifest's content scripts, the
   service worker and Chrome's messaging between them are the real thing.

   Checks a story going from a chat tab to Canva, then an update with both tabs
   open (the folder's files loaded again, as Chrome does on an update): the open
   tabs keep working without a refresh. Then the extension is removed: the
   Canva tab says to refresh.

   node tests/ui/extension.js                                               */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { check, tally, EXT, ROOT } = require("./harness.js");

const FIX = path.join(ROOT, "tests", "fixtures");
const REPLY = '<div data-is-streaming="false"><div class="font-claude-response">'
  + "<ul><li><strong>Cut:</strong> The tweet's comment, which jokes about her.</li></ul>"
  + '<p class="whitespace-pre-wrap">HEADLINE:\nFAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS</p>'
  + '<p class="whitespace-pre-wrap">CAPTION:\nWhen Max slipped out of the yard in 2023, the Parkers searched for months.</p>'
  + "<p>Last week a shelter two states away called. His microchip still had their number.</p>"
  + "<p>HASHTAGS: #dogs #reunited #truestory</p></div></div>";

const hosts = (p) => p.evaluate(() => [...document.documentElement.children].filter(c => c.id === "hh-chat-host"));
const cards = (p) => p.evaluate(() => [...document.documentElement.children].filter(c => c.id === "hh-chat-host" && c.shadowRoot && c.shadowRoot.querySelector(".card"))
  .map(c => c.shadowRoot.querySelector(".card").innerText.replace(/\s+/g, " ")));
const send = (p) => p.evaluate(() => {
  for (const h of [...document.documentElement.children].filter(c => c.id === "hh-chat-host")) {
    const b = h.shadowRoot && h.shadowRoot.querySelector(".go");
    if (b) { b.click(); return true; }
  }
  return false;
});
const pasteBox = (p) => p.evaluate(() => { const t = document.querySelector(".hh-paste"); return t ? t.value : ""; });
const waitCard = (p, re) => p.waitForFunction((src) => [...document.documentElement.children].some(c => c.id === "hh-chat-host" && c.shadowRoot && c.shadowRoot.querySelector(".card")
  && new RegExp(src).test(c.shadowRoot.querySelector(".card").innerText)), re.source, { timeout: 12000 }).catch(() => {});

(async () => {
  // A copy of the extension's folder, so an update can be played out on it.
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "hh-ext-"));
  for (const f of fs.readdirSync(EXT)) fs.copyFileSync(path.join(EXT, f), path.join(ext, f));
  const port = 9300 + Math.floor(Math.random() * 600);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "hh-profile-")), {
    headless: true, channel: "chromium", viewport: { width: 1400, height: 900 },
    ignoreDefaultArgs: ["--disable-extensions"], args: ["--enable-unsafe-extension-debugging", "--remote-debugging-port=" + port]
  });
  const errors = [];
  await ctx.route("https://claude.ai/**", r => r.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(FIX, "chat-mock.html"), "utf8") }));
  await ctx.route("https://www.canva.com/**", r => r.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(FIX, "canva-mock.html"), "utf8") }));
  const cdp = await (await chromium.connectOverCDP("http://127.0.0.1:" + port)).newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: ext });

  const canva = await ctx.newPage();
  canva.on("pageerror", e => errors.push("canva: " + e));
  await canva.goto("https://www.canva.com/design/DAGtest/edit");
  await canva.waitForSelector(".hh-root .hh-panel", { timeout: 10000 }).catch(() => {});
  const chat = await ctx.newPage();
  chat.on("pageerror", e => errors.push("chat: " + e));
  await chat.goto("https://claude.ai/chat/1");
  await chat.waitForTimeout(1200);

  console.log("A story from Claude to Canva");
  await chat.evaluate((h) => document.getElementById("thread").insertAdjacentHTML("beforeend", h), REPLY);
  await waitCard(chat, /FAMILY STUNNED/);
  check("the chat card finds the story", /FAMILY STUNNED/.test((await cards(chat)).join(" ")), JSON.stringify(await cards(chat)));
  await send(chat);
  await canva.waitForFunction(() => /FAMILY STUNNED/.test((document.querySelector(".hh-paste") || {}).value || ""), null, { timeout: 8000 }).catch(() => {});
  const got = await pasteBox(canva);
  check("it arrives in the Canva panel: headline, caption and hashtags only", /^Headline:\nFAMILY STUNNED/.test(got) && /#dogs #reunited #truestory/.test(got) && !/tweet/.test(got), JSON.stringify(got.slice(0, 80)));

  console.log("An update with both tabs open");
  await cdp.send("Extensions.loadUnpacked", { path: ext });
  await chat.waitForTimeout(3000);
  check("Canva: one panel, from the new copy", (await canva.locator(".hh-root").count()) === 1 && (await canva.locator(".hh-stale").count()) === 0);
  await chat.evaluate((h) => document.getElementById("thread").insertAdjacentHTML("beforeend", h.replace(/FAMILY STUNNED AS LOST DOG/, "PILOT DIVERTS FLIGHT AS DOG")), REPLY);
  await waitCard(chat, /PILOT DIVERTS/);
  check("the chat tab offers the next story without a refresh, on one card", (await hosts(chat)).length === 1 && /PILOT DIVERTS/.test((await cards(chat)).join(" ")), JSON.stringify(await cards(chat)));
  await send(chat);
  await canva.waitForFunction(() => /PILOT DIVERTS/.test((document.querySelector(".hh-paste") || {}).value || ""), null, { timeout: 8000 }).catch(() => {});
  check("…and sends it to Canva", /PILOT DIVERTS/.test(await pasteBox(canva)), (await cards(chat)).join(" ").slice(0, 120));

  console.log("The extension removed");
  await cdp.send("Extensions.uninstall", { id });
  await canva.waitForTimeout(2500);
  check("the Canva tab says to refresh", (await canva.locator(".hh-stale").count()) === 1);
  await chat.evaluate((h) => document.getElementById("thread").insertAdjacentHTML("beforeend", h.replace(/FAMILY STUNNED AS LOST DOG/, "THIRD STORY")), REPLY);
  await chat.waitForTimeout(2500);
  check("the chat tab offers nothing it can't send", !/THIRD STORY/.test((await cards(chat)).join(" ")), JSON.stringify(await cards(chat)));

  check("no script errors", !errors.length, errors.join(" | "));
  await ctx.close();
  console.log("\n" + tally.passed + " passed, " + tally.failed + " failed.");
  process.exit(tally.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
