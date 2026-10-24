/* Headline Highlighter — update check against the GitHub repo.
   Loaded by background.js; plain functions, so they can be tested on their own.

   The repo holds two files in the root of the main branch, the same way as
   PromptSnap and IG Ratio:
     version.json                    — the newest version and what changed
     canva-headline-highlighter.zip  — the extension itself
   Everything is read from raw.githubusercontent.com: github.com itself doesn't
   allow extensions to read it (IG Ratio's update check once failed on that). */

(function (root) {
  const REPO = {
    owner: "Kimchour",
    repo: "Canva-Headline-Highlighter",
    branch: "main",
    zip: "canva-headline-highlighter.zip"
  };

  const rawUrl = (path, repo) => {
    const r = repo || REPO;
    return "https://raw.githubusercontent.com/" + r.owner + "/" + r.repo + "/" + r.branch + "/" + path;
  };
  const pageUrl = (repo) => {
    const r = repo || REPO;
    return "https://github.com/" + r.owner + "/" + r.repo;
  };

  const clean = (v) => String(v == null ? "" : v).trim().replace(/^v/i, "");
  const isVersion = (v) => /^\d+(\.\d+){0,3}$/.test(clean(v));

  // "3.10.0" is newer than "3.9.2". Missing parts count as 0; a leading "v" is ignored.
  function cmpVer(a, b) {
    const p = (v) => clean(v).split(".").map(n => parseInt(n, 10) || 0);
    const x = p(a), y = p(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  const list = (v) => Array.isArray(v)
    ? v.map(x => String(x == null ? "" : x).trim()).filter(Boolean).slice(0, 40)
    : (typeof v === "string" && v.trim() ? [v.trim()] : []);

  // Downloads only ever come from GitHub, so a typo in version.json can't send
  // the download anywhere else. Anything else falls back to the zip in the repo.
  function safeDownload(url, version, repo) {
    const r = repo || REPO;
    const fallback = rawUrl(r.zip, r) + "?v=" + encodeURIComponent(clean(version));
    try {
      const u = new URL(String(url || ""));
      if (u.protocol !== "https:") return fallback;
      if (!/^(raw\.githubusercontent\.com|github\.com|objects\.githubusercontent\.com|codeload\.github\.com)$/i.test(u.hostname)) return fallback;
      return u.href;
    } catch (e) {
      return fallback;
    }
  }

  const entry = (e) => ({
    version: clean(e.version),
    date: typeof e.date === "string" ? e.date.trim().slice(0, 20) : "",
    added: list(e.added),
    fixed: list(e.fixed),
    notes: list(e.notes)
  });

  // Reads this repo's version.json, and also the shapes PromptSnap and IG Ratio
  // use: "download" or "download_url"; "notes" as text or a list; "added",
  // "fixed" and "history".
  function normalize(j, repo) {
    if (!j || typeof j !== "object" || !isVersion(j.version)) return null;
    const e = entry(j);
    return {
      version: e.version,
      date: e.date,
      added: e.added,
      fixed: e.fixed,
      notes: e.notes,
      required: j.required === true,
      download: safeDownload(j.download || j.download_url || j.zip || j.url, e.version, repo),
      history: Array.isArray(j.history)
        ? j.history.filter(h => h && isVersion(h.version)).map(entry).slice(0, 40)
        : []
    };
  }

  // One request, with a time limit and a fresh copy every time.
  async function getText(url, fetchImpl, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms || 10000) : null;
    try {
      const r = await fetchImpl(url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(),
        { cache: "no-store", signal: ctl ? ctl.signal : undefined });
      return { status: r.status, text: r.ok ? await r.text() : "" };
    } catch (e) {
      return { status: 0, text: "" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Asks GitHub for the newest version. Reads version.json; if the repo holds
  // the extension's own files instead, reads their manifest.json.
  async function check(installed, fetchImpl, repo) {
    const r = repo || REPO;
    const base = { installed: clean(installed), page: pageUrl(r), checkedAt: Date.now() };

    const vj = await getText(rawUrl("version.json", r), fetchImpl);
    let info = null, via = "version.json", broken = false;
    if (vj.status === 200) {
      try { info = normalize(JSON.parse(vj.text), r); } catch (e) { info = null; }
      if (!info) broken = true;
    }

    let mf = { status: -1 };
    if (!info) {
      mf = await getText(rawUrl("manifest.json", r), fetchImpl);
      if (mf.status === 200) {
        try {
          const m = JSON.parse(mf.text);
          if (isVersion(m.version)) { info = normalize({ version: m.version }, r); via = "manifest.json"; }
        } catch (e) {}
      }
    }

    if (!info) {
      if (broken) return Object.assign(base, { ok: false, why: "bad" });
      if (vj.status === 0 && mf.status === 0) return Object.assign(base, { ok: false, why: "offline" });
      if (vj.status === 404 && mf.status === 404) return Object.assign(base, { ok: false, why: "empty" });
      if (vj.status === 403 || vj.status === 429) return Object.assign(base, { ok: false, why: "busy" });
      return Object.assign(base, { ok: false, why: "error", status: vj.status || mf.status });
    }
    return Object.assign(base, {
      ok: true,
      via,
      latest: info.version,
      newer: cmpVer(info.version, installed) > 0,
      info
    });
  }

  const api = { REPO, rawUrl, pageUrl, cmpVer, isVersion, normalize, safeDownload, check };
  root.HHUpdates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
