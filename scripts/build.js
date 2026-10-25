/* Builds canva-headline-highlighter.zip from sat-highlighter/, the way the
   update check expects it: one sat-highlighter/ folder holding the extension.

   Refuses to build when version.json and the manifest disagree, because the
   update check would then tell everyone to update forever. When the download
   link points at a commit, that commit must hold this exact zip for this
   version: a link left over from the last release, or to a commit that was
   never pushed, would hand out the wrong zip.

   The zip is the same bytes every time for the same files (its dates come
   from version.json), so building again after the release commit changes
   nothing.

   node scripts/build.js            (no dependencies; plain Node)            */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "sat-highlighter");
const OUT = path.join(ROOT, "canva-headline-highlighter.zip");
const FILES = ["manifest.json", "background.js", "updates.js", "engine.js", "intent.js", "content.js", "chat.js", "panel.css", "README.md"];

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
const fail = (m) => { console.error("Build stopped: " + m); process.exit(1); };
if (vj.version !== manifest.version) fail("version.json says " + vj.version + " but manifest.json says " + manifest.version + ".");
// The zip at a commit (never changes), or main's zip with ?v=<version>.
const DL = /^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/(?:[0-9a-f]{40}\/canva-headline-highlighter\.zip|main\/canva-headline-highlighter\.zip\?v=(.+))$/;
const dl = String(vj.download || "").match(DL);
if (!dl || (dl[1] !== undefined && dl[1] !== vj.version)) fail("version.json's download link should be a commit's canva-headline-highlighter.zip, or main's with ?v=" + vj.version + ".");
for (const f of manifest.content_scripts.flatMap(c => (c.js || []).concat(c.css || []))) {
  if (!FILES.includes(f)) fail(f + " is in the manifest but not in the build list.");
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();

const dm = String(vj.date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
const [yy, mm, dd] = dm ? [+dm[1], +dm[2], +dm[3]] : [2026, 1, 1];
const dosTime = (12 << 11) & 0xffff;
const dosDate = (((yy - 1980) << 9) | (mm << 5) | dd) & 0xffff;

const entries = [{ name: "sat-highlighter/", data: Buffer.alloc(0) }]
  .concat(FILES.map(f => ({ name: "sat-highlighter/" + f, data: fs.readFileSync(path.join(SRC, f)) })));

const parts = [], central = [];
let offset = 0;
for (const e of entries) {
  const name = Buffer.from(e.name, "utf8");
  const isDir = e.name.endsWith("/");
  const comp = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(e.data, { level: 9 });
  const method = isDir ? 0 : 8;
  const crc = isDir ? 0 : CRC(e.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(method, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  parts.push(local, name, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(method, 10); c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(e.data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34);
  c.writeUInt16LE(0, 36); c.writeUInt32LE(isDir ? 0x10 : 0, 38); c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += local.length + name.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat(parts.concat([cd, end]));

const pinned = String(vj.download).match(/\/([0-9a-f]{40})\/canva-headline-highlighter\.zip$/);
if (pinned) {
  const { execFileSync } = require("child_process");
  const git = (...a) => execFileSync("git", ["-C", ROOT].concat(a), { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  let atSha = null, mfAtSha = null;
  try { atSha = git("show", pinned[1] + ":canva-headline-highlighter.zip"); mfAtSha = JSON.parse(git("show", pinned[1] + ":sat-highlighter/manifest.json").toString()); }
  catch (e) { fail("version.json's download link points at commit " + pinned[1].slice(0, 7) + ", which this repo doesn't have with a zip in it. Commit and push the zip first, then point the link at that commit."); }
  if (mfAtSha.version !== vj.version) fail("version.json's download link points at a commit with version " + mfAtSha.version + ", not " + vj.version + " — it's left over from an earlier release.");
  if (!atSha.equals(zip)) fail("The zip at commit " + pinned[1].slice(0, 7) + " isn't this build. Commit this zip, then point the download link at that commit.");
}
fs.writeFileSync(OUT, zip);
console.log("Built " + path.relative(ROOT, OUT) + " — version " + manifest.version + ", " + FILES.length + " files, "
  + Math.round(fs.statSync(OUT).size / 1024) + " KB.");
