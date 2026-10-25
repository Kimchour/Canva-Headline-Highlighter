// The update check (version.json on GitHub) lives in its own file.
importScripts("updates.js");

// Toolbar icon: shows or hides the panel on Canva, and re-opens the story card
// on Claude or ChatGPT.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "hh-toggle" }).catch(() => {});
});

// A story sent from a chat page goes to the most recently used Canva design tab.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "hh-send-story") return;

  (async () => {
    const story = { text: msg.text, source: msg.source || "chat", at: Date.now() };
    const keep = () => chrome.storage.local.set({ hhPending: story });

    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: "https://www.canva.com/design/*" }); } catch (e) {}
    if (!tabs.length) {
      await keep();
      sendResponse({ ok: false, why: "no-canva" });
      return;
    }
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const t = tabs[0];

    const deliver = async () => {
      try { return await chrome.tabs.sendMessage(t.id, { type: "hh-story", text: story.text, source: story.source }); }
      catch (e) { return null; }
    };

    let res = await deliver();
    if (!res || !res.ok) {
      // The tab was open before the extension loaded: put the panel in it.
      try {
        await chrome.scripting.insertCSS({ target: { tabId: t.id }, files: ["panel.css"] });
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["engine.js", "intent.js", "content.js"] });
        await new Promise(r => setTimeout(r, 900));
        res = await deliver();
      } catch (e) {}
    }
    if (!res || !res.ok) {
      await keep();
      sendResponse({ ok: false, why: "no-panel" });
      return;
    }

    try {
      await chrome.tabs.update(t.id, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
    } catch (e) {}
    sendResponse({ ok: true });
  })();

  return true;   // answer asynchronously
});


/* ---------- updates from GitHub ---------- */

const CANVA_TABS = ["https://www.canva.com/design/*"];
const CHAT_TABS = ["https://claude.ai/*", "https://chatgpt.com/*", "https://chat.openai.com/*"];

// Waits for a download to finish or stop.
function waitForDownload(id, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      chrome.downloads.onChanged.removeListener(onChange);
      clearTimeout(timer);
      resolve(r);
    };
    const onChange = (d) => {
      if (d.id !== id || !d.state) return;
      if (d.state.current === "complete") finish({ ok: true });
      if (d.state.current === "interrupted") finish({ ok: false, why: "interrupted" });
    };
    chrome.downloads.onChanged.addListener(onChange);
    const timer = setTimeout(() => finish({ ok: true, pending: true }), ms);
    chrome.downloads.search({ id }).then(([d]) => {
      if (d && d.state === "complete") finish({ ok: true });
      if (d && d.state === "interrupted") finish({ ok: false, why: "interrupted" });
    }).catch(() => {});
  });
}

async function downloadUpdate(url, version) {
  const v = String(version || "").replace(/[^\d.]/g, "") || "new";
  const safe = HHUpdates.safeDownload(url, v);
  // Make sure the zip is really there first: a missing zip once made IG
  // Ratio's update button lead to a 404 page.
  if (/^https:\/\/raw\.githubusercontent\.com\//i.test(safe)) {
    let status = 0;
    try { status = (await fetch(safe, { method: "HEAD", cache: "no-store" })).status; } catch (e) {}
    if (status === 404) return { ok: false, why: "nozip" };
    if (status === 0) return { ok: false, why: "offline" };
  }
  let id;
  try {
    id = await chrome.downloads.download({
      url: safe,
      filename: "canva-headline-highlighter-" + v + ".zip",
      conflictAction: "uniquify",
      saveAs: false
    });
  } catch (e) {
    return { ok: false, why: "error" };
  }
  const end = await waitForDownload(id, 120000);
  return end.ok ? { ok: true, id } : { ok: false, why: end.why || "interrupted", id };
}

// Is a Claude or ChatGPT tab still writing a reply? Refreshing it then would cut the reply off.
async function chatBusy(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.querySelector('[data-is-streaming="true"], [data-testid="stop-button"], button[aria-label*="Stop" i]')
    });
    return !!(res && res.result);
  } catch (e) {
    return false;
  }
}

// Reloads the extension from its folder. Settings stay, because nothing is
// removed. Open Canva and chat tabs are refreshed afterwards, so they run the
// new files.
// The tab whose panel asked refreshes itself once this copy is switched off.
// The others are refreshed by the new copy when it starts: Chrome doesn't
// always start it straight away, so the refreshed panel wakes it up.
async function reloadEverything(from, selfTab) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: CANVA_TABS.concat(CHAT_TABS) }); } catch (e) {}
  const at = Date.now();
  await chrome.storage.local.set({
    hhReloading: { from: String(from || ""), at, self: selfTab || null,
      tabs: tabs.filter(t => t.id !== selfTab).map(t => ({ id: t.id, url: t.url || "" })) },
    hhJustReloaded: { from: String(from || ""), at, self: selfTab || null }
  });
  setTimeout(() => chrome.runtime.reload(), 250);   // let this answer reach the panel first
  return { ok: true };
}

// A small "NEW" on the toolbar icon while a newer version is waiting.
function showUpdateBadge(r) {
  try {
    if (!r || !r.ok) return;
    chrome.action.setBadgeText({ text: r.newer ? "NEW" : "" });
    if (r.newer) {
      chrome.action.setBadgeBackgroundColor({ color: "#FFC93C" });
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#14151A" });
      chrome.action.setTitle({ title: "Headline Highlighter \u2014 version " + r.latest + " is ready" });
    } else {
      chrome.action.setTitle({ title: "Headline Highlighter" });
    }
  } catch (e) {}
}

let afterReloadRun = null;
function afterReload() {
  if (!afterReloadRun) afterReloadRun = doAfterReload();
  return afterReloadRun;
}
// Answers with the tabs it refreshes (so they aren't also given the new
// copy), then refreshes them.
async function doAfterReload() {
  let r = null;
  try { r = (await chrome.storage.local.get("hhReloading")).hhReloading; } catch (e) { return []; }
  if (!r) return [];
  await chrome.storage.local.remove("hhReloading");
  if (Date.now() - (r.at || 0) > 2 * 60 * 1000) return [];
  refreshAfterReload(r.tabs || []);
  return (r.tabs || []).map(t => t.id).concat(r.self ? [r.self] : []);
}
async function refreshAfterReload(tabs) {
  const busy = [];
  for (const t of tabs) {
    if (/^https:\/\/www\.canva\.com\/design\//i.test(t.url)) {
      if (await waitingWithStory(t.id)) await resumeAfterRefresh(t.id);
      chrome.tabs.reload(t.id).catch(() => {});
      continue;
    }
    if (await chatBusy(t.id)) busy.push(t.id);
    else chrome.tabs.reload(t.id).catch(() => {});
  }
  // A chat still writing its reply is refreshed once the reply is done.
  for (let i = 0; i < 8 && busy.length; i++) {
    await new Promise(res => setTimeout(res, 4000));
    for (let k = busy.length - 1; k >= 0; k--) {
      if (!(await chatBusy(busy[k]))) { chrome.tabs.reload(busy[k]).catch(() => {}); busy.splice(k, 1); }
    }
  }
  // Still writing after all that: give it the new copy instead of cutting the reply off.
  for (const id of busy) giveNewCopy({ id, url: "https://claude.ai/" });
}

// A Canva tab whose panel is waiting with a story (for its photo, a new page …)
// picks the wait up again after it's refreshed.
async function waitingWithStory(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.querySelector(".hh-root .hh-hold") });
    return !!(r && r.result);
  } catch (e) { return false; }
}
async function resumeAfterRefresh(tabId) {
  let cur = null;
  try { cur = (await chrome.storage.local.get("hhResume")).hhResume; } catch (e) {}
  const tabs = cur && Date.now() - (cur.at || 0) < 60000 && Array.isArray(cur.tabs) ? cur.tabs : [];
  try { await chrome.storage.local.set({ hhResume: { tabs: tabs.concat(tabId), at: Date.now() } }); } catch (e) {}
}

// Tabs that were open when the Highlighter was installed or updated have no
// copy, or an old one cut off from the extension ("Couldn't reach Canva"):
// give them the new one, so nothing needs refreshing.
async function giveNewCopy(t) {
  const canva = /^https:\/\/www\.canva\.com\/design\//i.test(t.url || "");
  try {
    // A panel from before 4.0.1 can't step aside for a new copy and would keep
    // acting behind it (a waiting run firing, keys answered twice): refresh
    // that tab instead. The story it holds is kept.
    if (canva) {
      const [old] = await chrome.scripting.executeScript({ target: { tabId: t.id },
        func: () => ({ old: !!document.querySelector(".hh-root") && !document.documentElement.hasAttribute("data-hh-panel"),
          held: !!document.querySelector(".hh-root .hh-hold") }) });
      if (old && old.result && old.result.old) {
        // A story it was waiting with waits again once the tab is back.
        if (old.result.held) await resumeAfterRefresh(t.id);
        await chrome.tabs.reload(t.id);
        return;
      }
    }
    if (canva) await chrome.scripting.insertCSS({ target: { tabId: t.id }, files: ["panel.css"] });
    await chrome.scripting.executeScript({ target: { tabId: t.id }, files: canva ? ["engine.js", "intent.js", "content.js"] : ["engine.js", "chat.js"] });
  } catch (e) {}
}
async function newCopiesEverywhere(skip) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: CANVA_TABS.concat(CHAT_TABS) }); } catch (e) { return; }
  // A tab Chrome put to sleep loads afresh when you open it.
  for (const t of tabs) if (t.id && !t.discarded && t.status !== "unloaded" && !skip.includes(t.id)) giveNewCopy(t);
}

chrome.runtime.onInstalled.addListener(async (d) => {
  const refreshing = await afterReload();
  if (d && (d.reason === "install" || d.reason === "update")) newCopiesEverywhere(refreshing || []);
});
afterReload();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "hh-update-check") {
    HHUpdates.check(chrome.runtime.getManifest().version, fetch.bind(self)).then((r) => {
      showUpdateBadge(r);
      sendResponse(r);
    });
    return true;
  }
  if (msg.type === "hh-update-download") {
    downloadUpdate(msg.url, msg.version).then(sendResponse);
    return true;
  }
  if (msg.type === "hh-update-show") {
    try { chrome.downloads.show(msg.id); sendResponse({ ok: true }); }
    catch (e) { sendResponse({ ok: false }); }
    return;
  }
  if (msg.type === "hh-open-extensions") {
    // The details page shows the folder the Highlighter is loaded from.
    chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id })
      .then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "hh-open-repo") {
    chrome.tabs.create({ url: HHUpdates.pageUrl() })
      .then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "hh-reload") {
    reloadEverything(msg.from, sender && sender.tab ? sender.tab.id : null).then(sendResponse);
    return true;
  }
  if (msg.type === "hh-hello") {
    // A panel just loaded: if a reload is waiting to finish, finish it (in the
    // background), and tell the panel which tab it is in.
    afterReload();
    sendResponse({ ok: true, tabId: sender && sender.tab ? sender.tab.id : null });
    return;
  }
});
