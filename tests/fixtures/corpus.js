/* Labelled examples for the recognition engine: what a person would call the
   headline, caption and hashtags in each one. Used by the unit tests and the
   accuracy benchmark.

   expect.headline / caption: exact text ("" = must find none)
   expect.captionStarts / captionEnds / captionHas / captionLacks: partial checks
   expect.hashtags: exact list, in order
   expect.confirm: true = must ask before using the headline, false = must not
   expect.story: whether the chat page may offer it unasked (strict mode)
   group: which part of the brief's test list it covers */

module.exports = [
  /* ---------- clearly labelled ---------- */
  {
    name: "plain labels on their own lines", group: "labelled",
    text: "Headline:\nTSA AGENT FIRED AFTER VIRAL VIDEO\n\nCaption:\nA TSA agent at Miami airport was fired after a passenger filmed him. The video went viral.\n\nHashtags:\n#tsa #travel #viral",
    expect: { headline: "TSA AGENT FIRED AFTER VIRAL VIDEO", caption: "A TSA agent at Miami airport was fired after a passenger filmed him. The video went viral.", hashtags: ["#tsa", "#travel", "#viral"], confirm: false, story: true }
  },
  {
    name: "inline labels", group: "labelled",
    text: "Headline: Woman returns $50,000 found in thrift store couch\nCaption: She paid $40 for the couch. Inside the cushions was an envelope of cash, and she drove it straight back.\nHashtags: #kindness #truestory",
    expect: { headline: "Woman returns $50,000 found in thrift store couch", captionStarts: "She paid $40", hashtags: ["#kindness", "#truestory"], confirm: false, story: true }
  },
  {
    name: "markdown bold labels with chat around them", group: "labelled",
    text: "Sure! Here's your post:\n\n**Headline:** Pilot lands plane after co-pilot faints mid-flight\n\n**Caption:** Forty minutes out of Denver the co-pilot slumped over. The captain landed alone while a nurse on board helped.\n\n#aviation #pilot\n\nWant me to write another version?",
    expect: { headline: "Pilot lands plane after co-pilot faints mid-flight", caption: "Forty minutes out of Denver the co-pilot slumped over. The captain landed alone while a nurse on board helped.", hashtags: ["#aviation", "#pilot"], captionLacks: "Want me", story: true }
  },
  {
    name: "Title and Description labels", group: "labelled",
    text: "Title: Teen builds prosthetic arm for his little brother\nDescription: Using a 3D printer from his school library, 16-year-old Leo spent four months designing an arm. His brother can now hold a bike handle.",
    expect: { headline: "Teen builds prosthetic arm for his little brother", captionStarts: "Using a 3D printer", hashtags: [], confirm: false }
  },
  {
    name: "upper-case labels, headings and emoji", group: "labelled",
    text: "## 📰 HEADLINE\nGRANDMA, 92, GRADUATES FROM COLLEGE 70 YEARS AFTER DROPPING OUT 🎓\n\n## ✍️ CAPTION\nShe left school in 1954 to care for her family. This spring she walked across the stage. 💙\n\n## #️⃣ HASHTAGS\n#neverquit #inspiration #graduation",
    expect: { headline: "GRANDMA, 92, GRADUATES FROM COLLEGE 70 YEARS AFTER DROPPING OUT 🎓", caption: "She left school in 1954 to care for her family. This spring she walked across the stage. 💙", hashtags: ["#neverquit", "#inspiration", "#graduation"] }
  },
  {
    name: "label with a note in brackets", group: "labelled",
    text: "Headline (68 chars): Firefighter adopts the kitten he saved from a burning house\nCaption (long): The kitten was hiding under a bed. Two weeks later he came back for her.\nHashtags: #firefighter #adoptdontshop",
    expect: { headline: "Firefighter adopts the kitten he saved from a burning house", captionStarts: "The kitten was hiding", hashtags: ["#firefighter", "#adoptdontshop"] }
  },
  {
    name: "sources and notes left out", group: "labelled",
    text: "Headline: Library forgives 40 years of fines after man returns book\nCaption: He found it in his late mother's attic.\nThe librarian framed the receipt.\nSources:\nhttps://example.com/story\nNote: details were checked with the library.",
    expect: { headline: "Library forgives 40 years of fines after man returns book", captionStarts: "He found it", captionLacks: "example.com", hashtags: [] }
  },
  {
    name: "hashtag words without # under a Hashtags label", group: "labelled",
    text: "Headline: Bakery leaves free bread out for anyone who needs it\nCaption: Every night at closing, the shelf by the door fills up again.\nHashtags: kindness, bakery, community",
    expect: { headline: "Bakery leaves free bread out for anyone who needs it", hashtags: ["#kindness", "#bakery", "#community"] }
  },

  /* ---------- order ---------- */
  {
    name: "caption labelled before the headline", group: "order",
    text: "Caption: The airline later apologised. Passengers were given vouchers and a free night at a hotel.\nHeadline: Flight diverted after brawl over armrest",
    expect: { headline: "Flight diverted after brawl over armrest", captionStarts: "The airline later apologised", confirm: false }
  },
  {
    name: "unlabelled headline after its story", group: "order",
    text: "A retired teacher walked into his library last week with a book he borrowed in 1974. He insisted on paying the full fine. Staff framed the receipt.\n\nMAN RETURNS LIBRARY BOOK 50 YEARS LATE",
    expect: { headline: "MAN RETURNS LIBRARY BOOK 50 YEARS LATE", captionStarts: "A retired teacher" }
  },
  {
    name: "hashtags first, then the story", group: "order",
    text: "#breaking #news\nTeen saves neighbour from house fire\nThe 15-year-old heard screams and ran inside. She pulled her neighbour out just in time.",
    expect: { headline: "Teen saves neighbour from house fire", captionStarts: "The 15-year-old", hashtags: ["#breaking", "#news"] }
  },

  /* ---------- unlabelled ---------- */
  {
    name: "capitals headline, story, hashtags", group: "unlabelled",
    text: "MAN RETURNS LIBRARY BOOK 50 YEARS LATE, PAYS $1,200 FINE\n\nA retired teacher walked into his local library last week with a book he borrowed in 1974. He insisted on paying the full fine. Staff were stunned.\n\n#library #heartwarming #truestory",
    expect: { headline: "MAN RETURNS LIBRARY BOOK 50 YEARS LATE, PAYS $1,200 FINE", captionStarts: "A retired teacher", hashtags: ["#library", "#heartwarming", "#truestory"], confirm: false, story: true }
  },
  {
    name: "sentence-case headline on the first line of the story", group: "unlabelled",
    text: "Dog walks 20 miles to find the family that gave him away\nCooper was rehomed in March. Three days later he turned up on their porch, paws bloodied, tail wagging. They kept him.",
    expect: { headline: "Dog walks 20 miles to find the family that gave him away", captionStarts: "Cooper was rehomed" }
  },
  {
    name: "markdown heading headline", group: "unlabelled",
    text: "Here's a draft:\n\n# Nurse finishes shift, then delivers a baby in the parking lot\n\nShe was walking to her car at 7am when she heard a woman calling for help. Ten minutes later a baby girl was born.\n\nLet me know if you want it punchier!",
    expect: { headline: "Nurse finishes shift, then delivers a baby in the parking lot", captionStarts: "She was walking", captionLacks: "Let me know" }
  },
  {
    name: "bold headline line", group: "unlabelled",
    text: "**Stranger pays for family's groceries, leaves note that goes viral**\n\nThe note said: \"Someone did this for me once.\" The family has since paid it forward three times.",
    expect: { headline: "Stranger pays for family's groceries, leaves note that goes viral", captionStarts: "The note said" }
  },
  {
    name: "the whole post as one block (headline line, story, tags)", group: "unlabelled",
    text: "Bus driver stops route to help lost toddler\nThe driver spotted the boy alone at a crossing in the rain. He waited with him until police found his mum.\n#busdriver #hero",
    expect: { headline: "Bus driver stops route to help lost toddler", captionStarts: "The driver spotted", hashtags: ["#busdriver", "#hero"] }
  },

  /* ---------- multi-line headline, long caption ---------- */
  {
    name: "headline over two lines", group: "multiline",
    text: "SHE WAS TOLD SHE'D NEVER WALK AGAIN,\nNOW SHE'S RUNNING MARATHONS\n\nShe was 16 when a car crash left her paralysed. Doctors said she would never walk. Ten years later she finished her fifth marathon.\n\n#inspiration #running",
    expect: { headline: "SHE WAS TOLD SHE'D NEVER WALK AGAIN,\nNOW SHE'S RUNNING MARATHONS", captionStarts: "She was 16", hashtags: ["#inspiration", "#running"], confirm: false }
  },
  {
    name: "labelled headline over three lines", group: "multiline",
    text: "Headline:\nHE MISSED HIS FLIGHT\nBY TWO MINUTES.\nTHAT SAVED HIS LIFE\n\nCaption:\nThe plane he missed never made it to its destination. He still keeps the boarding pass in his wallet.",
    expect: { headline: "HE MISSED HIS FLIGHT\nBY TWO MINUTES.\nTHAT SAVED HIS LIFE", captionStarts: "The plane he missed" }
  },
  {
    name: "long caption over five paragraphs", group: "multiline",
    text: "Headline: Teacher spends summer driving to every student's home\nCaption:\nWhen school closed in June, Mrs. Alvarez made a list of all 28 students in her class.\n\nShe spent July driving across three counties with a box of books in the back seat.\n\nAt each house she left a book chosen for that child, with a handwritten note.\n\nSome families invited her in for dinner. One boy read his book aloud to her on the porch.\n\nIn September, every one of them came back having read it.\n\nHashtags: #teacher #reading",
    expect: { headline: "Teacher spends summer driving to every student's home", captionStarts: "When school closed", captionEnds: "having read it.", hashtags: ["#teacher", "#reading"] }
  },

  /* ---------- hashtags anywhere ---------- */
  {
    name: "hashtags inside a sentence and at the end", group: "hashtags",
    text: "Headline: Farmer gives away his whole harvest\nCaption: After a #drought ruined his neighbours' crops, he shared everything he grew. #kindness #farmlife",
    expect: { headline: "Farmer gives away his whole harvest", caption: "After a #drought ruined his neighbours' crops, he shared everything he grew.", hashtags: ["#drought", "#kindness", "#farmlife"] }
  },
  {
    name: "a rank and a link are not hashtags", group: "hashtags",
    text: "Headline: The #1 reason people quit their jobs, according to a new survey\nCaption: It isn't pay. Read the survey at example.com/report#results for the full list.",
    expect: { headline: "The #1 reason people quit their jobs, according to a new survey", hashtags: [] }
  },
  {
    name: "duplicate hashtags kept once", group: "hashtags",
    text: "Headline: Kid opens lemonade stand to pay for his dog's surgery\nCaption: He raised $3,000 in a weekend. #dogs #kindness\n\nHashtags: #Dogs #kindness #lemonade",
    expect: { headline: "Kid opens lemonade stand to pay for his dog's surgery", hashtags: ["#dogs", "#kindness", "#lemonade"] }
  },

  /* ---------- several competing headlines ---------- */
  {
    name: "numbered options", group: "competing",
    text: "OPTION 1 (Rated 9/10)\nHeadline: Dog found after three years sleeps in his old bed\nCaption: The family cried. He went straight to his bed.\nHashtags: #dog\n\nOPTION 2 (Rated 8/10)\nHeadline: Three years later, the dog came home\nCaption: Nobody expected the call from the shelter.\nHashtags: #dogs",
    expect: { headline: "Dog found after three years sleeps in his old bed", options: 2, hashtags: ["#dog"] }
  },
  {
    name: "numbered options, second one chosen", group: "competing", opts: { optionIndex: 1 },
    text: "OPTION 1\nHeadline: Dog found after three years sleeps in his old bed\nCaption: The family cried.\n\nOPTION 2\nHeadline: Three years later, the dog came home\nCaption: Nobody expected the call from the shelter.",
    expect: { headline: "Three years later, the dog came home", caption: "Nobody expected the call from the shelter.", options: 2 }
  },
  {
    name: "several labelled headlines", group: "competing",
    text: "Headline 1: Mechanic fixes single mum's car for free\nHeadline 2: \"Pay me back by being kind,\" mechanic tells struggling mum\nHeadline 3: Garage owner waives $900 bill\nCaption: She came in expecting bad news. He handed her the keys and a note.",
    expect: { headline: "Mechanic fixes single mum's car for free", captionStarts: "She came in", candidatesAtLeast: 3 }
  },
  {
    name: "alternative headlines listed", group: "competing",
    text: "Headline: Boy, 9, saves sister from icy pond\nAlternative headlines:\n- Brave 9-year-old pulls sister from frozen pond\n- \"I didn't think, I just ran\"\nCaption: He crawled out on his stomach to reach her.",
    expect: { headline: "Boy, 9, saves sister from icy pond", captionStarts: "He crawled", candidatesAtLeast: 2 }
  },

  /* ---------- missing parts ---------- */
  {
    name: "headline only", group: "missing",
    text: "Pilot diverts flight after passenger refuses to sit down",
    expect: { headline: "Pilot diverts flight after passenger refuses to sit down", caption: "", hashtags: [], confirm: false }
  },
  {
    name: "caption only, no headline invented", group: "missing",
    text: "A retired teacher walked into his local library last week with a book he borrowed in 1974. He insisted on paying the full fine.\n\nStaff were stunned and framed the receipt.",
    expect: { headline: "", captionStarts: "A retired teacher" }
  },
  {
    name: "headline and hashtags, no caption", group: "missing",
    text: "Headline: Couple marries in the hospital where they met 60 years ago\nHashtags: #love #wedding",
    expect: { headline: "Couple marries in the hospital where they met 60 years ago", caption: "", hashtags: ["#love", "#wedding"] }
  },
  {
    name: "hashtags only", group: "missing",
    text: "#travel #flights #airport",
    expect: { headline: "", caption: "", hashtags: ["#travel", "#flights", "#airport"] }
  },

  /* ---------- ambiguous: must not guess ---------- */
  {
    name: "reactions before the story are not headlines", group: "ambiguous",
    text: "This is so wild.\n\nSome people never learn.\n\nA man returned a library book 50 years late and paid the fine himself. Staff framed the receipt. He said he just wanted to do the right thing.",
    expect: { headline: "", captionHas: "library book" }
  },
  {
    name: "two equal one-line candidates", group: "ambiguous",
    text: "Firefighter rescues kitten from storm drain\n\nKitten rescued from storm drain by firefighter",
    expect: { confirm: true }
  },

  /* ---------- formatting oddities ---------- */
  {
    name: "inconsistent spacing and Windows line breaks", group: "format",
    text: "  Headline:    Man   finds   wedding ring   in   a carrot  \r\n\r\n\r\n Caption:   His wife lost it in the garden 13 years ago.   \r\n  #garden   #love ",
    expect: { headlineHas: "finds   wedding ring", captionStarts: "His wife lost it", hashtags: ["#garden", "#love"] }
  },
  {
    name: "emoji and special characters kept as written", group: "format",
    text: "Headline: “I’ve waited 30 years” – Woman meets her birth mother 💞\nCaption: They hugged for ten minutes at gate B12. Neither could speak. ✈️\nHashtags: #reunion #family",
    expect: { headline: "“I’ve waited 30 years” – Woman meets her birth mother 💞", caption: "They hugged for ten minutes at gate B12. Neither could speak. ✈️", hashtags: ["#reunion", "#family"] }
  },
  {
    name: "censored words are not italics", group: "format",
    text: "Headline: Man who k*lled his neighbour's dog sentenced to 2 years\nCaption: The court heard he st*bbed the dog after an argument about noise.",
    expect: { headline: "Man who k*lled his neighbour's dog sentenced to 2 years", captionStarts: "The court heard he st*bbed" }
  },

  /* ---------- DOM structure from a chat page ---------- */
  {
    name: "reply blocks: heading, paragraphs, tags", group: "dom",
    blocks: [
      { tag: "p", text: "Here's a post for you:" },
      { tag: "h3", text: "Family stunned as lost dog returns home after three years" },
      { tag: "p", text: "When Max slipped out of the yard in 2023, the Parkers searched for months. Last week a shelter two states away called." },
      { tag: "p", text: "He walked straight to his old bed and fell asleep." },
      { tag: "p", text: "#dogs #reunited #truestory" },
      { tag: "p", text: "Want me to make it shorter?" }
    ],
    expect: { headline: "Family stunned as lost dog returns home after three years", captionStarts: "When Max", captionEnds: "fell asleep.", hashtags: ["#dogs", "#reunited", "#truestory"], story: true }
  },
  {
    name: "reply blocks: bold label paragraphs", group: "dom",
    blocks: [
      { tag: "p", text: "Headline:\nBaker wakes at 3am to bake for the homeless", bold: false },
      { tag: "p", text: "Caption:\nFor six years, every loaf left at closing goes to the shelter down the road." },
      { tag: "p", text: "Hashtags: #bakery #kindness" }
    ],
    expect: { headline: "Baker wakes at 3am to bake for the homeless", captionStarts: "For six years", hashtags: ["#bakery", "#kindness"], story: true }
  },

  /* ---------- not a story at all (false positives) ---------- */
  {
    name: "coding answer", group: "nonstory",
    text: "Here's how to reverse a list in Python:\n\nYou can use slicing. It returns a new list. This is the simplest way.\n\nLet me know if you need more help!",
    expect: { headline: "", story: false }
  },
  {
    name: "recipe", group: "nonstory",
    text: "Easy banana bread\n\nIngredients:\n- 3 ripe bananas\n- 1/3 cup melted butter\n- 1 cup sugar\n\nMash the bananas. Mix in the butter. Bake for 60 minutes at 350°F.",
    expect: { story: false }
  },
  {
    name: "chat small talk", group: "nonstory",
    text: "Sure, happy to help! What would you like the post to be about?",
    expect: { headline: "", caption: "", story: false }
  },
  {
    name: "list of tips", group: "nonstory",
    text: "1. Drink more water.\n2. Sleep eight hours.\n3. Walk every day.\n\nWould you like more tips?",
    expect: { story: false }
  },
  {
    name: "interface text around a reply", group: "nonstory",
    blocks: [
      { tag: "p", text: "ChatGPT said:" },
      { tag: "p", text: "Copy" },
      { tag: "p", text: "Thought for 4 seconds" },
      { tag: "p", text: "Good response" }
    ],
    expect: { headline: "", caption: "", story: false }
  }
];
