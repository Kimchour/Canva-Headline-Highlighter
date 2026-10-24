# Headline Highlighter for Canva

Created by Oeng Kimchour.

A panel that sits on top of the Canva editor and turns one pasted post into a finished
design: censored, headline coloured, lined up, photo adjusted, caption in Notes.

## Install

1. Unzip the folder somewhere you won't delete it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder.
4. Open a Canva design. The panel appears on the right.

Chrome will ask to let the extension read Claude and ChatGPT pages - that's for the story
hand-off below.

Source and new versions: https://github.com/Kimchour/Canva-Headline-Highlighter

## Updates

**Settings -> Updates -> Check for updates** asks the GitHub repo for a newer version. It
also checks quietly every 12 hours (switch that off in the same place). When a new version
is ready, a small notice shows under the Quick / Manual tabs, and the version in the footer
gets a dot.

To update:

1. **Download update.** It downloads through Chrome. **Show the file** opens its folder.
2. Unzip it, and copy the files into your Highlighter folder, replacing the old ones.
   **Where's my folder?** opens the Highlighter's page in Chrome - the folder is next to
   "Loaded from".
3. **Reload the Highlighter.** The extension picks up the new files, and your Canva and
   chat tabs refresh. A chat that's still writing a reply is refreshed once it finishes.

Your settings stay, because the extension is never removed. (Removing it in
`chrome://extensions` deletes its settings - don't.) If the files weren't copied into the
right folder, the panel says "Still 3.4.0 - the new files weren't copied".

## Publishing a new version

The repo's main branch holds two files in its root, the same way as PromptSnap and IG Ratio:

- `canva-headline-highlighter.zip` - the extension
- `version.json` - the newest version and what changed. Its `version` must match the
  `version` in the zip's `manifest.json`, and `download` points at the zip:
  `https://raw.githubusercontent.com/Kimchour/Canva-Headline-Highlighter/main/canva-headline-highlighter.zip?v=3.4.0`

Upload both (replace the old ones) and every Highlighter sees the new version within 12
hours, or straight away with Check for updates.

## Automation

Switch **Automation** on at the top of Quick (or in Settings -> Canva). An **AUTO** badge
shows in the header while it's on.

With it on, a story Claude or ChatGPT writes goes into Canva and runs by itself: censor,
colour, fit and line up, Notes. No Send, no Run.

It's careful about three things:

- **It never overwrites a finished post.** Before running, it looks at the page that's open.
  If the page holds a finished post for a *different* story, it waits and says so. Open a
  new page - a fresh template, or a copy of the post it just made - and the story runs
  there by itself. Or press **Run here anyway**, or **Stop waiting**.
- **It waits for the photo.** With **Wait for the photo** on (Settings -> Canva, on by
  default), the run starts only once a new photo is in the design - sent from PromptSnap
  or added yourself. A blank template waits. A copied page still showing the last post's
  photo waits for the new one. A photo that's still uploading waits until it has fully
  loaded and stayed the same for 2 seconds. If the photo is already there, it runs after
  that quick check. **Run now** starts without the photo; **Stop waiting** cancels.
  This only applies with Automation on.
- **It never resends old stories.** Only a story it watched being written is sent on its
  own. Opening an older chat shows the usual "Send to Canva?" card instead.
- **It never loses a story.** A story that arrives while another is running waits its turn.
  The same story delivered twice is ignored - while it runs, or once it's done on that page.

If an automatic click ever takes Canva away from your design, Automation switches itself
off, along with Open the text box for me.

## Stories from Claude or ChatGPT

When a reply on claude.ai or chatgpt.com contains a finished story - a Headline and a
Caption, with or without Hashtags - a card appears in the corner asking whether to send it
to Canva. It only asks once the reply has finished generating, and only once per story.

**Send to Canva** puts it in the Highlighter's paste box on your open Canva design and
switches you to that tab. Then press Run.

Only three things are sent: the headline, the caption and the hashtags. Anything else in
the reply stays behind - the intro before the headline, sources, notes, and follow-up
questions like "Want me to write another version?". Stories in your own messages, or
sitting in the message box, are never picked up. If the reply has several numbered
options, all of them are sent and you pick one in Canva.

If you ask for another story while an earlier card is still waiting, the card switches to
the newest one once it finishes - it says "Newer story" so you know it changed. A card
that's mid-send or showing a result is left alone and checks again when it closes.

If no Canva design is open, the story is saved and appears in the Highlighter when you
open one. Clicked "Not now" by mistake? Click the extension's toolbar icon on the chat page
to bring the card back.

## Quick: one click

Paste your post into the box:

    Headline:
    ...
    Caption:
    ...
    Hashtags:
    #one #two

Underneath, the panel shows what it found: headline length, caption length, and how many
hashtags. If you paste several numbered options, pick one from the row that appears.

Then the run sheet - the five steps, in the order they happen:

1. **Censor words** - headline, caption and hashtags.
2. **Colour the headline** - picked phrases in your colour, the rest white.
3. **Line up the headline** - centred, last line just above your @handle.
4. **Enhance the photo** - Auto-adjust, then sharpness, clarity and vignette.
5. **Fill Notes** - caption and hashtags.

Switch off any step you don't want. Press **Run**, or Ctrl + Enter in the paste box.

While it runs, each step shows a spinner, then fills with your colour when it's done, or a
red cross if it didn't finish. The button says which step it's on and a bar underneath
fills by steps completed. When it's finished you get a one-line result: **Clear for next
post** if everything worked, or **See what happened** if something didn't.

**Show details** opens the full log for any run.

Fill Notes checks Notes holds exactly the caption you formatted, paragraph by paragraph.
If Notes has an older version - even the same words split into different paragraphs - it
replaces it. If Canva ignores the paste, it types the caption in instead. Only an exact
match counts as done, and an exact match already there isn't pasted twice. The Notes panel
is left open while the caption goes in.

**Close side panels first** is on by default. If Elements, Templates, Notes or any other
side panel is open on the left, the tool closes it before each step. It knows four ways to
do that - the panel's Collapse tab, its close button, Canva's Ctrl + / shortcut, and the
left bar icon - and checks the panel really closed after each one. Whichever way worked
is remembered and tried first next time. The shortcut is only ever sent when a panel is
actually open, so it can never open one by mistake.

If a step still fails, the tool clears the screen and tries that step once more before
reporting it. Most failures come from something covering the design, so the second try
usually lands. The run sheet shows "Trying again" while it does.

**Open the text box for me** is on by default, so the tool finds and opens your headline
itself. It works with one of Canva's side panels open (Elements, Templates, Uploads...)
and even when that pushes the design partly under the Highlighter - clicks pass through
the panel and every spot is checked before it's clicked.

## Manual: every tool

Everything the Quick run does, one piece at a time.

- **Headline** - your colours, paste a colour code, pick colours from the design, Auto-pick,
  Censor, Clear, Copy, how much to highlight (Light / Medium / Heavy), click words to add or
  remove them, **Set all highlights**, and **Select next phrase** (Alt + N) to colour one
  phrase at a time yourself.
- **Caption** - Format, Re-tag, Copy, number of paragraphs, what to do with hashtags,
  hashtags to always add, the finished caption with a 5,000 character count, and **Send
  to Notes**.
- **Settings** - every on/off option in one place (below), your photo values, and your
  censor list.

Lining up the headline and the photo tools live in the header's quick tools menu, below.

## Defaults

A fresh install opens on **Manual -> Headline** with Adjust, To back and Line up headline
pinned in the header. Censoring, dash tidying, keeping the rest of the headline white,
stripping # marks, Auto-adjust first, opening the text box for you, closing side panels
first, and sounds are all on.
Lining up after colouring is off. Colour is applied the Auto way, paragraphs keep your own
breaks, hashtags keep your own, and nothing is added to them. Photo values are 25, 15 and 0.

Changing any of these is remembered. Updating the extension keeps your own settings.

## Settings

Headline
- **Fit and line up the headline after colouring** - on by default.
- **Stretch to fill the width** - on by default. Off means the headline is only centred and
  placed, keeping its width. The page width is read from Canva's Position box, and the text
  never grows or shrinks more than 25% in one go.
- **Drop the full stop at the end** - on by default. Removes a closing "." from the
  headline (keeping endings like "U.S.", "..." or a quote), and after colouring clears any
  spaces or empty line left under the headline in the Canva text box. The colours stay.
- **Censor sensitive words** - headline, caption and hashtags.
- **Turn dashes into commas** - hyphens inside words (16-year-old) are left alone.
- **Keep the rest of the headline this colour** - white by default; click the square to
  change it. After every run each letter is checked, and if the rest came out the wrong
  colour it's reset and the phrases are painted again.
- **Line up the headline after colouring** - also applies to Set all highlights.
- **How colour is applied** - Auto (paste, then Canva's colour panel for anything missed),
  Paste only, or Colour panel only. Gradients always use the colour panel.

Caption
- **Strip # marks and bullets** - leftover markdown. Real hashtags are kept.
- **Turn dashes into commas.**

Photo
- **Run Auto-adjust first**, then **Sharpness**, **Clarity** and **Vignette** (25, 15 and 0
  to start). Used by the Adjust tool and the Quick run's Enhance the photo step.

Canva
- **Open the text box for me** - clicks a word in your headline, never Canva's own buttons.
- **Close side panels first** - shuts any open left panel before a task. If a panel can't
  be closed, the task carries on anyway.
- **Sounds** - a short chime when a run finishes.

Your censor list: one per line, like `kill=k*ll`. A built-in list of about fifty
sensitive words is always applied on top of it, including every word form (murderer,
stabbings, raping) and compound hashtags (#murdermystery). Everyday words that contain a
flagged word - skills, establish, deadline, therapist - are left alone. To switch a
built-in word off, add `word=word`.

## Header

**Quick tools.** The three small icons are your pinned tools - Upscale, Adjust and BG
Remover to start with. The grid button next to them opens every tool, in two groups. Star
up to three to pin them.

Position - these act on the layer you have selected:
- **Line up headline** - stretches the headline to the page width (the same margin as
  1,056 on a 1,080 page) and grows the text with it, like dragging a corner; centres it;
  and sits its last line just above your @handle.
- **Undo line-up** - puts the headline back exactly as it was: width, text size and place.
- **Fill with photo** - grows the photo evenly (never stretched, never shrunk) until it
  covers the full page width and at least the top 62% of the page, pins it to the top
  corners, centred, and sends it behind the headline. Every number is checked after.
- **Undo photo fill** - puts the photo back exactly as it was.

  You don't need to select the photo first. The tool clicks where only the photo can
  be - above the headline and the fade - and checks Canva's toolbar shows Replace or
  BG Remover. If something sits over the photo, it picks the photo from Position ->
  Layers instead, checking each layer. Before changing anything it checks the selected layer
  isn't shaped like the fade, so the fade can never be stretched by mistake. A cropped
  photo is fine. It gives
  up after about 14 seconds and says why, rather than waiting forever.
- **To front**, **Forward**, **Backward**, **To back** - Canva's own Arrange buttons.
  **To back** with nothing selected takes the photo; the others ask you to select a layer.
  If a layer is already as far as it can go, it says so.

Canva Edit image - these select the photo, open Edit image and run the tool:
- **Adjust** runs Auto-adjust and then your photo values from Settings.
- **Upscale** also presses Canva's own Upscale button.
- **BG Remover**, **Magic Eraser**, **Magic Edit**, **Magic Layers**, **BG Generator** and
  **Image to Video** open ready for you. Tools that need your input are finished in
  Canva's panel.

While a pinned tool runs, its icon turns into a small spinner, then a tick when it's done
or a red cross if it didn't finish, and then back to the icon.

If another tool's panel is still open, it steps back to the list first. Pages with no
photo are skipped.

**Messages** - "Done", "Photo adjusted" and other short messages appear in a small card
just outside the panel - below it, or above or beside it if there's no room - and clicks
pass straight through, so they never cover a button.

**A narrow panel** - the header always keeps the menu, clear, Compact and fold buttons.
Pinned tools step aside when there isn't room (they're still in the menu), then the AUTO
badge shrinks to a dot.

**Panel controls** - the arrow button switches to **Compact**: one line saying what the
run is doing ("Step 3 of 5: Fit and line up the headline..."), a progress bar and Run.
It keeps the design in view while a run or Automation works; click it again for the full
panel. Drag the header to move the panel. Drag any side edge, the bottom edge, or the
grip in the bottom-right corner to resize it - the edge you drag always stays on screen.
Double-click the grip to go back to the normal size. The minus button folds the panel to
its header.

- **↺** clears the paste box, headline, caption and results. A bar asks you to confirm;
  it waits as long as you like. Escape or Cancel closes it.
- **⤢** makes the panel tall; click again for normal size.
- **–** collapses the panel.

Drag the header to move the panel. Drag a bottom corner to resize it; double-click a
corner to reset. Size and position are remembered and kept on screen on any monitor. On a
very narrow panel the pinned icons hide; the grid menu still has every tool.

## How it stays safe in Canva

Before any click on the design, the tool checks what's under that spot. Canva's own
buttons, fields, menus, popups and the floating bar above a selection are never clicked.
Links are blocked outright, and if a click ever changed the page address, automatic
clicking switches itself off. Nothing is left selected by mistake: if a click picks up the
wrong thing, the tool lets go of it.

Lining up the headline moves in small, checked steps. It learns Canva's scale from how
far the text actually moves, undoes any move that makes things worse, and always finishes
on the best position it found.

## Limits

Canva has no public way for extensions to change text formatting, so the tool works
through Canva's own interface. A Canva redesign can break a step. When that happens the
run sheet shows which step failed and Show details says why.

Caption formatting cleans, splits, censors and tags the words you give it. It doesn't
rewrite the story.
