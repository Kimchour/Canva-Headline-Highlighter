/* Regressions found in the 4.0 pre-release review, compared with 3.4.
   Each case is a post (or reply) taken from the reviewers' reproductions. */

const test = require("node:test");
const assert = require("node:assert");
const E = require("../sat-highlighter/engine.js");

test("a labelled caption keeps an opening hook paragraph", () => {
  for (const hook of ["Yes, you read that right. 😳", "Here's what happened 👇", "Great news for travelers! ✈️", "Thank you, Officer Daniels. 💙", "Of course, nobody believed him.", "Thanks to one stranger, Max is home.", "Absolutely heartbreaking."]) {
    const r = E.analyze("**Headline:** Grandma, 92, graduates from college 70 years after dropping out 🎓\n\n**Caption:** " + hook + "\n\nShe left school in 1954 to care for her younger siblings. This spring she walked across the stage.\n\n**Hashtags:** #neverquit #inspiration");
    assert.ok(r.caption.startsWith(hook), hook + " -> " + r.caption.slice(0, 40));
    assert.deepStrictEqual(r.hashtags, ["#neverquit", "#inspiration"]);
  }
});

test("a labelled caption keeps its closing call to action", () => {
  for (const cta of ["Tell me in the comments what you would have done 👇", "Hope this made your day a little brighter ❤️", "If you need help, call or text 988.", "Feel free to share this with someone who needs it.", "Which one would you pick? 👇", "Want more stories like this? Follow us."]) {
    const r = E.analyze("Headline:\nPilot lands plane alone after co-pilot faints mid-flight\n\nCaption:\nForty minutes out of Denver the co-pilot slumped over.\n\n" + cta + "\n\nHashtags:\n#aviation #pilot");
    assert.ok(r.caption.endsWith(cta), cta + " -> " + r.caption.slice(-40));
  }
});

test("the assistant's follow-up offer is still left out", () => {
  const r = E.analyze("Headline: Dog walks 20 miles home\n\nCaption: Cooper was rehomed in March. Three days later he turned up on their porch.\n\nWant me to write a shorter version for TikTok?");
  assert.strictEqual(r.caption, "Cooper was rehomed in March. Three days later he turned up on their porch.");
});

test("hashtags on a closing line survive a follow-up offer after it", () => {
  const r = E.analyze("Headline: Dog walks 20 miles to find the family that gave him away\n\nCaption: Cooper was rehomed in March. Three days later he turned up on their porch.\n\nHope this made you smile ❤️ #dogs #loyalty #goodnews\n\nWant me to write a shorter version for TikTok?");
  assert.deepStrictEqual(r.hashtags, ["#dogs", "#loyalty", "#goodnews"]);
  assert.ok(r.caption.endsWith("Hope this made you smile ❤️"), r.caption);
});

test("'Take a…', 'Version 2…' lines in a caption are not option markers", () => {
  const a = E.analyze("**Headline:** Therapist shares the 2-minute habit that calms anxiety fast\n\n**Caption:** Dr. Lena Ortiz says most people skip the simplest fix.\n\n- Take a slow breath in for four seconds.\n- Hold it for four.\n- Take a long breath out for six.\n\nShe says it works anywhere.\n\n**Hashtags:** #anxiety #mentalhealth");
  assert.strictEqual(a.headline, "Therapist shares the 2-minute habit that calms anxiety fast");
  assert.ok(a.caption.includes("Take a long breath out for six."));
  assert.strictEqual(a.options, null);
  const b = E.analyze("Headline: Nurse who sang to dying patient goes viral\n\nCaption: Take a moment to watch this.\n\nNurse Dana Cole sang Amazing Grace at his bedside.\n\nTake a second to thank a nurse today.\n\nHashtags: #nurses #kindness");
  assert.strictEqual(b.headline, "Nurse who sang to dying patient goes viral");
  assert.ok(b.caption.startsWith("Take a moment"));
  const c = E.analyze("Headline: App update fixes battery drain\nCaption: Version 2 of the app is out today.\nVersion 3 comes in spring.");
  assert.strictEqual(c.options, null);
  // Real options still work.
  const d = E.analyze("OPTION 1 (Rated 9/10)\nHeadline: First one about a dog\nCaption: One.\n\nOPTION 2\nHeadline: Second one about a dog\nCaption: Two.");
  assert.strictEqual(d.options.length, 2);
  const e = E.analyze("Option A: Emotional\nHeadline: Dog comes home\nCaption: Everyone cried.\n\nOption B: Punchy\nHeadline: He's back\nCaption: Three years later.");
  assert.strictEqual(e.options.length, 2);
});

test("a long first caption paragraph on the Caption: line loses its label", () => {
  const long = "The council voted seven to two on Tuesday " + "to keep the library open late every night of the week, ".repeat(14);
  const r = E.analyze("Headline: Council keeps library open late\nCaption: " + long + "\nHashtags: #library");
  assert.ok(r.caption.startsWith("The council voted"), r.caption.slice(0, 30));
});

test("just a headline works again, whatever it starts with", () => {
  for (const h of ["Here's why airlines are quietly removing seat-back screens", "Great-grandmother, 104, becomes oldest person to skydive", "Thanks to a stranger, this dog is home", "Do you want to live to 100? Scientists say walk more", "Love this: teen mows lawns for free"]) {
    const r = E.analyze(h);
    assert.strictEqual(r.headline, h, h);
    assert.strictEqual(r.caption, "");
  }
  const two = E.analyze("He waited 40 years for this letter. Then it finally arrived.");
  assert.strictEqual(two.headline, "He waited 40 years for this letter. Then it finally arrived.");
  assert.ok(two.needsConfirm, "two sentences: asks first");
});

test("'Why?', 'Tips:', 'Tip:', 'Photo:' and 'Note:' inside a caption stay in it", () => {
  const why = E.analyze("Headline:\nMom quits six-figure job to sell lemonade with her daughter\n\nCaption:\nJenna Brooks walked away from a $140,000 marketing job in May.\n\nWhy?\n\nBecause her 7-year-old asked her to. The stand now makes more than her old salary.\n\nHashtags:\n#goodnews #family");
  assert.ok(why.caption.includes("Why?") && why.caption.endsWith("old salary."), why.caption);
  const tips = E.analyze("Headline: Pilot shares how to stay safe in turbulence\nCaption: Captain Tom Hale has flown for 31 years.\nTips:\nKeep your seatbelt on.\nHe says the crew will always warn you.\nHashtags: #travel");
  assert.ok(tips.caption.includes("Keep your seatbelt on.") && tips.caption.includes("warn you"), tips.caption);
  const tip = E.analyze("Headline: Flight attendant reveals the one thing she never touches\nCaption: After 18 years in the air she has one rule.\nTip: wipe down the tray table.\nShe says crews rarely have time to clean it.\nHashtags: #travel");
  assert.ok(tip.caption.includes("Tip: wipe down the tray table.") && tip.caption.includes("rarely have time"), tip.caption);
  // A real sources section is still left out.
  const src = E.analyze("Headline: Library forgives fines\nCaption: He returned it.\nSources:\nhttps://example.com\nHashtags: #books");
  assert.ok(!src.caption.includes("example.com"));
});

test("long and short captions: the first one is used, not both", () => {
  const r = E.analyze("Headline:\nPilot lands plane alone after co-pilot faints mid-flight\n\nLong caption:\nForty minutes out of Denver the co-pilot slumped over. A nurse on board helped.\n\nShort caption:\nHe landed a 737 alone. 👏\n\nHashtags:\n#aviation #pilot");
  assert.strictEqual(r.caption, "Forty minutes out of Denver the co-pilot slumped over. A nurse on board helped.");
  assert.ok(r.warnings.some(w => /2 captions/.test(w)));
});

test("Automation only sends a story labelled the way 3.4 understood", () => {
  const pr = E.analyze("**Title:** Fix race condition in session cache invalidation\n\n**Description:** This PR fixes a race when two requests refresh the cache at once.\n\n**Testing:** Added a unit test.");
  assert.strictEqual(E.isStory(pr, "labels"), false, "PR description");
  assert.strictEqual(E.isStory(pr, "strict"), false, "PR description, unasked card");
  const guessed = E.analyze("## Instagram Caption for Your Bakery Launch\n\n**Caption:** Fresh out of the oven: the first 50 customers get a free croissant.\n\n**Hashtags:** #bakery #grandopening #smallbusiness");
  assert.strictEqual(E.isStory(guessed, "labels"), false, "headline guessed above a Caption label");
  const story = E.analyze("**Headline:** Dog walks 20 miles home\n\n**Caption:** Cooper was rehomed in March. Three days later he was on their porch.\n\n**Hashtags:** #dogs");
  assert.strictEqual(E.isStory(story, "labels"), true);
  const titled = E.analyze("Title: Dog walks 20 miles home\nBody: Cooper was rehomed in March. He came back.");
  assert.strictEqual(E.isStory(titled, "labels"), true, "Title + Body were 3.4 labels");
  const short = E.analyze("Headline: Pilot lands plane alone\nCaption: Thoughts? 👇");
  assert.strictEqual(E.isStory(short, "labels"), true, "a short labelled caption still counts");
});

test("a labelled critique of your draft is not sent as a story", () => {
  const r = E.analyze("**Headline:** Strong overall. The number creates curiosity, but \"stunned\" is overused. Consider a more specific verb.\n\n**Caption:** The first sentence works well. Cut the second paragraph.\n\n**Hashtags:** Swap #truestory for #rescuedog");
  assert.strictEqual(E.isStory(r, "labels"), false);
});

test("table rows are never labels", () => {
  const r = E.analyze({ blocks: [{ tag: "th", text: "Title" }, { tag: "th", text: "Author" }, { tag: "td", text: "Dune" }, { tag: "td", text: "Frank Herbert" }, { tag: "td", text: "Description: A young noble is thrust into a war." }] });
  assert.strictEqual(E.isStory(r, "labels"), false);
  assert.strictEqual(E.isStory(r, "strict"), false);
});

test("Khmer, Hindi and Thai hashtags stay whole", () => {
  const r = E.analyze("Headline: Girl saves dog from flood\nCaption: Neighbours cheered her on.\nHashtags: #កម្ពុជា #បាត់ដំបង #भारत #ข่าว #dogs");
  assert.deepStrictEqual(r.hashtags, ["#កម្ពុជា", "#បាត់ដំបង", "#भारत", "#ข่าว", "#dogs"]);
  assert.strictEqual(r.caption, "Neighbours cheered her on.");
});

test("digit-only and glued hashtags in a hashtag list are kept", () => {
  const r = E.analyze("Headline: Firefighters honoured\nCaption: The crew was thanked.\nHashtags: #2024 #911 #aviation#pilot#hero");
  assert.deepStrictEqual(r.hashtags, ["#2024", "#911", "#aviation", "#pilot", "#hero"]);
  // In running text a rank is still not a hashtag.
  assert.deepStrictEqual(E.analyze("Headline: The #1 reason people quit\nCaption: It isn't pay.").hashtags, []);
});

test("Spanish and French labels are understood", () => {
  const es = E.analyze("Titular: NIÑA RESCATA A UN PERRO DE LA INUNDACIÓN\nTexto: Una niña de 10 años salvó a un perro atrapado.\nEtiquetas: #perros #noticias");
  assert.strictEqual(es.headline, "NIÑA RESCATA A UN PERRO DE LA INUNDACIÓN");
  assert.ok(es.caption.startsWith("Una niña"));
  const fr = E.analyze("Titre : UNE FILLETTE SAUVE UN CHIEN\nLégende : Elle avait dix ans.");
  assert.strictEqual(fr.headline, "UNE FILLETTE SAUVE UN CHIEN");
  // An unknown "Word:" prefix on an unlabelled headline makes it ask.
  const un = E.analyze("Rubrik: HUND RÄDDAD UR ÖVERSVÄMNING\n\nEn tioårig flicka räddade en hund. Grannarna jublade.");
  assert.ok(un.needsConfirm || !un.headline.startsWith("Rubrik"));
});

test("an unlabelled headline starting 'PHOTO:' or 'TIP:' isn't thrown away", () => {
  const r = E.analyze("PHOTO: MAN FINDS WEDDING RING IN A CARROT 13 YEARS LATER\n\nShe lost it weeding the garden in 2011. He pulled up a carrot last week and there it was.");
  assert.ok(r.headline.includes("MAN FINDS WEDDING RING"), JSON.stringify(r.headline));
});

test("chat-page interface words are never content", () => {
  const r = E.analyze({ blocks: [{ tag: "p", text: "ChatGPT said:" }, { tag: "p", text: "Copy" }, { tag: "p", text: "Good response" }] });
  assert.strictEqual(r.headline, "");
  assert.strictEqual(r.caption, "");
});

test("unasked chat cards: a tweet or LinkedIn draft isn't a story, a news post is", () => {
  const reply = (first) => ({ blocks: [first,
    { tag: "p", text: "We spent six months rebuilding the editor from scratch. It is faster, simpler and works offline now." },
    { tag: "p", text: "Huge thanks to everyone who tested the beta and sent feedback along the way." },
    { tag: "p", text: "#buildinpublic #startup #product" }] });
  const tweet = E.analyze(reply({ tag: "p", bold: true, text: "Just shipped the biggest update we have ever made" }));
  assert.strictEqual(E.isStory(tweet, "strict"), false, "bold sentence-case first line");
  const caps = E.analyze(reply({ tag: "p", bold: true, text: "TEAM REBUILDS EDITOR FROM SCRATCH IN SIX MONTHS" }));
  assert.strictEqual(E.isStory(caps, "strict"), true, "bold CAPS headline");
  const heading = E.analyze(reply({ tag: "h3", text: "Team rebuilds its editor from scratch in six months" }));
  assert.strictEqual(E.isStory(heading, "strict"), true, "a heading");
  assert.strictEqual(E.isStory(tweet, "loose"), true, "still found when you click the toolbar icon");
});
