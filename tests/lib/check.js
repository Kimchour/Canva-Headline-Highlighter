/* Compares what the engine found with what a corpus case expects. Returns the
   list of differences; an empty list means the case passed. */

const E = require("../../sat-highlighter/engine.js");

function run(c) {
  const input = c.blocks ? { blocks: c.blocks } : c.text;
  return E.analyze(input, c.opts || {});
}

function diff(c, r) {
  const x = c.expect || {};
  const out = [];
  const q = (v) => JSON.stringify(v);
  if ("headline" in x && r.headline !== x.headline) out.push("headline " + q(r.headline) + " ≠ " + q(x.headline));
  if (x.headlineHas && !r.headline.includes(x.headlineHas)) out.push("headline " + q(r.headline) + " lacks " + q(x.headlineHas));
  if ("caption" in x && r.caption !== x.caption) out.push("caption " + q(r.caption.slice(0, 70)) + " ≠ " + q(x.caption.slice(0, 70)));
  if (x.captionStarts && !r.caption.startsWith(x.captionStarts)) out.push("caption starts " + q(r.caption.slice(0, 40)));
  if (x.captionEnds && !r.caption.endsWith(x.captionEnds)) out.push("caption ends " + q(r.caption.slice(-40)));
  if (x.captionHas && !r.caption.includes(x.captionHas)) out.push("caption lacks " + q(x.captionHas));
  if (x.captionLacks && r.caption.includes(x.captionLacks)) out.push("caption has " + q(x.captionLacks));
  if (x.hashtags && q(r.hashtags) !== q(x.hashtags)) out.push("hashtags " + q(r.hashtags) + " ≠ " + q(x.hashtags));
  if ("confirm" in x && !!r.needsConfirm !== x.confirm) out.push("needsConfirm " + r.needsConfirm + " (headline " + r.confidence.headline + ")");
  if ("story" in x && E.isStory(r, "strict") !== x.story) out.push("isStory " + E.isStory(r, "strict"));
  if (x.options && (!r.options || r.options.length !== x.options)) out.push("options " + (r.options ? r.options.length : 0));
  if (x.candidatesAtLeast && (r.candidates || []).length < x.candidatesAtLeast) out.push("candidates " + (r.candidates || []).length);
  return out;
}

module.exports = { run, diff, E };
