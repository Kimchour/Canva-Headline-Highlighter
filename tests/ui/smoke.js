/* Browser smoke tests: the real panel, engine and chat card on mock pages.

   Runs the extension's own files in Chromium (Playwright) against a stand-in
   Canva editor and a stand-in ChatGPT page, with the chrome.* APIs stubbed.
   Checks what a person would see and what actually happened on the page,
   and saves screenshots of each state.

   node tests/ui/smoke.js [--shots <dir>]                                  */

const { SHOTS, read, serve, STUB, check, tally, openCanva, shot, chromium, fs, path } = require("./harness.js");

const LABELLED = `Sure! Here's your post:

**Headline:** FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS

**Caption:** When Max slipped out of the yard in 2023, the Parkers searched for months. Last week a shelter two states away called. His microchip still had their number.

He walked straight to his old bed and fell asleep.

Hashtags: #dogs #reunited #truestory

Want me to write another version?`;

const UNLABELLED = `PILOT DIVERTS FLIGHT AFTER PASSENGER REFUSES TO SIT DOWN

The flight from Denver to Miami was 40 minutes in when a passenger stood in the aisle and would not return to his seat. The crew asked six times. The captain turned back.

He was met by police at the gate and banned by the airline.

#aviation #travel #flightdrama`;

const AMBIGUOUS = `This is so wild.

Some people never learn.

A man returned a library book 50 years late and paid the fine himself. Staff framed the receipt. He said he just wanted to do the right thing.`;

(async () => {
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch();
  const seedBase = { hh: { alignAfter: false, photoFill: false, photoInRun: false, runNotes: true, muted: true, closePanels: false, view: "studio", layoutVersion: 4, fitIntroduced: true, fillIntroduced: true } };

  console.log("Canva panel");
  let { ctx, page, errors } = await openCanva(browser, base, seedBase);
  try {
    check("panel renders with Studio, Ask box and five actions",
      await page.locator(".hh-mode .hh-segopt").count() === 3 && await page.locator("#hh-askin").count() === 1 && await page.locator(".hh-tile").count() === 5);
    await page.waitForTimeout(400);
    await shot(page, "01-studio-empty", ".hh-root");

    // Labelled paste
    await page.fill(".hh-paste", LABELLED);
    await page.waitForTimeout(450);
    const head = await page.inputValue('[data-key="f-headline"]');
    const cap = await page.inputValue('[data-key="f-caption"]');
    const tags = await page.locator(".hh-tag").allInnerTexts();
    check("labelled post: headline found exactly", head === "FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS", head);
    check("labelled post: caption keeps both paragraphs, no chat", cap.startsWith("When Max slipped") && cap.includes("\n\nHe walked") && !/Want me/.test(cap), cap);
    check("labelled post: three hashtags", tags.length === 3 && tags[0].includes("#dogs"), tags.join(","));
    check("labelled post: method shows Labels", (await page.innerText(".hh-detect .hh-method")).trim() === "Labels");
    await page.waitForTimeout(800);
    await shot(page, "02-detected-labelled", ".hh-root");

    // Ask: copy caption and hashtags
    await page.fill("#hh-askin", "copy the caption and hashtags");
    await page.waitForTimeout(120);
    const preview = await page.innerText("#hh-askprev");
    check("Ask preview explains the plan", /Copy caption \+ hashtags/.test(preview), preview);
    await shot(page, "03-ask-preview", ".hh-root");
    await page.press("#hh-askin", "Enter");
    await page.waitForSelector(".hh-askout.show.done", { timeout: 3000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check("copy the caption and hashtags: clipboard holds exactly those", clip.startsWith("When Max slipped") && clip.trim().endsWith("#dogs #reunited #truestory") && !clip.includes("FAMILY STUNNED"), JSON.stringify(clip.slice(0, 80)));
    await shot(page, "04-ask-done", ".hh-root");

    // Follow-up: "now the headline"
    await page.fill("#hh-askin", "now the headline");
    await page.press("#hh-askin", "Enter");
    await page.waitForTimeout(400);
    const clip2 = await page.evaluate(() => navigator.clipboard.readText());
    check("follow-up “now the headline” copies the headline", clip2 === "FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS", clip2);

    // Copy All tile
    await page.click('.hh-tile[data-act="copy"]');
    await page.waitForTimeout(400);
    const all = await page.evaluate(() => navigator.clipboard.readText());
    check("Copy All: headline, caption, hashtags, separated", all.split("\n\n").length === 4 && all.startsWith("FAMILY") && all.endsWith("#truestory"), JSON.stringify(all.slice(0, 60)));

    // Unlabelled paste
    await page.fill(".hh-paste", UNLABELLED);
    await page.waitForTimeout(450);
    const h2 = await page.inputValue('[data-key="f-headline"]');
    check("unlabelled post: headline found", h2 === "PILOT DIVERTS FLIGHT AFTER PASSENGER REFUSES TO SIT DOWN", h2);
    check("unlabelled post: caption has two paragraphs", (await page.inputValue('[data-key="f-caption"]')).split("\n\n").length === 2);
    check("unlabelled post: hashtags pulled off the end", (await page.locator(".hh-tag").count()) === 3);
    await shot(page, "05-detected-unlabelled", ".hh-root");

    // Ambiguous: asks first
    await page.fill(".hh-paste", AMBIGUOUS);
    await page.waitForTimeout(450);
    const banner = await page.locator(".hh-confirmbar").count();
    const hd3 = await page.inputValue('[data-key="f-headline"]');
    check("ambiguous text: no headline invented, or it asks first", hd3 === "" || banner === 1, "headline=" + JSON.stringify(hd3) + " banner=" + banner);
    await shot(page, "06-ambiguous", ".hh-root");

    // Run is refused while the headline is unconfirmed
    if (banner) {
      await page.click("#hh-go");
      await page.waitForTimeout(300);
      check("Run waits for the headline to be confirmed", !(await page.evaluate(() => window.__pastes)));
    }

    // Reanalyze changes or explains
    await page.fill(".hh-paste", UNLABELLED);
    await page.waitForTimeout(400);
    await page.fill("#hh-askin", "that's not the headline");
    await page.press("#hh-askin", "Enter");
    await page.waitForSelector(".hh-askout.show:not(.info)", { timeout: 3000 }).catch(() => {});
    const out = await page.innerText("#hh-askout");
    check("“that's not the headline” looks again a different way and says what changed", /again/i.test(out), out.replace(/\s+/g, " ").slice(0, 160));
    await shot(page, "07-reanalyze", ".hh-root");

    // Highlight Headline end to end on the mock editor
    await page.fill(".hh-paste", LABELLED);
    await page.waitForTimeout(400);
    await page.click('.hh-tile[data-act="highlight"]');
    await page.waitForFunction(() => !document.querySelector('.hh-tile[data-act="highlight"].busy'), null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const coloured = await page.evaluate(() => {
      const ed = document.getElementById("headline");
      const spans = [...ed.querySelectorAll("span")];
      const colours = new Set(spans.map(s => getComputedStyle(s).color));
      return { text: ed.innerText.trim(), colours: colours.size, pastes: window.__pastes || 0 };
    });
    check("Highlight Headline wrote the new headline into the right box", coloured.text === "FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS", coloured.text);
    check("Highlight Headline coloured phrases (two colours in the box)", coloured.colours >= 2, JSON.stringify(coloured));
    await shot(page, "08-highlighted", null);

    // Where is the headline? (ring on the design)
    await page.fill("#hh-askin", "where is the headline?");
    await page.press("#hh-askin", "Enter");
    await page.waitForSelector(".hh-layer .hh-ring", { timeout: 3000 });
    await page.waitForTimeout(900);          // after the ring's entrance motion
    const ring = await page.evaluate(() => {
      const box = document.querySelector(".hh-ring:not(.out) .hh-ringbox").getBoundingClientRect();
      const h = document.getElementById("headline");
      const rg = document.createRange(); rg.selectNodeContents(h);
      const t = rg.getBoundingClientRect();
      const d = [box.left + 6 - t.left, box.top + 6 - t.top, box.right - 6 - t.right, box.bottom - 6 - t.bottom].map(v => Math.round(v * 10) / 10);
      return { ok: d.every(v => Math.abs(v) < 3), d };
    });
    check("“where is the headline?” rings the headline's own text, aligned to the letters", ring.ok, JSON.stringify(ring.d));
    await shot(page, "09-located", null);

    // Updates sheet: checking, up to date, newer, offline
    await page.click("#hh-upbtn");
    await page.waitForSelector(".hh-updhero", { timeout: 2000 });
    await page.waitForSelector(".hh-updcheck:not([disabled])", { timeout: 3000 });
    await page.click(".hh-updcheck");
    await page.waitForSelector('.hh-updhero[data-phase="checking"]', { timeout: 2000 });
    check("Updates: shows Checking while it asks", true);
    await shot(page, "10-updates-checking", ".hh-root");
    await page.waitForSelector('.hh-updhero[data-phase="current"]', { timeout: 3000 });
    check("Updates: says Up to date with both versions", /up to date/i.test(await page.innerText(".hh-updhero")) && (await page.locator(".hh-verpill").count()) === 2);
    await page.waitForTimeout(600);
    await shot(page, "11-updates-current", ".hh-root");
    await page.evaluate(() => { window.__upd = "newer"; });
    await page.click(".hh-updcheck");
    await page.waitForSelector('.hh-updhero[data-phase="ready"]', { timeout: 3000 });
    const notes = await page.locator(".hh-updnotes li").allInnerTexts();
    check("Updates: a newer version shows release notes and a download button", notes.length === 3 && (await page.locator(".hh-updrow .hh-btn.primary").count()) === 1, notes.join(" | "));
    check("Updates: header button gets a dot", await page.locator("#hh-upbtn.has-update").count() === 1);
    await page.waitForTimeout(600);
    await shot(page, "12-updates-ready", ".hh-root");
    await page.evaluate(() => { window.__upd = "offline"; });
    await page.click(".hh-updcheck");
    await page.waitForTimeout(900);
    // A failed re-check keeps the version it already found, and says why.
    check("Updates: a failed check keeps what it knew", (await page.locator('.hh-updhero[data-phase="ready"]').count()) === 1);
    await page.click(".hh-sheetback");
    await page.waitForTimeout(300);

    // Tools, Settings, compact
    await page.click('.hh-mode .hh-segopt:nth-of-type(2)');
    await page.waitForTimeout(500);
    check("Tools tab shows the headline with picked phrases", (await page.locator(".hh-chip.lit").count()) > 0);
    await shot(page, "13-tools", ".hh-root");
    await page.click('.hh-mode .hh-segopt:nth-of-type(3)');
    await page.waitForTimeout(500);
    check("Settings has Detection options", /Ask me when unsure/.test(await page.innerText(".hh-view")));
    await shot(page, "14-settings", ".hh-root");
    await page.click('.hh-mode .hh-segopt:nth-of-type(1)');
    await page.waitForTimeout(300);

    // Empty source: Smart Detect reads the open design (headline on the page,
    // caption from Notes when Notes is open).
    await page.fill(".hh-paste", "");
    await page.waitForTimeout(300);
    await page.click("#notesbtn");
    await page.evaluate(() => { const n = document.getElementById("noteed"); n.innerText = "Max came home after three years.\n\n#dogs #home"; });
    await page.click('.hh-tile[data-act="detect"]');
    await page.waitForTimeout(600);
    check("empty source: Detect reads the headline on the design", (await page.inputValue('[data-key="f-headline"]')) === "FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS");
    check("empty source: and the caption and hashtags from Notes", (await page.inputValue('[data-key="f-caption"]')) === "Max came home after three years." && (await page.locator(".hh-tag").count()) === 2);
    check("empty source: method says Design", (await page.innerText(".hh-detect .hh-method")).trim() === "Design");
    await shot(page, "17-read-design", null);
    await page.click("#notesbtn");

    // Compact view
    await page.click('.hh-head .hh-icon[aria-pressed]');
    await page.waitForTimeout(400);
    check("Compact view: status line and Run only", (await page.locator(".hh-compact").count()) === 1 && (await page.locator(".hh-dock").count()) === 0);
    await shot(page, "18-compact", ".hh-root");
    await page.click('.hh-head .hh-icon[aria-pressed]');
    await page.waitForTimeout(300);

    // Ctrl + K focuses the Ask box
    await page.click(".hh-paste");
    await page.keyboard.press("Alt+k");
    check("Alt + K jumps to the Ask box", await page.evaluate(() => document.activeElement && document.activeElement.id === "hh-askin"));

    check("no script errors on the Canva page", !errors.length, errors.join(" | "));
  } finally { await ctx.close(); }

  console.log("Unsure headline on the design");
  ({ ctx, page, errors } = await openCanva(browser, base, Object.assign({}, seedBase, { hh: Object.assign({}, seedBase.hh, { confLevel: "careful" }) }), { twin: true }));
  try {
    await page.fill("#hh-askin", "where is the headline");
    await page.press("#hh-askin", "Enter");
    await page.waitForSelector(".hh-askcard", { timeout: 3000 });
    check("two equally likely boxes and no @handle: it asks instead of guessing", true);
    await shot(page, "15-ask-which", null);
    await page.click(".hh-askcard .hh-cbtn:nth-of-type(2)");     // Not this
    await page.waitForTimeout(250);
    check("“Not this” moves to the next candidate", /2 of/.test(await page.innerText(".hh-askcardfoot")));
    await page.click(".hh-askcard .hh-cbtn.primary");
    await page.waitForSelector(".hh-askout.show.done", { timeout: 3000 });
    const prof = await page.evaluate(() => window.__store.hh && window.__store.hh.hlProfile);
    check("confirming teaches it the layout", !!(prof && prof.n === 1), JSON.stringify(prof));
    check("no script errors", !errors.length, errors.join(" | "));
  } finally { await ctx.close(); }

  console.log("Chat page");
  {
    const cctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
    const cp = await cctx.newPage();
    const cerr = [];
    cp.on("pageerror", (e) => cerr.push(String(e)));
    await cp.addInitScript(STUB({ hh: { autoMode: false } }));
    await cp.goto(base + "/tests/fixtures/chat-mock.html");
    for (const f of ["engine.js", "chat.js"]) await cp.addScriptTag({ content: read(f) });
    await cp.waitForTimeout(1500);
    check("your own draft in the message box is never offered", await cp.evaluate(() => !document.getElementById("hh-chat-host") || !document.getElementById("hh-chat-host").shadowRoot.querySelector(".card")));
    await cp.evaluate((t) => {
      const d = document.createElement("div");
      d.setAttribute("data-message-author-role", "assistant");
      d.innerHTML = t;
      document.getElementById("thread").appendChild(d);
    }, "<p>Here's a post for you:</p><h3>Family stunned as lost dog returns home after three years</h3><p>When Max slipped out of the yard in 2023, the Parkers searched for months. Last week a shelter two states away called.</p><p>He walked straight to his old bed and fell asleep.</p><p>#dogs #reunited #truestory</p><p>Want me to make it shorter?</p>");
    await cp.waitForFunction(() => { const h = document.getElementById("hh-chat-host"); return h && h.shadowRoot && h.shadowRoot.querySelector(".card .go"); }, null, { timeout: 8000 }).catch(() => {});
    const card = await cp.evaluate(() => { const h = document.getElementById("hh-chat-host"); const c = h && h.shadowRoot.querySelector(".card"); return c ? c.innerText : ""; });
    check("an unlabelled story with hashtags in a reply gets a card", /Family stunned/.test(card), card.slice(0, 80));
    check("the card says it was found without labels", /without Headline\/Caption labels/.test(card));
    await cp.waitForTimeout(500);
    await cp.screenshot({ path: path.join(SHOTS, "16-chat-card.png") });
    await cp.evaluate(() => document.getElementById("hh-chat-host").shadowRoot.querySelector(".go").click());
    await cp.waitForTimeout(400);
    const sent = await cp.evaluate(() => window.__sent.filter(m => m.type === "hh-send-story").map(m => m.text));
    check("only the headline, caption and hashtags are sent", sent.length === 1 && /^Headline:\nFamily stunned/.test(sent[0]) && !/Want me|Here's a post/.test(sent[0]), JSON.stringify(sent[0] || "").slice(0, 120));
    check("no script errors on the chat page", !cerr.length, cerr.join(" | "));
    await cctx.close();
  }

  await browser.close();
  srv.close();
  console.log("\n" + tally.passed + " passed, " + tally.failed + " failed. Screenshots: " + SHOTS);
  fs.writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify(tally.results, null, 2));
  process.exit(tally.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
