/* Browser regression tests: problems found in the 4.0 pre-release review,
   each checked the way a person would hit it, on the mock Canva page.

   node tests/ui/regressions.js                                             */

const { serve, check, tally, openCanva, chromium, STUB, read } = require("./harness.js");

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

const SEED = { alignAfter: false, photoFill: false, photoInRun: false, runNotes: true, muted: true, closePanels: false, view: "studio", layoutVersion: 4, fitIntroduced: true, fillIntroduced: true };
const seed = (extra) => ({ hh: Object.assign({}, SEED, extra || {}) });

const text = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.innerText.trim() : null; }, sel);
const head = (page) => page.inputValue('[data-key="f-headline"]').catch(() => "");
const openCards = (page) => page.evaluate(() => document.querySelectorAll(".hh-askcard:not(.out)").length);
const cardText = (page) => page.evaluate(() => { const c = document.querySelector(".hh-askcard:not(.out) .hh-askcardtext"); return c ? c.innerText : ""; });
const clickCard = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll(".hh-askcard:not(.out) button")].find(x => x.textContent.trim().startsWith(l));
  if (b) b.click();
  return !!b;
}, label);

async function ask(page, words) {
  await page.fill("#hh-askin", words);
  await page.press("#hh-askin", "Enter");
  await page.waitForFunction(() => {
    const o = document.querySelector("#hh-askout");
    return o && o.classList.contains("show") && !o.querySelector(".hh-btnspin");
  }, null, { timeout: 10000 }).catch(() => {});
  return text(page, "#hh-askout");
}

async function paste(page, t) {
  await page.fill(".hh-paste", t);
  await page.waitForTimeout(450);
}

async function runDone(page) {
  await page.waitForFunction(() => !window.__hhTest || !document.querySelector("#hh-go.busy"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}

(async () => {
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch();
  const all = [];
  const scenario = async (name, s, opts, fn) => {
    console.log(name);
    const o = await openCanva(browser, base, s, opts);
    all.push(o);
    try { await fn(o.page, o); }
    catch (e) { check(name + ": ran to the end", false, String(e && e.message || e)); }
    check(name + ": no script errors", !o.errors.length, o.errors.join(" | "));
    await o.ctx.close();
  };

  await scenario("A headline already coloured in spans", seed({ lastPost: { key: "otherstory", text: "other story" } }), null, async (page) => {
    await page.evaluate(() => {
      document.getElementById("headline").innerHTML = '<p>FAMILY STUNNED AS <span style="color:#ffc93c">LOST DOG RETURNS HOME</span> AFTER THREE YEARS</p>';
    });
    const rk = await page.evaluate(() => { const r = window.__hhTest.rankOnPage(""); return { top: r.top && r.top.text, id: r.top && r.top.cand.n.closest(".headline, .second") && r.top.cand.n.closest(".headline, .second").id }; });
    check("the coloured run isn't a text box of its own", rk.top === "FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS", JSON.stringify(rk));
    await page.click('.hh-tile[data-act="detect"]');
    await page.waitForTimeout(500);
    check("Detect on an empty source reads the whole coloured headline", (await head(page)) === "FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS", await head(page));
    const v = await page.evaluate(() => window.__hhTest.pageVerdict("PILOT DIVERTS FLIGHT AFTER PASSENGER REFUSES TO SIT DOWN"));
    check("Automation sees a finished post and waits", v.why === "finished", JSON.stringify(v));
  });

  await scenario("A reading of the design, then another design", seed(), null, async (page) => {
    await page.click('.hh-tile[data-act="detect"]');
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => !!window.__hhTest.currentDet());
    await page.evaluate(() => history.pushState({}, "", "/design/ANOTHER/edit"));
    const after = await page.evaluate(() => window.__hhTest.currentDet());
    check("it's dropped on another design instead of being written there", before && !after, JSON.stringify(after && after.fields));
  });

  await scenario("Is this the headline? while you open another box", seed({ confLevel: "careful" }), { twin: true }, async (page) => {
    await paste(page, UNLABELLED);
    await page.click("#hh-go");
    await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 });
    const asked = /FAMILY STUNNED/.test(await cardText(page)) ? "second" : "headline";
    const other = asked === "second" ? "headline" : "second";
    const otherBefore = await text(page, "#" + other);
    await page.dblclick("#" + other);
    await page.waitForTimeout(200);
    await clickCard(page, "Yes");
    await runDone(page);
    check("the box you confirmed gets the new headline", /PILOT DIVERTS/.test(await text(page, "#" + asked)), await text(page, "#" + asked));
    check("the box you happened to open is left alone", (await text(page, "#" + other)) === otherBefore, await text(page, "#" + other));
  });

  await scenario("Cancel on Is this the headline?", seed({ confLevel: "careful" }), { twin: true }, async (page) => {
    await paste(page, UNLABELLED);
    await page.click("#hh-go");
    await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 });
    await clickCard(page, "Cancel");
    await page.waitForTimeout(1500);
    check("Run: one Cancel and it doesn't ask again", (await openCards(page)) === 0);
    await runDone(page);
    check("Run: says it was cancelled", /Cancelled/.test(await text(page, "#hh-result") || ""), await text(page, "#hh-result"));
    check("Run: nothing was pasted", !(await page.evaluate(() => window.__pastes)));
    await page.click('.hh-tile[data-act="highlight"]');
    await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 });
    await clickCard(page, "Cancel");
    await page.waitForTimeout(1500);
    check("Highlight: one Cancel and it doesn't ask again", (await openCards(page)) === 0);
  });

  await scenario("The card, keys and rings", seed({ confLevel: "careful" }), { twin: true }, async (page) => {
    await page.fill("#hh-askin", "where is the headline?");
    await page.press("#hh-askin", "Enter");
    await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 });
    const first = await cardText(page);
    // Every option the card offers is one text box, never the whole page.
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const t = await cardText(page);
      if (seen.includes(t)) break;
      seen.push(t);
      if (!(await clickCard(page, "Not this"))) break;
      await page.waitForTimeout(60);
    }
    check("the whole page is never offered as the headline", !seen.some(t => /FAMILY STUNNED/.test(t) && /OLD HEADLINE/.test(t)), seen.join(" | "));
    while ((await cardText(page)) !== first && seen.length > 1) { await clickCard(page, "Not this"); await page.waitForTimeout(40); }
    // Typing in Canva while the card is up: the keys stay Canva's.
    await page.dblclick("#headline");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    check("→ while typing in a Canva box doesn't move the card", (await cardText(page)) === first);
    check("…and doesn't pull focus out of the box", await page.evaluate(() => document.activeElement && document.activeElement.id === "headline"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    check("Esc in Canva doesn't answer the card", (await openCards(page)) === 1);
    // Two quick "Not this" presses, then Cancel: no ring is left behind.
    await clickCard(page, "Not this");
    await clickCard(page, "Not this");
    await clickCard(page, "Cancel");
    await page.waitForTimeout(700);
    check("no rings stuck on the design", (await page.evaluate(() => document.querySelectorAll(".hh-ring").length)) === 0);
  });

  await scenario("Ask box: words that mustn't change the design", seed(), null, async (page) => {
    await paste(page, LABELLED);
    await page.click("#notesbtn");
    await page.evaluate(() => { document.getElementById("noteed").innerText = "MY NOTES: photo credit Jane Doe"; });
    const notes = () => page.evaluate(() => document.getElementById("noteed").innerText);
    const designHead = () => text(page, "#headline");
    const h0 = await designHead();

    let out = await ask(page, "don't run it yet, just copy the caption");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check("“don't run it yet, just copy the caption” only copies", clip.startsWith("When Max") && (await designHead()) === h0 && /^MY NOTES/.test(await notes()), out);
    out = await ask(page, "what's in the notes?");
    check("“what's in the notes?” leaves Notes alone", /^MY NOTES/.test(await notes()), out);
    out = await ask(page, "copy the caption again");
    check("“copy the caption again” doesn't also look again", !/Looked again|Read it again/.test(out) && (await head(page)).startsWith("FAMILY"), out);
    out = await ask(page, "copy the headline, not the caption");
    check("“copy the headline, not the caption” copies just the headline", (await page.evaluate(() => navigator.clipboard.readText())).startsWith("FAMILY STUNNED") && !/Looked again/.test(out), out);
    out = await ask(page, "change the headline to the second one");
    check("“change the headline to the second one” isn't typed in as words", (await head(page)) !== "the second one", await head(page));
    out = await ask(page, "use option 2");
    check("“use option 2” without options doesn't swap the headline", !/Using candidate/.test(out) && (await head(page)).startsWith("FAMILY"), out);
    out = await ask(page, "clear the hashtags");
    check("“clear the hashtags” empties only the hashtags", (await page.locator(".hh-tag").count()) === 0 && (await head(page)).startsWith("FAMILY") && (await page.inputValue(".hh-paste")).length > 100, out);
    out = await ask(page, "go to settings");
    check("“go to settings” opens Settings and runs nothing", (await page.locator('.hh-mode .hh-segopt.on').innerText()).trim() === "Settings" && (await designHead()) === h0 && /^MY NOTES/.test(await notes()));
    check("nothing was pasted into the design or Notes", !(await page.evaluate(() => window.__pastes)));
  });

  await scenario("Ask box: clearing everything", seed(), null, async (page) => {
    await paste(page, LABELLED);
    let out = await ask(page, "start over");
    check("“start over” asks before wiping the source", /Go ahead/.test(out) && (await page.inputValue(".hh-paste")).length > 100, out);
    await page.click(".hh-askgate .hh-btn.primary");
    await page.waitForTimeout(500);
    check("…and clears it once you say yes", (await page.inputValue(".hh-paste")) === "");
    await paste(page, LABELLED);
    await ask(page, "start over then grab the headline");
    await page.click(".hh-askgate .hh-btn.primary");
    await page.waitForTimeout(800);
    out = await text(page, "#hh-askout");
    check("a step after Clear still runs and reports", (out.match(/\n/g) || []).length >= 2 && !/Error/.test(out), out);
  });

  await scenario("Retry on a labelled post", seed(), null, async (page) => {
    await paste(page, LABELLED);
    await page.click('.hh-tile[data-act="retry"]');
    await page.waitForTimeout(700);
    const h = await head(page);
    const c = await page.inputValue('[data-key="f-caption"]');
    check("Retry keeps a headline instead of emptying it", !!h && !c.startsWith("FAMILY"), JSON.stringify({ h, c: c.slice(0, 30) }));
  });

  await scenario("Your edits to a reading of the design", seed(), null, async (page) => {
    await page.click('.hh-tile[data-act="detect"]');
    await page.waitForTimeout(500);
    await page.fill('[data-key="f-headline"]', "MY OWN HEADLINE TYPED IN BY HAND");
    await page.waitForTimeout(300);
    await page.click('.hh-tile[data-act="copy"]');
    await page.waitForTimeout(500);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check("Copy All copies what you typed, not a fresh read", clip.startsWith("MY OWN HEADLINE"), JSON.stringify(clip.slice(0, 40)));
  });

  await scenario("A new post after an answer", seed(), null, async (page) => {
    await paste(page, LABELLED);
    await ask(page, "that's not the headline");
    await page.fill(".hh-paste", UNLABELLED);
    await page.waitForTimeout(500);
    check("the old answer goes when a different post comes in", !(await page.evaluate(() => document.querySelector("#hh-askout.show"))));
  });

  await scenario("Shortcuts while typing in Canva", seed(), null, async (page) => {
    await page.dblclick("#headline");
    await page.keyboard.press("Alt+KeyK");
    await page.waitForTimeout(150);
    check("Alt+K in a Canva text box stays in the box", await page.evaluate(() => document.activeElement && document.activeElement.id === "headline"));
  });

  await scenario("Header and Run card", seed({ collapsed: true, autoMode: false, runOpen: false }), null, async (page) => {
    check("folded, with Automation off: no AUTO badge", await page.evaluate(() => { const p = document.querySelector(".hh-autopill"); return !p || p.hidden; }));
    await page.click('.hh-head button[aria-label="Expand"]');
    await page.waitForTimeout(300);
    check("a folded Run card can't be tabbed into", await page.evaluate(() => { const c = document.querySelector(".hh-runcard .hh-collapsible"); return !!c && c.inert === true; }));
    const ink = await page.evaluate(() => {
      const b = document.getElementById("hh-go");
      const m = getComputedStyle(b).color.match(/\d+/g).map(Number);
      return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
    });
    check("Run's label is dark ink on the yellow accent", ink < 0.3, "luminance " + ink.toFixed(2));
    await page.click('.hh-head button[aria-label^="Clear everything"]');
    await page.waitForTimeout(300);
    const fits = await page.evaluate(() => document.querySelector(".hh-panel").getBoundingClientRect().bottom <= innerHeight + 1);
    check("the Clear confirm bar keeps the panel on screen", fits);
    await page.keyboard.press("Escape");
    await page.click('.hh-head button[aria-label^="Compact"]');
    await page.waitForTimeout(300);
    check("Compact: no tools menu button that can't open", (await page.locator("#hh-toolbtn").count()) === 0);
  });

  await scenario("A headline near the top of the design", seed(), null, async (page) => {
    await page.evaluate(() => {
      const st = document.getElementById("stage");
      st.style.top = "120px";
      const h = document.getElementById("headline");
      h.style.top = "24px";
      const s = document.getElementById("second");
      s.style.display = "block";
      s.style.top = "420px";
      s.style.fontSize = "18px";
      s.style.fontWeight = "500";
      s.innerHTML = "<p>Neighbours cheered as she carried him to safety</p>";
    });
    const rk = await page.evaluate(() => { const r = window.__hhTest.rankOnPage("GIRL SAVES DOG FROM FLOOD IN BATTAMBANG"); return { top: r.top && r.top.text, conf: r.confidence }; });
    check("the headline at the top is found, or it asks", /OLD HEADLINE/.test(rk.top || "") || rk.conf < 0.6, JSON.stringify(rk));
  });

  await scenario("A headline box written as two lines", seed(), null, async (page) => {
    await page.evaluate(() => {
      document.getElementById("headline").innerHTML = '<p>FAMILY STUNNED AS <span style="color:#ffc93c">LOST DOG</span></p><p>RETURNS HOME AFTER THREE YEARS</p>';
    });
    await page.click('.hh-tile[data-act="detect"]');
    await page.waitForTimeout(500);
    check("Detect reads both lines of the box", /^FAMILY STUNNED AS LOST DOG\s+RETURNS HOME AFTER THREE YEARS$/.test(await head(page)), await head(page));
  });

  await scenario("The design changed after it was read", seed(), null, async (page) => {
    await page.click('.hh-tile[data-act="detect"]');
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById("headline").innerHTML = "<p>SECOND HEADLINE TYPED ON THE DESIGN BY HAND</p>"; });
    await page.click('.hh-tile[data-act="copy"]');
    await page.waitForTimeout(500);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check("Copy All copies what's on the design now", clip.startsWith("SECOND HEADLINE"), JSON.stringify(clip.slice(0, 40)));
    await page.click('.hh-tile[data-act="highlight"]');
    await page.waitForTimeout(2500);
    check("Highlight doesn't write the old reading back", /SECOND HEADLINE/.test(await text(page, "#headline")), await text(page, "#headline"));
  });

  await scenario("Answering Go ahead? in words", seed(), null, async (page) => {
    await paste(page, LABELLED);
    await ask(page, "start over");
    await ask(page, "go ahead");
    check("“go ahead” confirms the clear, it doesn't run", (await page.inputValue(".hh-paste")) === "" && !(await page.evaluate(() => window.__pastes)));
    await paste(page, LABELLED);
    await ask(page, "start over");
    const out = await ask(page, "no, just copy the caption");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check("“no, just copy the caption” cancels and copies", clip.startsWith("When Max") && (await page.inputValue(".hh-paste")).length > 100, out);
    await ask(page, "start over");
    await page.evaluate((t) => window.__onMsg({ type: "hh-story", text: t, source: "ChatGPT" }, {}, () => {}), UNLABELLED);
    await page.waitForTimeout(500);
    check("a new story from chat takes away the pending question", (await page.locator(".hh-askgate").count()) === 0);
  });

  await scenario("Notes opened while the card asks", seed({ confLevel: "careful", runNotes: false }), { twin: true }, async (page) => {
    await paste(page, UNLABELLED);
    await page.click("#hh-go");
    await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 });
    await page.click("#notesbtn");
    await page.evaluate(() => { document.getElementById("noteed").innerText = "My notes for this design: photo by Jane Doe"; });
    await clickCard(page, "Yes");
    await runDone(page);
    check("the headline isn't written into Notes", (await page.evaluate(() => document.getElementById("noteed").innerText)).startsWith("My notes"),
      await page.evaluate(() => document.getElementById("noteed").innerText));
  });

  await scenario("After a cancelled run", seed({ confLevel: "careful" }), { twin: true }, async (page) => {
    await paste(page, UNLABELLED);
    await page.click("#hh-go");
    await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 });
    await clickCard(page, "Cancel");
    await runDone(page);
    await page.click("#hh-go");
    const asked = await page.waitForSelector(".hh-askcard:not(.out)", { timeout: 8000 }).then(() => true).catch(() => false);
    check("the next Run asks again instead of giving up", asked);
    await clickCard(page, "Cancel");
  });

  await scenario("A template with a coloured line", seed({ lastPost: { key: "x", text: "x" } }), null, async (page) => {
    await page.evaluate(() => {
      const h = document.querySelector(".handle");
      h.style.top = "560px";
      const s = document.getElementById("second");
      s.style.display = "block"; s.style.top = "500px"; s.style.fontSize = "16px";
      s.innerHTML = '<p>FOLLOW US <span style="color:#ffc93c">FOR THE FULL STORY</span></p>';
      document.getElementById("headline").style.top = "300px";
    });
    const v = await page.evaluate(() => window.__hhTest.pageVerdict("PILOT DIVERTS FLIGHT AFTER PASSENGER REFUSES TO SIT DOWN"));
    check("a coloured CTA line on a template isn't a finished post", v.why !== "finished", JSON.stringify(v));
  });

  // ChatGPT puts a post in a code block when asked: a language label and a
  // Copy button sit above the code.
  console.log("A post in a ChatGPT code block");
  {
    const cctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const cp = await cctx.newPage();
    const cerr = [];
    cp.on("pageerror", (e) => cerr.push(String(e)));
    await cp.addInitScript(STUB({ hh: { autoMode: false } }));
    await cp.goto(base + "/tests/fixtures/chat-mock.html");
    for (const f of ["engine.js", "chat.js"]) await cp.addScriptTag({ content: read(f) });
    await cp.waitForTimeout(800);
    await cp.evaluate(() => {
      const d = document.createElement("div");
      d.setAttribute("data-message-author-role", "assistant");
      d.innerHTML = '<p>Here it is in a code block:</p><pre><div><span>plaintext</span><button>Copy code</button></div><div><code>'
        + 'Headline: FAMILY STUNNED AS LOST DOG RETURNS HOME AFTER THREE YEARS\n\nCaption: When Max slipped out of the yard in 2023, the Parkers searched for months. Last week a shelter called.\n\nHashtags: #dogs #reunited</code></div></pre>';
      document.getElementById("thread").appendChild(d);
    });
    await cp.waitForFunction(() => { const h = document.getElementById("hh-chat-host"); return h && h.shadowRoot && h.shadowRoot.querySelector(".card .go"); }, null, { timeout: 8000 }).catch(() => {});
    await cp.evaluate(() => { const g = document.getElementById("hh-chat-host"); if (g) g.shadowRoot.querySelector(".go").click(); });
    await cp.waitForTimeout(400);
    const sent = await cp.evaluate(() => window.__sent.filter(m => m.type === "hh-send-story").map(m => m.text));
    check("the post is found and sent without the code block's label", sent.length === 1 && /^Headline:\nFAMILY STUNNED/.test(sent[0]) && !/plaintext/.test(sent[0]), JSON.stringify(sent[0] || "").slice(0, 80));
    check("A post in a ChatGPT code block: no script errors", !cerr.length, cerr.join(" | "));
    await cctx.close();
  }

  await browser.close();
  srv.close();
  console.log("\n" + tally.passed + " passed, " + tally.failed + " failed.");
  process.exit(tally.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
