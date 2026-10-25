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
  const sv = E.analyze("Rubrik: HUND RÄDDAD UR ÖVERSVÄMNING\n\nEn tioårig flicka räddade en hund. Grannarna jublade.");
  assert.strictEqual(sv.headline, "HUND RÄDDAD UR ÖVERSVÄMNING");
  // Khmer labels, vowel signs and all.
  const km = E.analyze("ចំណងជើង: ក្មេងស្រីម្នាក់ជួយសង្គ្រោះឆ្កែពីទឹកជំនន់\nអត្ថបទ: កាលពីម្សិលមិញ ក្មេងស្រីម្នាក់បានជួយសង្គ្រោះឆ្កែមួយក្បាល។\n#កម្ពុជា #ព័ត៌មាន");
  assert.strictEqual(km.headline, "ក្មេងស្រីម្នាក់ជួយសង្គ្រោះឆ្កែពីទឹកជំនន់");
  assert.ok(km.caption.startsWith("កាលពីម្សិលមិញ"), km.caption);
  // A pair of "Word:" labels it doesn't know makes it ask.
  const un = E.analyze("სათაური: ძაღლი გადაარჩინეს წყალდიდობას\nაღწერა: ათი წლის გოგონამ ძაღლი გადაარჩინა. მეზობლები ტაშს უკრავდნენ.");
  assert.ok(un.needsConfirm || !un.headline.startsWith("სათაური"));
  // One "Word:" opening a Khmer headline is a kicker, not a label.
  const kick = E.analyze("ព័ត៌មាន: ក្មេងស្រីម្នាក់ជួយសង្គ្រោះឆ្កែពីទឹកជំនន់\n\nកាលពីម្សិលមិញ ក្មេងស្រីម្នាក់បានជួយសង្គ្រោះឆ្កែមួយក្បាល។ អ្នកជិតខាងបានអបអរ។\n\n#កម្ពុជា #ព័ត៌មាន");
  assert.strictEqual(kick.needsConfirm, false);
});

test("news kickers and attributions aren't mistaken for labels", () => {
  for (const h of ["BREAKING: TSA ends shoe removal rule at all US airports", "Police: Driver was going 100 mph when he hit the school bus", "WATCH: Firefighters pull kitten from storm drain"]) {
    const r = E.analyze(h + "\n\nThe change takes effect on Monday, officials said. Travelers welcomed the news.\n\n#travel #news");
    assert.strictEqual(r.headline, h);
    assert.strictEqual(r.needsConfirm, false, h);
    assert.strictEqual(E.analyze(h).needsConfirm, false, h + " pasted alone");
  }
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
  const reply = (first, voice) => ({ blocks: [first,
    { tag: "p", text: voice === "we" ? "We spent six months rebuilding the editor from scratch. It is faster, simpler and works offline now."
      : "The small team spent six months rebuilding the editor from scratch. It is faster, simpler and works offline now." },
    { tag: "p", text: "Testers who tried the beta say they would not go back." },
    { tag: "p", text: "#software #startup #product" }] });
  const tweet = E.analyze(reply({ tag: "p", bold: true, text: "Just shipped the biggest update in years" }, "we"));
  assert.strictEqual(E.isStory(tweet, "strict"), false, "bold sentence-case first line");
  const launch = E.analyze(reply({ tag: "p", bold: true, text: "Big News: Taskly 2.0 Is Finally Live!" }, "we"));
  assert.strictEqual(E.isStory(launch, "strict"), false, "a launch post in Title Case");
  const personal = E.analyze(reply({ tag: "h3", text: "Some personal news" }, "we"));
  assert.strictEqual(E.isStory(personal, "strict"), false, "a LinkedIn draft under a heading");
  const caps = E.analyze(reply({ tag: "p", bold: true, text: "TEAM REBUILDS EDITOR FROM SCRATCH IN SIX MONTHS" }));
  assert.strictEqual(E.isStory(caps, "strict"), true, "bold CAPS headline");
  const heading = E.analyze(reply({ tag: "h3", text: "Team rebuilds its editor from scratch in six months" }));
  assert.strictEqual(E.isStory(heading, "strict"), true, "a heading");
  assert.strictEqual(E.isStory(tweet, "loose"), true, "still found when you click the toolbar icon");
});

test("a critique isn't a story, a three-sentence headline is", () => {
  const post = (h, c) => E.analyze("**Headline:** " + h + "\n\n**Caption:** " + (c || "Joe Turner, 52, found the cash in a parking lot and handed it to police the same day.") + "\n\n**Hashtags:** #honesty #kindness");
  for (const h of ["Strong overall, but \"stunned\" is overused. Consider a more specific verb.", "8/10 — strong hook, but a little long.", "Works, but I'd tighten it: \"Lost dog finds his way home\"."]) {
    assert.strictEqual(E.isStory(post(h), "labels"), false, h);
  }
  assert.strictEqual(E.isStory(post("HE WAS HOMELESS. HE FOUND $10,000. HE GAVE IT ALL BACK."), "labels"), true);
  assert.strictEqual(E.isStory(post("She lost her job. Then her home. Then a stranger knocked on her door."), "labels"), true);
});

// Found in the second review round.

test("the assistant's notes and offers after a post are never sent with it", () => {
  const base = "Headline: Dog walks 20 miles to find the family that gave him away\n\nCaption: Cooper was rehomed in March. Three days later he turned up on their porch.";
  for (const tail of ["Do you want me to add a source line?", "Would you like me to create an image to go with this post?",
    "Want me to make it more emotional?", "Sources: CNN, ABC News, NPR", "说明：我把标题写得更短，并加了表情符号。", "설명: 제목을 더 짧게 만들었습니다."]) {
    const r = E.analyze(base + "\n\n" + tail);
    assert.strictEqual(r.caption, "Cooper was rehomed in March. Three days later he turned up on their porch.", tail);
  }
});

test("everyday words in a story aren't a critique", () => {
  const post = (h, c) => E.analyze("**Headline:** " + h + "\n\n**Caption:** " + c + "\n\n**Hashtags:** #life #kindness");
  for (const [h, c] of [["Life is too short to wait for the perfect moment", "Maria, 71, finally took the trip she had saved for since 1975."],
    ["Try cutting sugar for 30 days, doctors say", "A new study followed 2,000 adults for a month. Most slept better."],
    ["A strong opening for the city's new library", "Thousands queued on Saturday. The first book borrowed was a 1952 atlas."],
    ["Teen's science fair project works well enough to win a patent", "Her filter removes 99% of microplastics. It cost $12 to build."]]) {
    assert.strictEqual(E.isStory(post(h, c), "labels"), true, h);
  }
});

test("a lead-in before a one-line headline isn't part of it", () => {
  for (const say of ["Here's a headline: Dog walks 20 miles home to the family that gave him away", "Here's your headline: Dog walks 20 miles home to the family that gave him away"]) {
    const r = E.analyze(say);
    assert.strictEqual(r.headline, "Dog walks 20 miles home to the family that gave him away", say);
  }
});

test("a code block's language label is never the headline", () => {
  const r = E.analyze({ blocks: [{ tag: "p", text: "Here it is:" }, { tag: "pre", text: "plaintext\nHeadline: FAMILY STUNNED AS LOST DOG RETURNS HOME\n\nCaption: When Max slipped out of the yard in 2023, the Parkers searched for months.\n\nHashtags: #dogs #reunited" }] });
  assert.strictEqual(r.headline, "FAMILY STUNNED AS LOST DOG RETURNS HOME");
});

test("a headline and caption label pair counts, with a qualifier, emoji or another language", () => {
  for (const t of ["Main Headline: Dog walks 20 miles home\nShort Caption: Cooper was rehomed in March.", "Titular: Perro camina 30 km a casa\nTexto: Cooper volvió con su familia.",
    "📰 Headline – Dog walks 20 miles home\n✍️ Caption – Cooper was rehomed in March.", "ចំណងជើង: ក្មេងស្រីជួយសង្គ្រោះឆ្កែ\nអត្ថបទ: កាលពីម្សិលមិញ"]) {
    assert.ok(E.hasLabels(t), t);
  }
  assert.ok(!E.hasLabels("Here is a nice story about a dog that walked home."));
});

// Found in the third review round.

test("the assistant's notes after a post never reach Notes", () => {
  const H = "**Headline:** Firefighters rescue kitten from storm drain after 3-hour effort\n\n**Caption:**\nCrews in Dayton worked through heavy rain to reach her. Puddles. 🐾";
  for (const note of ["**Note:** I couldn't verify the shelter's name, so double-check it before posting.", "**Why:** Animal rescues get high engagement and lots of shares on Facebook.",
    "**Image:** A firefighter in yellow gear holding a wet kitten.", "**Notes:** Details were confirmed by two outlets."]) {
    for (const t of [H + "\n\n#rescue #kitten\n\n" + note, H + "\n\n" + note]) {
      const r = E.analyze(t);
      assert.strictEqual(r.caption, "Crews in Dayton worked through heavy rain to reach her. Puddles. 🐾", note);
    }
  }
  // A note in the middle of the caption, with more of the post after it, stays.
  const mid = E.analyze("Headline: City pools open free\n\nCaption: The pools open Saturday at 9am.\n\nNote: kids under 12 need an adult.\n\nThe slides are back too.\n\nHashtags: #summer");
  assert.ok(/kids under 12/.test(mid.caption) && /slides are back/.test(mid.caption), mid.caption);
});

test("closing offers go, the post's own calls to action stay", () => {
  const base = "Headline: Grandma, 92, graduates from college\n\nCaption: She left school in 1954 to care for her siblings. This spring she walked across the stage. 💙";
  for (const offer of ["Would you like a few alternative headlines too?", "Would you like a few hashtags to go with it?", "Do you want a version in Khmer too?",
    "Hope this helps! 🙌", "Should I make it sound more urgent?", "Happy posting! 🚀", "Want me to add a question at the end to get more comments?",
    "I can tailor the caption for Instagram or LinkedIn if you'd like."]) {
    assert.ok(!E.analyze(base + "\n\n" + offer).caption.includes(offer.slice(0, 12)), offer);
  }
  for (const cta of ["I can't believe the changes she made in just ten months 😍", "Want me to share the full recipe? Comment \"BREAD\" below 👇",
    "Should I do a part 2?", "Need more options for holiday treats? Check out our full list on the website.",
    "I can only imagine the headlines if this had gone wrong.", "Happy to say the source of the leak has since been fixed."]) {
    assert.ok(E.analyze(base + "\n\n" + cta + "\n\nHashtags: #goodnews").caption.endsWith(cta), cta);
  }
});

test("a post, then labelled alternatives: the post, without the options' header", () => {
  const r = E.analyze("**Headline:** Dog walks 20 miles home\n\n**Caption:** Cooper was rehomed in March. Three days later he was on their porch. 🐶\n\nWant a different angle? Here are two more:\n\n**Option 1**\n**Headline:** Rehomed dog finds his way back\n**Caption:** Cooper's new owners lived 20 miles away.\n\n**Option 2**\n**Headline:** Loyal dog refuses to stay rehomed\n**Caption:** Three days, 20 miles, one very determined dog.");
  assert.strictEqual(r.headline, "Dog walks 20 miles home");
  assert.strictEqual(r.caption, "Cooper was rehomed in March. Three days later he was on their porch. 🐶");
  const improved = E.analyze("Here's your original:\n\n**Headline:** Pilot lands plane\n**Caption:** The co-pilot fainted.\n\nHere are two improved versions:\n\n**Option 1**\n**Headline:** Pilot lands plane alone after co-pilot faints\n**Caption:** Forty minutes out of Denver the co-pilot slumped over.\n#aviation\n\n**Option 2**\n**Headline:** Captain lands 737 solo\n**Caption:** Passengers applauded.\n#faa");
  assert.strictEqual(improved.options && improved.options.length, 2);
  assert.strictEqual(improved.headline, "Pilot lands plane alone after co-pilot faints");
});

test("poll choices stay in the caption", () => {
  const r = E.analyze("**WOULD YOU TAKE $1 MILLION TODAY OR A PENNY THAT DOUBLES EVERY DAY FOR 30 DAYS?**\n\nA math teacher in Ohio asked her class this question last week. Most of her students got it wrong.\n\nOption A $1 million\nOption B the penny\n\nComment A or B below 👇\n\n#money #math");
  assert.ok(r.caption.includes("Option A $1 million\nOption B the penny"), r.caption);
});

test("a review of your draft isn't a story; advice inside a story is", () => {
  const mk = (h, c) => E.analyze("**Headline:** " + h + "\n\n**Caption:** " + c + "\n\n**Hashtags:** #food #tips");
  for (const [h, c] of [["Clear and punchy. I'd keep it as is.", "Works well, but the ending feels rushed. Consider adding a call to action."],
    ["Good, but it's a bit long. Try shortening it.", "Solid. The second paragraph could be tighter."], ["Clear and emotional — 8/10.", "Engaging, 7/10. Could use a stronger ending."],
    ["Needs work — it's vague. Try something like: Dog walks 20 miles to find his family.", "Too long. Cut it to two sentences."]]) {
    assert.strictEqual(E.isStory(mk(h, c), "labels"), false, h);
  }
  for (const [h, c] of [["This 5-minute fudge recipe is taking over TikTok", "All you need is chocolate, condensed milk and butter. Try cutting it into small squares before you freeze it."],
    ["Lottery winner, 72, still works at the same diner", "'I'd change nothing,' Mary Jones said after winning $2 million."], ["10/10 would adopt again: shelter dog becomes town mascot", "Biscuit was adopted in March and now greets every visitor."]]) {
    assert.strictEqual(E.isStory(mk(h, c), "labels"), true, h);
  }
});

test("a headline's own kicker stays; chat in front of it goes", () => {
  assert.strictEqual(E.analyze("Headline: TRY THIS: THE 4-7-8 BREATHING TRICK THAT HELPS YOU SLEEP\n\nCaption: Sleep doctors say it works in a minute.\n\nHashtags: #sleep").headline, "TRY THIS: THE 4-7-8 BREATHING TRICK THAT HELPS YOU SLEEP");
  assert.strictEqual(E.analyze("My Pick: The Best Budget Phone Of 2025 Is Just $199").headline, "My Pick: The Best Budget Phone Of 2025 Is Just $199");
  assert.strictEqual(E.analyze("Here's your headline: Dog walks 20 miles home to the family that gave him away").headline, "Dog walks 20 miles home to the family that gave him away");
  assert.strictEqual(E.analyze("Try this: Dog walks 20 miles home to the family that gave him away").headline, "Dog walks 20 miles home to the family that gave him away");
});

test("the assistant's first line isn't the headline; a line pasted alone is", () => {
  const post = "\n\nPILOT LANDS PLANE ALONE AFTER CO-PILOT FAINTS\n\nForty minutes out of Denver, the co-pilot slumped over. The captain landed alone.\n\n#aviation #pilot";
  for (const first of ["**Format:** Facebook Image Post", "**Tone:** Urgent And Dramatic", "**Note:** Based On Reports From Denver Airport", "**Source:** Associated Press Report"]) {
    assert.strictEqual(E.analyze(first + post).headline, "PILOT LANDS PLANE ALONE AFTER CO-PILOT FAINTS", first);
  }
  assert.strictEqual(E.analyze("Why: Firefighters Say Storm Drains Are Deadly").headline, "Why: Firefighters Say Storm Drains Are Deadly");
});

test("a title and description in Korean or Chinese: the description is the caption", () => {
  const ko = E.analyze("제목: 서울에 첫눈이 내렸다\n설명: 오늘 아침 서울 전역에 첫눈이 내렸습니다. 시민들은 출근길에 사진을 찍었습니다.\n해시태그: #서울 #첫눈");
  assert.ok(ko.caption.startsWith("오늘 아침"), ko.caption);
  const zh = E.analyze("标题：北京迎来今年第一场雪\n\n说明：今天早上，北京城区普降小雪。市民纷纷出门拍照留念。\n\n话题：#北京 #下雪");
  assert.ok(zh.caption.startsWith("今天早上"), zh.caption);
  // ... but the assistant explaining its writing is still left out.
  const note = E.analyze("标题：北京迎来今年第一场雪\n文案：今天早上，北京城区普降小雪。\n说明：我把标题写得更简洁，方便放在图片上。");
  assert.ok(!note.caption.includes("我把"), note.caption);
});

test("an unknown label word in another script asks first; a news kicker doesn't", () => {
  assert.ok(E.analyze("Τίτλος: Σκύλος περπάτησε 30 χιλιόμετρα για να γυρίσει σπίτι").needsConfirm);
  assert.ok(!E.analyze("**ព័ត៌មានក្តៅ: បុរសម្នាក់ជួយសង្គ្រោះឆ្កែពីទឹកជំនន់**\n\nកាលពីម្សិលមិញ បុរសម្នាក់បានជួយសង្គ្រោះឆ្កែមួយក្បាល។ អ្នកជិតខាងបានអបអរ។\n\n#កម្ពុជា").needsConfirm);
});

test("Python and SQL in a list stay; a code block's language label goes", () => {
  assert.ok(E.analyze("Headline: We are hiring a data analyst\nCaption: You will work with:\nPython\nSQL\nApply by Friday.\nHashtags: #jobs").caption.includes("Python\nSQL"));
  assert.strictEqual(E.analyze("plaintext\nHeadline: FAMILY STUNNED AS LOST DOG RETURNS HOME\n\nCaption: When Max slipped out, the Parkers searched for months.").headline, "FAMILY STUNNED AS LOST DOG RETURNS HOME");
});

test("an interstate headline isn't first person", () => {
  const r = E.analyze("I-95 SHUT DOWN FOR HOURS AFTER 30-CAR PILEUP\n\nThe crash happened just after 6 a.m. on Tuesday, state police said. Drivers were stuck for hours.\n\n#traffic #news");
  assert.strictEqual(E.isStory(r, "strict"), true);
});

// Found in the review of 4.0.1.

test("an offer to you stays out even when it mentions comments or sharing", () => {
  const base = "Headline: Dog walks 20 miles home\n\nCaption: Cooper was rehomed in March. Three days later he was on their porch.";
  for (const offer of ["Want me to add a question at the end to get more comments?", "Should I include a call to action that asks people to share this?",
    "I can also add a line encouraging followers to tag a friend.", "Let me know if you want a version with a question at the end to boost comments!",
    "I can tailor the caption for Instagram or LinkedIn if you'd like.", "I can whip up a punchier headline if you want."]) {
    assert.strictEqual(E.analyze(base + "\n\n" + offer).caption, "Cooper was rehomed in March. Three days later he was on their porch.", offer);
  }
  // ... while the post's own call to action, after the offer-like opening, stays.
  assert.ok(E.analyze(base + "\n\nWant me to share his full route? Comment ROUTE below 👇\n\n#dogs").caption.includes("Comment ROUTE"));
});

test("a post's own note stays; the assistant's goes by what it says", () => {
  const own = E.analyze("**Headline:** Main Street bridge closes for repairs next week\n\n**Caption:** The bridge will be closed Monday to Friday while crews repair the deck.\n\nNote: Detours will be posted along Elm Street and 5th Avenue.\n\n#dayton #roadwork");
  assert.ok(own.caption.includes("Detours will be posted"), own.caption);
  const hours = E.analyze("**Headline:** Shelter waives adoption fees this weekend\n\n**Caption:** More than 80 dogs and cats need homes.\n\nNote: The shelter is open Saturday and Sunday from 9 a.m. to 5 p.m.\n\n**Hashtags:** #adoptdontshop");
  assert.ok(hours.caption.includes("open Saturday"), hours.caption);
  const theirs = E.analyze("**Headline:** Shelter waives adoption fees\n\n**Caption:** More than 80 dogs and cats need homes.\n\nNote: I couldn't verify the shelter's hours, so double-check them before posting.");
  assert.ok(!theirs.caption.includes("verify"), theirs.caption);
});

test("chat lead-ins go in front of any headline; a CAPS NOTE: headline stays", () => {
  for (const say of ["Shorter: DOG WALKS 20 MILES HOME TO THE FAMILY THAT GAVE HIM AWAY", "Punchier: Dog Walks 20 Miles Home To The Family That Gave Him Away",
    "Suggestion: Dog Walks 20 Miles Home To The Family That Gave Him Away", "My pick: “Dog Walks 20 Miles Home To The Family That Gave Him Away”"]) {
    assert.ok(/^(?:DOG|Dog) Walks|^DOG WALKS/.test(E.analyze(say).headline), say);
  }
  const r = E.analyze("NOTE: ALL DAYTON SCHOOLS CLOSED TOMORROW\n\nICE STORM WARNING IN EFFECT UNTIL NOON\n\nThe district made the call at 8pm after crews reported black ice. Buses will not run.\n\n#dayton #snowday");
  assert.ok(/NOTE: ALL DAYTON SCHOOLS CLOSED TOMORROW/.test(r.headline + "\n" + r.caption), r.headline);
  assert.strictEqual(E.analyze("Nice! This grandma, 92, just finished her degree\n\nShe left school in 1954 to care for her siblings. This spring she walked across the stage.\n\n#goodnews").headline, "Nice! This grandma, 92, just finished her degree");
});

test("说明 after an unlabelled story is the assistant's note, not the caption", () => {
  const r = E.analyze("标题：北京迎来今年第一场雪\n\n今天早上，北京城区普降小雪。市民纷纷出门拍照留念。\n\n#北京 #下雪\n\n说明：根据新华社报道整理，发布前请核实。");
  assert.ok(r.caption.startsWith("今天早上") && !r.caption.includes("核实"), r.caption);
});

test("a review with the critique in its caption isn't a story; news with everyday words is", () => {
  const mk = (h, c) => E.analyze("**Headline:** " + h + "\n\n**Caption:** " + c + "\n\n**Hashtags:** #news");
  assert.strictEqual(E.isStory(mk("Strong — the number grabs attention and the twist is clear.", "Good overall, but consider cutting the second sentence; it repeats the headline."), "labels"), false);
  for (const [h, c] of [["ER wait times are too long, patients say", "One mother waited nine hours. The hospital says it will aim for under four hours by spring."],
    ["This Winter Could Be Colder Than Usual, Forecasters Warn", "Aim for a full tank of gas and a stocked pantry before December."],
    ["Mayor vows to put the kids first in new budget", "The plan adds 60 teachers. She said a similar plan works well in Denver."]]) {
    assert.strictEqual(E.isStory(mk(h, c), "labels"), true, h);
  }
});

test("headline options listed after a post go; a poll's choices stay whole", () => {
  const alts = E.analyze("PILOT LANDS PLANE ALONE AFTER CO-PILOT FAINTS\n\nForty minutes out of Denver, the co-pilot slumped over. The captain landed the 737 alone.\n\nShorter headline ideas:\nOption 1: Pilot lands 737 alone after co-pilot faints\nOption 2: Pilot Lands Alone\n\n#aviation");
  assert.strictEqual(alts.caption, "Forty minutes out of Denver, the co-pilot slumped over. The captain landed the 737 alone.");
  const poll = E.analyze("WOULD YOU TAKE $1 MILLION TODAY OR A PENNY THAT DOUBLES EVERY DAY FOR 30 DAYS?\n\nA math teacher in Ohio asked her class this question last week. Most got it wrong.\n\nOption A: take the $1 million today\nOption B: a penny that doubles every day\n\nComment A or B below 👇\n\n#money");
  assert.ok(poll.caption.includes("Option A: take the $1 million today\nOption B: a penny that doubles every day"), poll.caption);
  const newer = E.analyze("Here's your post:\n\n**Headline:** Dog walks 20 miles home\n\n**Caption:** Cooper was rehomed in March. Three days later he was on their porch.\n\n**Hashtags:** #dogs\n\nIf you want something punchier, here are two new options:\n\n**Option 1**\n**Headline:** Rehomed dog finds his way back\n**Caption:** Cooper's owners lived 20 miles away.\n\n**Option 2**\n**Headline:** Loyal dog refuses to stay rehomed\n**Caption:** Three days, 20 miles.");
  assert.strictEqual(newer.headline, "Dog walks 20 miles home");
});
