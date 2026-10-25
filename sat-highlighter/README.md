# Headline Highlighter for Canva

Created by Oeng Kimchour.

A panel that sits on top of the Canva editor and turns one post into a finished design:
it finds the headline, caption and hashtags, censors them, colours the headline, lines it
up, adjusts the photo and fills Notes. Tell it what you want in your own words, or press
one button.

## Install

1. Unzip the folder somewhere you won't delete it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder.
4. Open a Canva design. The panel appears on the right.

Chrome will ask to let the extension read Claude and ChatGPT pages - that's for the story
hand-off below.

Source and new versions: https://github.com/Kimchour/Canva-Headline-Highlighter

## What's new in 4.0

- **A new panel.** Studio, Tools and Settings; a glass panel with smooth, short motion
  that switches off when your system asks for reduced motion.
- **Smart Detect.** Finds the headline, caption and hashtags in any post - labelled or
  not - and shows how sure it is about each one.
- **Ask.** Type what you want: "get everything", "copy the caption and hashtags",
  "highlight the title", "fix the selection". It works out the steps, does them, checks
  them and says exactly what happened.
- **Highlight Headline.** Finds the headline on the design with a confidence score, rings
  it, and colours it. When it can't tell which text is the headline, it asks - and if
  you press Cancel, nothing on the design changes.
- **Check for Updates** has its own sheet with both versions, the release notes and the
  update steps.

Your settings from 3.x carry over. Quick is now **Studio**; Manual's Headline and Caption
tabs are now **Tools**; Settings is its own tab.

## Studio

From the top:

1. **Ask** - type an instruction and press Enter (or **Alt + K** from anywhere). As you
   type, the panel shows what it understood: "-> Copy caption + hashtags". The chips below
   are ready-made instructions.
2. **Source** - paste a post here, labelled or not. Leave it empty to read the open design
   instead. The **Automation** switch sits in its corner.
3. **Five actions**
   - **Detect** (Smart Detect) - finds the headline, caption and hashtags in the source,
     or on the open design when the source is empty.
   - **Extract** (Extract All) - takes all three into the Highlighter, censored and ready:
     the headline with its phrases picked, the caption formatted for Notes.
   - **Highlight** (Highlight Headline) - finds the headline on the design and colours it.
   - **Copy all** - headline, caption and hashtags, separated by blank lines. Hashtags
     already written inside the caption aren't repeated underneath.
   - **Retry** (Reanalyze) - looks again a different way. See below.
4. **Detected** - the three fields, each editable, with a confidence score, a count and a
   copy button. Under the headline: why it was chosen, and **Other candidates** to swap in
   with one click. Hashtags are chips - type to add one, click x to remove.
5. **Run on design** - the run sheet (below). Run uses the fields exactly as you left them.
6. **Show details** - the full log of the last run.

Detection runs as you paste or type, in well under a millisecond, and never changes your
words: capitals, punctuation, line breaks and emoji stay as written. Markdown marks
(`**bold**`, `## heading`) and chat around the post ("Sure! Here's your post:", "Want
another version?") are left out.

### How sure it is

Each field shows a percentage, green from 80%, amber from 60%, red below. The overall bar
weighs the three.

If it isn't sure which line is the headline, a bar asks **"Is this the headline?"** with
**Yes, use it** and **Show other picks**. Nothing is changed in Canva until you answer -
Run and Highlight wait, and Automation holds the story. Typing your own headline counts as
a yes.

It never invents text. A post with no headline gets an empty headline field ("No headline
found"), not its first sentence.

### Retry / Reanalyze

- On the source: reads it again with a different method than last time, and skips the
  headline you rejected. It says what changed - or that nothing better exists, in which
  case the first reading stays.
- On the design (after Highlight or "where is the headline?"): rings the next most likely
  text and asks.

## Ask

Say it however you like. Some of what it understands:

| You say | It does |
|---|---|
| grab the headline | Extracts the headline |
| get everything | Extracts headline, caption and hashtags |
| copy the caption and hashtags | Copies just those two |
| find the main story | Headline and caption, nothing else |
| highlight the title | Finds the headline on the design and colours it |
| where is the headline? | Rings it on the design |
| what's the headline on the design? | Reads it from the page |
| fix the selection / that's not the headline | Reanalyzes |
| use option 2 / the second one | Switches option, or headline candidate |
| set the headline to "..." | Uses your exact words (put short ones in quotes) |
| change the headline to the second one | Picks that candidate, not those words |
| make it heavier / lighter | More or fewer highlighted phrases |
| run it / send it to Canva | The full run |
| fill notes / line up the headline / enhance the photo | That one step |
| check for updates | Asks GitHub |
| clear the hashtags / remove the caption | Empties just that field under Detected |
| undo the line up / undo the photo fill | Undoes that one step |
| go to settings / open the tools | Opens that tab |
| start over | Clears everything, after you say yes |

Several steps in one go work too: "extract everything then highlight the headline and
copy the caption". Follow-ups use what came before: after "grab the headline", "copy it"
copies the headline; "now the caption" does the same for the caption; "and the hashtags"
adds them. "Try again" after something failed runs it again; "yes" answers a question it
asked; "no" or "not that one" looks again.

It listens for "don't" and "not": "don't run it yet, just copy the caption" only copies,
"copy everything except the hashtags" leaves them out, and "highlight it but don't line
it up" skips the line-up. "Run it but leave the notes alone" (or "without the notes",
"except the notes") runs without filling Notes. "Forget it", "stop", "leave it" or "never
mind" do nothing at all, and answer **Go ahead?** with a no. Words like "again" or "no"
only mean "look again" when they're all you wrote, so "copy the caption again" just
copies.

If part of what you wrote didn't make sense to it and the plan would change the design,
Notes or your fields, it shows the plan and asks **Go ahead?** first.

Each step reports what actually happened - "Copied the caption and hashtags (840
characters)", "No hashtags found in the source", "Coloured 3 phrases - checked letter by
letter. The line-up didn't finish: ..." - and only says done when it checked. If it
doesn't understand you, it says so and offers instructions it does.

## How detection works

`engine.js` reads a post in stages:

1. **Collect** - lines, and what each looks like: heading, bold, list item, label, only
   hashtags, chat, notes. On Claude and ChatGPT it reads the reply's own structure
   (headings, bold paragraphs) rather than flat text.
2. **Structure** - labelled sections (Headline, Title, Hook, Caption, Description, Body,
   Hashtags, Tags, in any case, with emoji, bold, as headings, inline or on their own line,
   "Headline (68 chars):", "Headline 2:"), numbered options, paragraphs. Sources, notes,
   ratings, image prompts and character counts are set aside.
3. **Classify** - how much each block reads like a headline (length, one sentence, no
   closing full stop, capitals or title case, set as a heading, the story following it,
   news words) or like a caption. No single trait decides: not the first line, not the
   longest, not bold, not capitals. Reactions ("This is so wild.") and chat score low.
4. **Score** - a confidence for each field, from labels, structure, and how far the best
   headline is ahead of the next best.
5. **Validate** - removes a headline repeated at the top of the caption, a caption that's
   the headline again, hashtags on the end of the headline; flags an unusually long
   headline; notes what's missing.
6. **Recover** - four strategies in turn: **Labels**, **Structure** (a heading or bold
   line, then the story), **Layout** (a short first line, then the story) and **Meaning**
   (every block weighed). It keeps the best reading and stops early once one is clearly
   good. The method used is shown under Detected.
7. **Output** - separate, editable fields; the hashtags in the order they appear,
   wherever they were (start, middle or end), each once.

## The headline on the design

To colour, line up or read the headline, the panel has to know which text box on the page
is the headline. It ranks every text box on screen by:

- the words - matching what you pasted, even when censored (k\*lled matches killed)
- holding your last post's headline (a copied page)
- sitting just above your @handle
- coloured words already in it
- text size, compared with the rest of the page - one clue among several
- the layout you confirmed before
- and against: @handles, page counters, links, very long text, and boxes that hold other
  text boxes (the page or a group)

When it's sure enough it goes ahead, and a soft ring flashes on the headline's own lines.
When it isn't, the design shows a dashed ring around its best guess and a card asks **"Is
this the headline?"** - **Yes, this one**, **Not this ->** for the next guess, **Cancel**
(or Enter, the right arrow, Esc). The card sits wherever it hides the least. Your answer
is remembered for that page, and the layout is learned, so the next page with the same
template doesn't ask.

How sure it must be before acting is in Settings -> Detection: **Careful** (75%),
**Balanced** (60%) or **Relaxed** (45%). **Ask me when unsure** can be switched off.

After colouring, a green ring traces the finished headline.

## Updates

The **updates button** in the header (a dot when a new version is waiting), the version in
the footer, Settings -> Updates and the Ask box ("check for updates") all open the
**Updates** sheet:

- a status: **Checking for updates...**, **You're up to date**, **Update available** or
  **Couldn't check** (with why: no internet, GitHub busy, version.json unreadable, nothing
  uploaded yet)
- the **installed** and **latest** versions side by side
- **What's new** for every version since yours, then **Earlier versions**
- **Check again**, and **Check automatically** (every 12 hours, quietly)

A newer version also puts **NEW** on the toolbar icon. Checking never interrupts what
you're doing: a background check doesn't redraw the panel while you type or while a run
works.

To update:

1. **Download update.** It downloads through Chrome. **Show the file** opens its folder.
2. Unzip it, and copy the files into your Highlighter folder, replacing the old ones.
   **Where's my folder?** opens the Highlighter's page in Chrome - the folder is next to
   "Loaded from".
3. **Reload the Highlighter.** The extension picks up the new files, and your Canva and
   chat tabs refresh. A chat that's still writing a reply is refreshed once it finishes.

Your settings stay, because the extension is never removed. (Removing it in
`chrome://extensions` deletes its settings - don't.) If the files weren't copied into the
right folder, the panel says "Still 4.0.0 - the new files weren't copied".

## Publishing a new version

The repo's main branch holds the extension's source in `sat-highlighter/`, and two files
in its root that the update check reads:

- `canva-headline-highlighter.zip` - the extension
- `version.json` - the newest version and what changed. Its `version` must match the
  `version` in `manifest.json`, and `download` points at the zip.

`node scripts/build.js` makes the zip from `sat-highlighter/` and stops if the two versions
disagree. Commit the zip first, then point `download` at that commit
(`https://raw.githubusercontent.com/<owner>/<repo>/<commit>/canva-headline-highlighter.zip`)
and commit `version.json`. A link to a commit never changes, so the version file and the
zip can't be out of step while GitHub's cache catches up. Every Highlighter sees the new
version within 12 hours, or a few minutes after publishing with Check for updates.

## Automation

Switch **Automation** on in Studio's Source card (or Settings -> Canva). An **AUTO** badge
shows in the header while it's on.

With it on, a story Claude or ChatGPT writes goes into Canva and runs by itself: censor,
colour, fit and line up, Notes. No Send, no Run.

It's careful about these things:

- **It never overwrites a finished post.** Before running, it looks at the page that's open.
  If the page holds a finished post for a *different* story, it waits and says so. Open a
  new page - a fresh template, or a copy of the post it just made - and the story runs
  there by itself. Or press **Run here anyway**, or **Stop waiting**.
- **It never guesses the headline box.** If it isn't sure which text on the page is the
  headline, it waits with **Which text is the headline?** - press **Show me**, point it
  out once, and the story runs. It remembers the layout for the next page.
- **It never runs an unclear story.** If the story's own headline is unclear, it waits
  until you confirm it under Detected.
- **It waits for the photo.** With **Wait for the photo** on (Settings -> Canva, on by
  default), the run starts only once a new photo is in the design - sent from PromptSnap
  or added yourself. A blank template waits. A picture the page already had when you opened
  it - a template's sample photo, a background, the next page's photo - doesn't count,
  and neither does the same picture redrawn at another size. A copied page still showing the
  last post's photo waits for the new one. A story waiting for its photo keeps waiting
  through an update of the Highlighter. A photo that's still uploading waits until it has fully
  loaded and stayed the same for 2 seconds. **Run now** starts without the photo; **Stop
  waiting** cancels.
- **It never resends old stories.** Only a labelled story it watched being written is sent
  on its own. Opening an older chat, or a story without labels, shows the usual "Send to
  Canva?" card instead.
- **It never loses a story.** A story that arrives while another is running waits its turn.
  The same story delivered twice is ignored - while it runs, or once it's done on that page.

If an automatic click ever takes Canva away from your design, Automation switches itself
off, along with Open the text box for me.

## Stories from Claude or ChatGPT

When a reply on claude.ai or chatgpt.com holds a finished story, a card appears in the
corner asking whether to send it to Canva. It reads the reply's structure: a story with
Headline and Caption labels is found, and so is one with a heading (or a first line in
CAPS or Title Case), the story and its hashtags but no labels - the card then says "Found
without labels - check the fields in Canva before you run". Code, tables, and drafts like
a tweet or a LinkedIn post (a sentence-case first line plus hashtags) don't bring up a
card on their own. The card shows the headline, the three counts and how sure it is.
It only asks once the reply has finished generating, and only once per story.

**Send to Canva** puts it in the Highlighter's source box on your open Canva design and
switches you to that tab. Then press Run.

Only three things are sent: the headline, the caption and the hashtags. Anything else in
the reply stays behind - the intro, sources, notes, and follow-up questions like "Want me
to write another version?". Your own messages, and anything in the message box, are never
picked up. If the reply has several numbered options, all of them are sent and you pick
one in Canva.

Tabs that were open when the Highlighter updated get the new version straight away, so
there's nothing to refresh. If a tab can't reach the Highlighter any more (it was switched
off, say), the card or the panel says so and offers **Refresh tab**.

If you ask for another story while an earlier card is still waiting, the card switches to
the newest one once it finishes - it says "Newer story" so you know it changed.

If no Canva design is open, the story is saved and appears in the Highlighter when you
open one. Clicked "Not now" by mistake, or want it to look harder? Click the extension's
toolbar icon on the chat page: it brings the card back, and if there wasn't one, looks at
the latest replies again, labels or not. A reply that's still being written isn't
offered until it's finished.

## Run on design

The run sheet - the steps, in the order they happen:

1. **Censor words** - headline, caption and hashtags.
2. **Colour the headline** - picked phrases in your colour, the rest white.
3. **Fit and line up the headline** - full width, centred, last line just above your @handle.
4. **Fill the page with the photo** - full width from the top corners, behind the headline.
5. **Enhance the photo** - Auto-adjust, then sharpness, clarity and vignette.
6. **Fill Notes** - caption and hashtags.

Switch off any step you don't want; the card folds away with the arrow. Press **Run**, or
Ctrl + Enter in the source box.

While it runs, each step shows a spinner, then fills with your colour when it's done, or a
red cross if it didn't finish. The button says which step it's on and a bar fills by steps
completed. When it's finished you get a one-line result: **Clear for next post** if
everything worked, or **See what happened** if something didn't.

Fill Notes checks Notes holds exactly the caption you formatted, paragraph by paragraph.
If Notes has an older version - even the same words split into different paragraphs - it
replaces it. If Canva ignores the paste, it types the caption in instead. Only an exact
match counts as done, and an exact match already there isn't pasted twice.

**Close side panels first** is on by default. If Elements, Templates, Notes or any other
side panel is open on the left, the tool closes it before each step - with the panel's
Collapse tab, its close button, Canva's Ctrl + / shortcut, or the left bar icon - and
checks the panel really closed. Whichever way worked is tried first next time. If a step
still fails, the tool clears the screen and tries that step once more before reporting
it. The run sheet shows "Trying again" while it does.

**Open the text box for me** is on by default, so the tool finds and opens your headline
itself (see "The headline on the design"). It works with one of Canva's side panels open
and even when that pushes the design partly under the Highlighter - clicks pass through
the panel and every spot is checked before it's clicked.

## Tools

Everything a run does, one piece at a time.

- **Headline** - your colours, paste a colour code, pick colours from the design, Auto-pick,
  Censor, Clear, Copy, how much to highlight (Light / Medium / Heavy), click words to add or
  remove them, **Set all highlights**, and **Select next phrase** (Alt + N) to colour one
  phrase at a time yourself.
- **Caption** - Format, Re-tag, Copy, number of paragraphs, what to do with hashtags,
  hashtags to always add, the finished caption with a 5,000 character count, and **Send
  to Notes**.

Pasting a whole labelled post into either box splits it into headline and caption.

Which phrases get coloured: quotes always whole, a number together with what it counts
("15 YEARS", "$44 MILLION"), the twist after "but" or "after", names and organisations,
never across a clause join, and never ending on a word that leaves the phrase hanging
("BROKE INTO").

## Settings

Updates - status at a glance; opens the Updates sheet.

Detection
- **Ask me when unsure** - confirm a weak headline match before anything changes in Canva.
- **How sure before acting** - Careful, Balanced or Relaxed.
- **Read the open design** - with an empty source, Detect reads the page and Notes.
- **Learned headline layout** - how many times you've confirmed one; **Forget** resets it.

Headline
- **Censor sensitive words** - headline, caption and hashtags.
- **Drop the full stop at the end** - removes a closing "." (keeping "U.S.", "..." or a
  quote) and clears any spaces or empty line left under the headline in Canva.
- **Turn dashes into commas** - hyphens inside words (16-year-old) are left alone.
- **Keep the rest of the headline this colour** - white by default; click the square to
  change it. After every run each letter is checked, and if the rest came out the wrong
  colour it's reset and the phrases are painted again.
- **Fit and line up the headline after colouring** - also applies to Set all highlights.
- **Stretch to fill the width** - off means the headline is only centred and placed. The
  page width is read from Canva's Position box, and the text never grows or shrinks more
  than 25% in one go.
- **How colour is applied** - Auto (paste, then Canva's colour panel for anything missed),
  Paste only, or Colour panel only. Gradients always use the colour panel.

Caption
- **Strip # marks and bullets** - leftover markdown. Real hashtags are kept.
- **Turn dashes into commas.**

Photo
- **Run Auto-adjust first**, then **Sharpness**, **Clarity** and **Vignette** (25, 15 and 0
  to start). Used by the Adjust tool and the Enhance the photo step.

Canva
- **Open the text box for me** - clicks a word in your headline, never Canva's own buttons.
- **Automation**, **Wait for the photo** - see Automation.
- **Close side panels first** - shuts any open left panel before a task.
- **Sounds** - a short chime when a run finishes.

Your censor list: one per line, like `kill=k*ll`. A built-in list of about fifty
sensitive words is always applied on top of it, including every word form (murderer,
stabbings, raping) and compound hashtags (#murdermystery). Everyday words that contain a
flagged word - skills, establish, deadline, therapist - are left alone. To switch a
built-in word off, add `word=word`.

## Header

**Pinned tools.** The small icons are your pinned tools - Adjust, To back and Line up
headline to start with. The grid button opens every tool, in two groups. Star up to three
to pin them.

Position - these act on the layer you have selected:
- **Line up headline** - stretches the headline to the page width (the same margin as
  1,056 on a 1,080 page), grows the text with it, centres it, and sits its last line just
  above your @handle.
- **Undo line-up** - puts the headline back exactly as it was.
- **Fill with photo** - grows the photo evenly (never stretched, never shrunk) until it
  covers the full page width and at least the top 62% of the page, pins it to the top
  corners, centred, and sends it behind the headline. You don't need to select the photo
  first; it never stretches the fade by mistake, and gives up after about 14 seconds with
  a reason rather than waiting forever.
- **Undo photo fill** - puts the photo back exactly as it was.
- **To front**, **Forward**, **Backward**, **To back** - Canva's own Arrange buttons.
  **To back** with nothing selected takes the photo.

Canva Edit image - these select the photo, open Edit image and run the tool: **Adjust**
(Auto-adjust, then your photo values), **Upscale** (also presses Canva's Upscale), **BG
Remover**, **Magic Eraser**, **Magic Edit**, **Magic Layers**, **BG Generator** and
**Image to Video**.

While a pinned tool runs, its icon turns into a spinner, then a tick or a red cross, then
back to the icon.

Then: the **updates** button, **clear** (asks first: clears the source, the detected
fields and the results), **Compact** (one status line, a progress bar and Run, to keep the
design in view) and **fold**.

**Messages** appear in a small card just outside the panel - below it, or above or beside
it if there's no room - and clicks pass straight through.

Drag the header to move the panel. Drag any side edge, the bottom edge, or the grip in the
bottom-right corner to resize it. Double-click the grip to go back to the normal size.
Size and position are remembered and kept on screen on any monitor.

## Keyboard

- **Alt + K** - the Ask box, from anywhere
- **Enter** - do what you typed; **Up / Down** - your earlier instructions; **Esc** - clear
- **Ctrl + Enter** in the source box - Run
- **Alt + N** - select the next phrase
- When asked "Is this the headline?": **Enter** yes, **->** next, **Esc** cancel

## How it stays safe in Canva

Before any click on the design, the tool checks what's under that spot. Canva's own
buttons, fields, menus, popups and the floating bar above a selection are never clicked.
Links are blocked outright, and if a click ever changed the page address, automatic
clicking switches itself off. Nothing is left selected by mistake: if a click picks up the
wrong thing, the tool lets go of it. The rings and the question card on the design are its
own layer; clicks pass through the rings.

Lining up the headline moves in small, checked steps. It learns Canva's scale from how
far the text actually moves, undoes any move that makes things worse, and always finishes
on the best position it found.

## Limits

Canva has no public way for extensions to change text formatting, so the tool works
through Canva's own interface. A Canva redesign can break a step. When that happens the
run sheet shows which step failed and Show details says why.

Detection reads text; it doesn't call an AI service, so it works offline and nothing you
paste leaves your computer. It recognises posts the way they're usually written - see
`tests/BENCHMARK.md` in the repo for what it's measured on. A layout it hasn't seen can
still fool it, which is what the confidence score and the "Is this the headline?" question
are for.

Caption formatting cleans, splits, censors and tags the words you give it. It doesn't
rewrite the story.
