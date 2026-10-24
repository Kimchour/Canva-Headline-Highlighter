/* Headline Highlighter — chat pages (Claude and ChatGPT)
   Watches the assistant's replies for a finished story with Headline and Caption
   labels, and offers to send just those parts to the open Canva design. */

(() => {
  if (window.__hhChat) return;
  window.__hhChat = true;

  const SOURCE = /claude\.ai$/.test(location.hostname) ? "Claude" : "ChatGPT";

  // Each reply is read once and remembered; it's read again only when its
  // text changes. Long chats no longer re-read every old reply on each scan.
  const readCache = new WeakMap();
  function cachedExtract(n) {  // extract() is hoisted, so this is safe to call early
    const len = (n.textContent || "").length;
    const c = readCache.get(n);
    if (c && c.len === len) return c.found;
    const found = extract(n.innerText || "");
    readCache.set(n, { len, found });
    return found;
  }



  /* ---------- reading a story out of a reply ---------- */

  const KEYS = {
    headline: "headline", title: "headline", hook: "headline",
    "short headline": "headline", "main headline": "headline",
    caption: "caption", "long caption": "caption", "short caption": "caption",
    "full caption": "caption", "main caption": "caption", body: "caption", story: "caption",
    hashtags: "tags", hashtag: "tags", tags: "tags", keywords: "tags",
    sources: "drop", source: "drop", references: "drop", reference: "drop",
    credit: "drop", credits: "drop", links: "drop", link: "drop", notes: "drop", note: "drop",
    rating: "drop", why: "drop", "why it works": "drop", angle: "drop"
  };
  const TAG_RE = /#[\p{L}\p{N}_]+/gu;

  // "HEADLINE:", "**Headline:**", "## Caption", "Headline: text on the same line".
  function labelOf(line) {
    const bare = line.replace(/^[\s#>*_\-]+/, "").replace(/[*_]+/g, "").trim();
    let m = bare.match(/^([A-Za-z][A-Za-z ]{0,20}?)\s*:\s*(.*)$/);
    if (m) {
      const key = KEYS[m[1].trim().toLowerCase()];
      if (key) return { key, rest: m[2] };
    }
    // A label alone on its line, without a colon.
    const key = KEYS[bare.toLowerCase()];
    if (key && ["headline", "caption", "tags"].includes(key)) return { key, rest: "" };
    return null;
  }

  const CHATTER = /^(let me know|want me to|would you like|if you('d| would) like|i can also|happy to|shall i|do you want)/i;

  function readStory(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const marks = [];
    lines.forEach((l, i) => { const lab = labelOf(l); if (lab) marks.push({ ...lab, at: i }); });

    const out = {};
    marks.forEach((mk, i) => {
      if (mk.key === "drop") return;
      const end = i + 1 < marks.length ? marks[i + 1].at : lines.length;
      const chunk = [mk.rest, ...lines.slice(mk.at + 1, end)].join("\n").trim();
      if (chunk && !out[mk.key]) out[mk.key] = chunk;
    });
    if (!out.headline || !out.caption) return null;

    // Only the hashtags themselves travel — never a follow-up question that
    // happens to sit after them.
    let tags = out.tags ? (out.tags.match(TAG_RE) || []) : [];

    // Hashtags written straight onto the end of the caption, with no label,
    // whether or not a blank line separates them from the text.
    const capLines = out.caption.split("\n");
    while (capLines.length) {
      const last = capLines[capLines.length - 1].trim();
      if (!last) { capLines.pop(); continue; }
      if (!/^(#[\p{L}\p{N}_]+[\s,]*)+$/u.test(last)) break;
      tags = (capLines.pop().match(TAG_RE) || []).concat(tags);
    }
    let paras = capLines.join("\n").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    while (paras.length > 1 && CHATTER.test(paras[paras.length - 1])) paras.pop();

    const headline = out.headline.split("\n").map(s => s.trim()).filter(Boolean).join("\n");
    const caption = paras.join("\n\n");
    if (!headline || !caption) return null;
    return { headline, caption, tags: [...new Set(tags)] };
  }

  function splitOptions(text) {
    const lines = String(text || "").split("\n");
    const marks = [];
    lines.forEach((l, i) => {
      const m = l.replace(/^[\s#>*_\-]+/, "").match(/^option\s+(\d+)\b(.*)$/i);
      if (m) marks.push({ at: i, n: m[1], rating: ((m[2] || "").match(/rated[\s:]*([\d.]+\s*\/\s*\d+)/i) || [])[1] || "" });
    });
    if (marks.length < 2) return null;
    return marks.map((mk, i) => ({
      n: mk.n, rating: mk.rating,
      text: lines.slice(mk.at + 1, i + 1 < marks.length ? marks[i + 1].at : lines.length).join("\n")
    }));
  }

  const block = (s) => "Headline:\n" + s.headline + "\n\nCaption:\n" + s.caption
    + (s.tags.length ? "\n\nHashtags:\n" + s.tags.join(" ") : "");

  // Rebuilds a clean block holding only the headline, caption and hashtags.
  function extract(text) {
    const opts = splitOptions(text);
    if (opts) {
      const good = opts.map(o => ({ o, s: readStory(o.text) })).filter(x => x.s);
      if (good.length > 1) {
        return {
          story: good[0].s, options: good.length,
          block: good.map(x => "OPTION " + x.o.n + (x.o.rating ? " (Rated " + x.o.rating + ")" : "") + "\n" + block(x.s)).join("\n\n")
        };
      }
      if (good.length === 1) return { story: good[0].s, options: 1, block: block(good[0].s) };
    }
    const s = readStory(text);
    return s ? { story: s, options: 1, block: block(s) } : null;
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
    const nodes = replies();
    let found = null, node = null;
    for (let i = nodes.length - 1; i >= 0 && !found; i--) {
      const f = cachedExtract(nodes[i]);
      if (f) { found = f; node = nodes[i]; }
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
    if (seen.has(key)) return;
    if (autoMode && isLive(node) && cardMode !== "busy") { autoSend(found, key); return; }
    if (!cardOpen) { showCard(found, key); return; }
    // An offer you haven't answered is replaced by a newer story. A card that's
    // sending or showing a result is left alone; closing it rescans.
    if (cardMode === "offer" && shownKey !== key) showCard(found, key, true);
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
  new MutationObserver(() => {
    markLive();
    clearTimeout(pending);
    pending = setTimeout(scan, 900);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-is-streaming"] });

  try {
    chrome.runtime.onMessage.addListener((m) => {
      if (!m || m.type !== "hh-toggle") return;
      if (cardOpen) { closeCard(); return; }
      if (latest) showCard(latest.found, latest.key);
      else showEmpty();
    });
  } catch (e) {}

  /* ---------- the card ---------- */

  let host = null, shadow = null, cardOpen = false;
  let shownKey = null;     // story on the open card
  let cardMode = null;     // "offer" | "busy" | "result"

  const CSS = `
    :host { all: initial; }
    .card {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      width: 320px; max-width: calc(100vw - 32px);
      box-sizing: border-box; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      background: #1c1d22; color: #eceef2;
      border: 1px solid #33363f; border-radius: 12px;
      box-shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 20px 48px -12px rgba(0,0,0,.6);
      font: 12.5px/1.45 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      animation: rise .22s cubic-bezier(.2,.8,.2,1) both;
    }
    .card.out { animation: fall .18s cubic-bezier(.2,.8,.2,1) both; }
    .card.swap { animation: swap .32s cubic-bezier(.2,.8,.2,1) both; }
    .top { display: flex; align-items: center; gap: 8px; }
    .dot { width: 9px; height: 9px; border-radius: 3px; background: #ffc93c; flex: 0 0 auto; }
    .title { flex: 1; font-size: 13px; font-weight: 600; }
    .x { width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: #a3a7b3; cursor: pointer; font-size: 15px; line-height: 1; }
    .x:hover { background: #25272e; color: #eceef2; }
    .head {
      margin: 0; font-size: 13px; font-weight: 650; line-height: 1.35;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    }
    .cells { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
    .cell { padding: 6px 8px; border-radius: 8px; background: #25272e; }
    .v { font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .l { font-size: 11px; color: #6f7381; }
    .note { font-size: 11.5px; color: #a3a7b3; }
    .row { display: flex; gap: 6px; }
    button.go, button.no {
      height: 34px; padding: 0 12px; border-radius: 9px; cursor: pointer;
      font: inherit; font-size: 12.5px; font-weight: 650;
      transition: filter .12s, background .12s, transform .08s;
    }
    button.go { flex: 1; border: 0; background: #ffc93c; color: #14151a; }
    button.go:hover { filter: brightness(1.06); }
    button.go:active, button.no:active { transform: translateY(1px); }
    button.go:disabled { opacity: .7; cursor: progress; }
    button.no { border: 1px solid #33363f; background: #25272e; color: #eceef2; }
    button.no:hover { background: #2c2e36; }
    button:focus-visible { outline: 2px solid #ffc93c; outline-offset: 1px; }
    .done { display: flex; align-items: center; gap: 8px; font-weight: 560; }
    .tick { width: 18px; height: 18px; border-radius: 50%; background: #ffc93c; display: grid; place-items: center; flex: 0 0 auto; }
    .tick svg { width: 12px; height: 12px; fill: none; stroke: #14151a; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .tick path { stroke-dasharray: 14; stroke-dashoffset: 14; animation: draw .3s cubic-bezier(.2,.8,.2,1) .08s forwards; }
    .warn { color: #ec7b6f; }
    .foot { margin-top: 2px; padding-top: 8px; border-top: 1px solid #292b32; text-align: center; font-size: 10.5px; letter-spacing: .02em; color: #6f7381; }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes fall { to { opacity: 0; transform: translateY(8px); } }
    @keyframes swap { from { border-color: #ffc93c; opacity: .55; } to { border-color: #33363f; opacity: 1; } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @media (prefers-reduced-motion: reduce) { .card, .card.out, .tick path { animation-duration: .001s; } }
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
      + '<div class="top"><span class="dot"></span><span class="title">'
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
    cardMode = "offer";
    frame(
      '<p class="head">' + esc(s.headline.replace(/\s*\n\s*/g, " ")) + "</p>"
      + '<div class="cells">'
      + '<div class="cell"><div class="v">' + s.headline.replace(/\s+/g, " ").length + '</div><div class="l">Headline</div></div>'
      + '<div class="cell"><div class="v">' + s.caption.length.toLocaleString() + '</div><div class="l">Caption</div></div>'
      + '<div class="cell"><div class="v">' + s.tags.length + '</div><div class="l">Hashtags</div></div>'
      + "</div>"
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
      go.textContent = "Sending\u2026";
      let answered = false;
      const done = (res) => {
        if (answered) return;
        answered = true;
        remember(key);
        showResult(res);
      };
      try {
        chrome.runtime.sendMessage({ type: "hh-send-story", text: found.block, source: SOURCE }, (res) => {
          if (chrome.runtime.lastError) { done({ ok: false, why: "error" }); return; }
          done(res || { ok: false, why: "error" });
        });
      } catch (e) { done({ ok: false, why: "error" }); }
      setTimeout(() => done({ ok: false, why: "slow" }), 12000);
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
    try {
      chrome.runtime.sendMessage({ type: "hh-send-story", text: found.block, source: SOURCE, auto: true }, (res) => {
        if (chrome.runtime.lastError) { done({ ok: false, why: "error" }); return; }
        done(res || { ok: false, why: "error" });
      });
    } catch (e) { done({ ok: false, why: "error" }); }
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
    const msg = res && (res.why === "no-canva" || res.why === "no-panel")
      ? "No Canva design is open. The story is saved and will appear in the Highlighter when you open one."
      : "Couldn't reach Canva. Reload the Canva tab and try again.";
    frame('<div class="note ' + (res && res.why === "error" ? "warn" : "") + '">' + msg + "</div>"
      + '<div class="row"><button class="no">OK</button></div>');
    shadow.querySelector(".no").onclick = () => closeCard();
  }

  function showEmpty() {
    cardMode = "result";
    frame('<div class="note">No finished story in this chat yet. A reply needs Headline and Caption labels.</div>'
      + '<div class="row"><button class="no">OK</button></div>');
    shadow.querySelector(".no").onclick = () => closeCard();
  }

  // For tests.
  window.__hhChatTest = { extract, readStory, scan };
})();
