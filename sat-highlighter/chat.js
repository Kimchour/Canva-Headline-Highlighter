/* Headline Highlighter — chat pages (Claude and ChatGPT)
   Watches the assistant's replies for a finished story with Headline and Caption
   labels, and offers to send just those parts to the open Canva design. */

(() => {
  // One copy per tab. After an update, the copy that was already in the page is
  // cut off from the extension: it can still find a story but can't send it.
  // The new copy takes the page over, and the old one steps aside.
  const DOC = document.documentElement;
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  if (window.__hhChat && DOC.getAttribute("data-hh-chat") === window.__hhChat && alive()) return;

  const SOURCE = /claude\.ai$/.test(location.hostname) ? "Claude" : "ChatGPT";

  const E = window.HHEngine;
  if (!E) { console.warn("Headline Highlighter: engine.js didn't load on this page."); return; }
  const COPY = Math.random().toString(36).slice(2);
  window.__hhChat = COPY;
  DOC.setAttribute("data-hh-chat", COPY);
  const current = () => DOC.getAttribute("data-hh-chat") === COPY && alive();
  let retired = false, watcher = null;

  // Each reply is read once and remembered; it's read again only when its
  // text changes. Long chats no longer re-read every old reply on each scan.
  const readCache = new WeakMap();
  function cachedExtract(n, mode) {  // extract() is hoisted, so this is safe to call early
    const len = (n.textContent || "").length;
    const key = mode || "strict";
    const c = readCache.get(n);
    if (c && c.len === len && key in c) return c[key];
    const entry = c && c.len === len ? c : { len };
    entry[key] = extract(n, key);
    readCache.set(n, entry);
    return entry[key];
  }

  /* ---------- reading a story out of a reply ---------- */

  // The reply's own structure (headings, bold lines, paragraphs) goes to the
  // engine, which finds the headline, caption and hashtags with or without
  // labels and says how sure it is. Only those three ever leave the page:
  // never the intro, sources, notes or follow-up questions.
  //   "strict": labelled, or unlabelled but clearly a post with hashtags
  //   "loose":  anything with a headline and a caption (only when you ask)
  // A cheap first look, so a long chat isn't analysed reply by reply: a story
  // has a headline label and a caption label (read line by line, the way the
  // engine reads them, in every word and language it knows) or two hashtags.
  const LABEL_WORDS = (t) => E.hasLabels(t);
  const TAG_START = /(?:^|[^\p{L}\p{N}_&\/#])#[\p{L}\p{N}_]/gu;
  const mayHoldStory = (t) => (t.match(TAG_START) || []).length >= 2 || LABEL_WORDS(t);

  function extract(node, mode) {
    const text = node.innerText || node.textContent || "";
    if (mode !== "loose" && !mayHoldStory(text)) return null;
    // Code, tables and technical answers aren't posts, unless they carry the
    // labels (a post can come in a code block for easy copying).
    const techy = !!(node.querySelector && (node.querySelector("pre, table") || node.querySelectorAll("code").length >= 3));
    if (techy && !LABEL_WORDS(text)) return null;
    let blocks = [];
    try { blocks = E.collectBlocks(node); } catch (e) { blocks = []; }
    // The reply's own structure, or its text when it has none. Reading the
    // text as well, as a second try, turned table rows into headlines.
    const r = blocks.length ? E.analyze({ blocks }) : E.analyze(text);
    if (!E.isStory(r, mode)) return null;
    const labelled = E.isStory(r, "labels");
    if (techy && !labelled) return null;
    // Even when you ask, a reply needs a post's shape: a labelled headline and
    // caption (in any language), or hashtags. A recipe or an essay with
    // headings has neither.
    const pair = r.strategy === "labels" && !!(r.labels && r.labels.headline && r.labels.caption);
    if (mode === "loose" && !labelled && !pair && !r.hashtags.length) return null;
    return {
      story: { headline: r.headline, caption: r.caption, tags: r.hashtags },
      options: r.options ? r.options.length : 1,
      block: E.formatBlock(r, { allOptions: true }),
      // Sent on its own only with Headline and Caption labels in 3.4's words.
      labelled,
      confidence: r.confidence.overall,
      method: r.strategyName
    };
  }

  /* ---------- finding the assistant's replies ---------- */

  const USER_SEL = '[data-message-author-role="user"], [data-testid="user-message"], [contenteditable="true"], textarea, .ProseMirror';

  function replies() {
    let nodes = [];
    if (SOURCE === "ChatGPT") nodes = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    else nodes = [...document.querySelectorAll("[data-is-streaming], .font-claude-response, .font-claude-message")];
    let generic = false;

    if (!nodes.length) {
      // Unknown layout: blocks holding both labels.
      generic = true;
      nodes = [...document.querySelectorAll("article, div")].filter(n => {
        const t = n.innerText || "";
        return /headline/i.test(t) && /caption/i.test(t) && t.length < 20000;
      });
    }
    // Never read what you typed or pasted — only the assistant's words.
    nodes = nodes.filter(n => !n.closest(USER_SEL) && !n.querySelector('[data-message-author-role="user"], [data-testid="user-message"]'));

    // Known layouts nest a reply's wrappers, so keep the outermost. For an
    // unknown layout keep the innermost, or the whole thread would count.
    return generic
      ? nodes.filter(n => !nodes.some(o => o !== n && n.contains(o)))
      : nodes.filter(n => !nodes.some(o => o !== n && o.contains(n)));
  }

  function streaming(node) {
    const s = node.closest("[data-is-streaming]");
    if (s && s.getAttribute("data-is-streaming") === "true") return true;
    if (SOURCE === "ChatGPT" && document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop" i]')) return true;
    return false;
  }

  const keyOf = (s) => (s.headline || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);

  /* ---------- watching ---------- */

  let autoMode = false;
  const readAuto = (hh) => { autoMode = !!(hh && hh.autoMode); };
  try {
    chrome.storage.local.get("hh", (r) => readAuto(r && r.hh));
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.hh) readAuto(ch.hh.newValue); });
  } catch (e) {}

  // Replies seen while they were being written. Only these are sent on their
  // own; a story that was already in the chat when you opened it is never
  // resent without asking.
  const live = new WeakSet();

  let seen = new Set();
  let latest = null;          // { key, found }
  let candidate = null;       // { key, text, since }
  let timer = null;

  try {
    chrome.storage.local.get("hhSeen", (r) => {
      if (r && Array.isArray(r.hhSeen)) r.hhSeen.forEach(k => seen.add(k));
      scan();
    });
  } catch (e) { scan(); }

  function remember(key) {
    seen.add(key);
    try { chrome.storage.local.set({ hhSeen: [...seen].slice(-300) }); } catch (e) {}
  }

  function scan() {
    clearTimeout(timer);
    if (retired) return;
    if (!current()) { retire(); return; }
    const nodes = replies();
    // "Still writing…": wait for the newest reply to finish before anything.
    if (cardMode === "waiting" && nodes.length && streaming(nodes[nodes.length - 1])) { timer = setTimeout(scan, 1200); return; }
    let found = null, node = null;
    // The newest replies only: a story far back in a long chat isn't offered,
    // and opening that chat doesn't read every old reply.
    for (let i = nodes.length - 1; i >= Math.max(0, nodes.length - 40) && !found; i--) {
      const f = cachedExtract(nodes[i]);
      if (f) { found = f; node = nodes[i]; }
    }
    // You asked while it was still writing: look the way the toolbar icon does.
    if (!found && cardMode === "waiting") {
      for (let i = nodes.length - 1; i >= Math.max(0, nodes.length - 4) && !found; i--) {
        const f = cachedExtract(nodes[i], "loose");
        if (f) { found = f; node = nodes[i]; }
      }
      // Finished, and there's no story in it: say so rather than wait forever.
      if (!found) { showEmpty(); return; }
    }
    if (!found) return;
    if (streaming(node)) { live.add(node); timer = setTimeout(scan, 1200); return; }

    // Wait until the reply has stopped changing for a moment.
    const key = keyOf(found.story);
    const text = found.block;
    if (!candidate || candidate.key !== key || candidate.text !== text) {
      candidate = { key, text, since: Date.now() };
      timer = setTimeout(scan, 1600);
      return;
    }
    if (Date.now() - candidate.since < 1400) { timer = setTimeout(scan, 800); return; }

    latest = { key, found };
    // Only a labelled story goes in by itself; an unlabelled one always asks.
    if (!seen.has(key) && autoMode && found.labelled && isLive(node) && cardMode !== "busy") { autoSend(found, key); return; }
    // "Still writing…": the finished story takes its place, as you asked.
    if (cardMode === "waiting") { showCard(found, key); return; }
    if (seen.has(key)) return;
    if (!cardOpen) { showCard(found, key); return; }
    // An offer you haven't answered is replaced by a newer story, or by the
    // finished version of the one shown. A card that's sending or showing a
    // result is left alone; closing it rescans.
    if (cardMode === "offer" && (shownKey !== key || shownBlock !== found.block)) showCard(found, key, shownKey !== key);
  }

  // Note replies that are being written right now. Runs on every change,
  // not after a pause, so even a short, fast reply is caught in the act.
  function markLive() {
    if (SOURCE === "ChatGPT") {
      if (document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop" i]')) {
        const a = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (a.length) live.add(a[a.length - 1]);
      }
    } else {
      document.querySelectorAll('[data-is-streaming="true"]').forEach(n => live.add(n));
    }
  }

  function isLive(node) {
    if (live.has(node)) return true;
    const up = node.closest("[data-is-streaming]");
    if (up && live.has(up)) return true;
    const down = node.querySelector && node.querySelector("[data-is-streaming]");
    return !!(down && live.has(down));
  }

  let pending = null;
  watcher = new MutationObserver(() => {
    if (!current()) { retire(); return; }
    dropOld();
    markLive();
    clearTimeout(pending);
    pending = setTimeout(scan, 900);
  });
  watcher.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-is-streaming"] });

  // A card an older copy put up can't send anything: only this copy's shows.
  function dropOld() {
    for (const c of [...DOC.children]) if (c.id === "hh-chat-host" && c !== host) c.remove();
  }

  // A newer copy has the page, or this one was cut off by an update: stop
  // watching. With nothing newer here, an open card says to refresh the tab.
  function retire() {
    if (retired) return;
    retired = true;
    if (watcher) watcher.disconnect();
    clearTimeout(timer);
    clearTimeout(pending);
    if (DOC.getAttribute("data-hh-chat") !== COPY) { if (host) host.remove(); return; }
    if (cardOpen && cardMode !== "result") showStale();
  }

  try {
    chrome.runtime.onMessage.addListener((m) => {
      if (!m || m.type !== "hh-toggle" || !current()) return;
      if (cardOpen) { closeCard(); return; }
      // A reply still being written comes first: its story isn't finished,
      // and an older one isn't what you're after.
      const nodes = replies();
      if (nodes.length && streaming(nodes[nodes.length - 1])) {
        showEmpty("Still writing \u2014 I'll offer the story when the reply is finished.", "waiting");
        return;
      }
      if (latest) { showCard(latest.found, latest.key); return; }
      // You asked: look harder at the newest replies, labels or not.
      for (let i = nodes.length - 1; i >= Math.max(0, nodes.length - 4); i--) {
        const f = cachedExtract(nodes[i], "loose");
        if (f) { showCard(f, keyOf(f.story)); return; }
      }
      showEmpty();
    });
  } catch (e) {}

  /* ---------- the card ---------- */

  let host = null, shadow = null, cardOpen = false;
  let shownKey = null;     // story on the open card
  let shownBlock = null;   // and exactly what it would send
  let cardMode = null;     // "offer" | "busy" | "result" | "waiting"

  const CSS = `
    :host { all: initial; }
    .card {
      --acc: #ffc93c;
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 330px; max-width: calc(100vw - 32px);
      box-sizing: border-box; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      background: radial-gradient(120% 70% at 0% 0%, rgba(255,201,60,.08), transparent 55%), rgba(23,24,30,.94);
      -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
      color: #eef0f4;
      border: 1px solid rgba(255,255,255,.09); border-radius: 16px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 24px 60px -18px rgba(0,0,0,.75);
      font: 12.5px/1.45 Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      animation: rise .4s cubic-bezier(.34,1.4,.64,1) both;
    }
    .card.out { animation: fall .2s cubic-bezier(.2,.8,.2,1) both; }
    .card.swap { animation: swap .4s cubic-bezier(.2,.8,.2,1) both; }
    .top { display: flex; align-items: center; gap: 8px; }
    .logo { width: 20px; height: 20px; border-radius: 6px; background: var(--acc); display: grid; place-items: center; flex: none; }
    .logo svg { width: 14px; height: 14px; fill: none; stroke: #14151a; stroke-width: 2; stroke-linecap: round; }
    .title { flex: 1; font-size: 13px; font-weight: 650; }
    .x { width: 26px; height: 26px; border: 0; border-radius: 8px; background: none; color: #a7abb7; cursor: pointer; font-size: 16px; line-height: 1; transition: background .15s, color .15s; }
    .x:hover { background: rgba(255,255,255,.07); color: #eef0f4; }
    .head {
      margin: 0; padding: 10px 11px; border-radius: 11px; background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.06);
      font-size: 13px; font-weight: 680; line-height: 1.35;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    }
    .cells { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
    .cell { padding: 7px 9px; border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.05); animation: rise .4s cubic-bezier(.2,.8,.2,1) both; }
    .cell:nth-child(2) { animation-delay: .04s; } .cell:nth-child(3) { animation-delay: .08s; }
    .v { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .l { font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #6f7482; }
    .conf { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #a7abb7; }
    .bar { flex: 1; height: 5px; border-radius: 5px; background: rgba(255,255,255,.08); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: inherit; background: #5ed39a; transform-origin: left; animation: fill .8s cubic-bezier(.2,.8,.2,1) both; }
    .bar i.mid { background: #f2b84b; } .bar i.low { background: #ef7f72; }
    .note { font-size: 11.5px; color: #a7abb7; }
    .note.loose { color: #f2b84b; }
    .row { display: flex; gap: 6px; }
    button.go, button.no {
      height: 36px; padding: 0 13px; border-radius: 10px; cursor: pointer;
      font: inherit; font-size: 12.5px; font-weight: 680;
      transition: filter .15s, background .15s, transform .15s cubic-bezier(.34,1.4,.64,1), box-shadow .2s;
    }
    button.go { flex: 1; border: 0; background: linear-gradient(180deg, #ffd45e, var(--acc)); color: #14151a; box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 8px 20px -10px rgba(255,201,60,.9); }
    button.go:hover { filter: brightness(1.06); transform: translateY(-1px); }
    button.go:active, button.no:active { transform: scale(.97); }
    button.go:disabled { opacity: .75; cursor: progress; transform: none; }
    button.no { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #eef0f4; }
    button.no:hover { background: rgba(255,255,255,.09); }
    button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .done { display: flex; align-items: center; gap: 9px; font-weight: 600; }
    .tick { width: 22px; height: 22px; border-radius: 50%; background: #5ed39a; display: grid; place-items: center; flex: 0 0 auto; animation: pop .4s cubic-bezier(.34,1.4,.64,1) both; }
    .tick svg { width: 13px; height: 13px; fill: none; stroke: #0f2a1d; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
    .tick path { stroke-dasharray: 14; stroke-dashoffset: 14; animation: draw .35s cubic-bezier(.2,.8,.2,1) .12s forwards; }
    .spin { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; vertical-align: -2px; animation: rot .7s linear infinite; }
    .warn { color: #ef7f72; }
    .foot { margin-top: 2px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.06); text-align: center; font-size: 10.5px; letter-spacing: .02em; color: #6f7482; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
    @keyframes fall { to { opacity: 0; transform: translateY(10px) scale(.98); } }
    @keyframes swap { from { box-shadow: 0 0 0 2px var(--acc), 0 24px 60px -18px rgba(0,0,0,.75); } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes fill { from { transform: scaleX(0); } }
    @keyframes pop { from { transform: scale(.5); opacity: 0; } }
    @keyframes rot { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .card, .card *, .card.out { animation-duration: .001s !important; transition-duration: .001s !important; } }
  `;

  function mount() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = "hh-chat-host";
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function frame(inner, swapped) {
    mount();
    shadow.innerHTML = "<style>" + CSS + "</style>"
      + '<div class="card' + (swapped ? " swap" : "") + '" role="dialog" aria-label="Send story to Canva">'
      + '<div class="top"><span class="logo"><svg viewBox="0 0 16 16"><path d="M5 4v8M11 4v8M5 8h6"/></svg></span><span class="title">'
      + (swapped ? "Newer story in " : "Story found in ") + SOURCE + "</span>"
      + '<button class="x" aria-label="Close">\u00d7</button></div>' + inner
      + '<div class="foot">Created by Oeng Kimchour</div></div>';
    cardOpen = true;
    shadow.querySelector(".x").onclick = () => closeCard(cardMode === "offer" ? shownKey : null);
  }

  function closeCard(markKey) {
    if (markKey) remember(markKey);
    const c = shadow && shadow.querySelector(".card");
    cardOpen = false;
    shownKey = null;
    shownBlock = null;
    cardMode = null;
    // A newer story may have finished while this card was up.
    setTimeout(scan, 400);
    if (!c) return;
    c.classList.add("out");
    setTimeout(() => { if (!cardOpen && shadow) shadow.innerHTML = ""; }, 200);
  }

  function showCard(found, key, swapped) {
    const s = found.story;
    shownKey = key;
    shownBlock = found.block;
    cardMode = "offer";
    const c = Math.round((found.confidence || 0) * 100);
    const lvl = c >= 80 ? "" : c >= 60 ? "mid" : "low";
    frame(
      '<p class="head">' + esc(s.headline.replace(/\s*\n\s*/g, " ")) + "</p>"
      + '<div class="cells">'
      + '<div class="cell"><div class="v">' + s.headline.replace(/\s+/g, " ").length + '</div><div class="l">Headline</div></div>'
      + '<div class="cell"><div class="v">' + s.caption.length.toLocaleString() + '</div><div class="l">Caption</div></div>'
      + '<div class="cell"><div class="v">' + s.tags.length + '</div><div class="l">Hashtags</div></div>'
      + "</div>"
      + '<div class="conf"><span>' + esc(found.method || "") + '</span><span class="bar"><i class="' + lvl + '" style="width:' + Math.max(4, c) + '%"></i></span><b>' + c + "%</b></div>"
      + (found.labelled ? "" : '<div class="note loose">Found without Headline/Caption labels \u2014 check the fields in Canva before you run.</div>')
      + (found.options > 1 ? '<div class="note">' + found.options + " options \u2014 you'll pick one in Canva.</div>" : "")
      + '<div class="note">Only the headline, caption and hashtags go to Canva.</div>'
      + '<div class="row"><button class="go">Send to Canva</button><button class="no">Not now</button></div>',
      swapped
    );
    const go = shadow.querySelector(".go");
    shadow.querySelector(".no").onclick = () => closeCard(key);
    go.onclick = () => {
      cardMode = "busy";
      go.disabled = true;
      go.innerHTML = '<span class="spin"></span>Sending\u2026';
      let answered = false;
      const done = (res) => {
        if (answered) return;
        answered = true;
        remember(key);
        showResult(res);
      };
      send({ type: "hh-send-story", text: found.block, source: SOURCE }, done);
    };
    setTimeout(() => go.focus(), 0);
  }

  function autoSend(found, key) {
    remember(key);
    shownKey = key;
    cardMode = "busy";
    frame('<p class="head">' + esc(found.story.headline.replace(/\s*\n\s*/g, " ")) + "</p>"
      + '<div class="note">Automation is on \u2014 sending to Canva\u2026</div>');
    let answered = false;
    const done = (res) => { if (answered) return; answered = true; showResult(res, true); };
    send({ type: "hh-send-story", text: found.block, source: SOURCE, auto: true }, done);
  }

  // Hands the story to the extension. A copy cut off by an update can't:
  // that's "refresh this tab", not a Canva problem.
  function send(msg, done) {
    const stale = () => done({ ok: false, why: "stale" });
    if (!alive()) { stale(); return; }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) { done({ ok: false, why: !alive() || /context invalidated/i.test(err.message || "") ? "stale" : "error" }); return; }
        done(res || { ok: false, why: "error" });
      });
    } catch (e) { if (!alive() || /context invalidated/i.test(String(e && e.message))) stale(); else done({ ok: false, why: "error" }); }
    setTimeout(() => done({ ok: false, why: "slow" }), 12000);
  }

  function showResult(res, auto) {
    cardMode = "result";
    if (res && res.ok) {
      frame('<div class="done"><span class="tick"><svg viewBox="0 0 16 16"><path d="M3.5 8.4l2.9 2.9 6.1-6.3"/></svg></span>'
        + (auto ? "<span>Sent. It's running in Canva now.</span></div>"
                : "<span>Sent. It's in the Highlighter's paste box \u2014 press Run in Canva.</span></div>"));
      setTimeout(() => closeCard(), 3200);
      return;
    }
    if (res && res.why === "stale") { showStale(); return; }
    const msg = res && res.why === "no-canva"
      ? "No Canva design is open. The story is saved and will appear in the Highlighter when you open one."
      : res && res.why === "no-panel"
      ? "The Highlighter isn't running in your Canva tab. Refresh that tab \u2014 the story is saved and will appear there."
      : res && res.why === "slow"
      ? "Canva didn't answer in time. Check the Canva tab, then try again."
      : "Couldn't reach Canva. Reload the Canva tab and try again.";
    frame('<div class="note ' + (res && res.why === "error" ? "warn" : "") + '">' + msg + "</div>"
      + '<div class="row"><button class="no">OK</button></div>');
    shadow.querySelector(".no").onclick = () => closeCard();
  }

  // This copy was cut off by an update (or the extension was switched off).
  function showStale() {
    cardMode = "result";
    frame('<div class="note warn">The Highlighter was updated or switched off, so this tab needs a refresh. Refresh it, then send the story again.</div>'
      + '<div class="row"><button class="go">Refresh tab</button><button class="no">Not now</button></div>');
    shadow.querySelector(".go").onclick = () => location.reload();
    shadow.querySelector(".no").onclick = () => closeCard();
  }

  function showEmpty(msg, mode) {
    cardMode = mode || "result";
    frame('<div class="note">' + esc(msg || "No finished story in this chat yet \u2014 a reply needs a headline and a caption.") + '</div>'
      + '<div class="row"><button class="no">OK</button></div>');
    shadow.querySelector(".no").onclick = () => closeCard();
  }

  // For tests.
  window.__hhChatTest = { extract, scan };
})();
