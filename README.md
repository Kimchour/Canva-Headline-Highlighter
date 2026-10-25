# Headline Highlighter for Canva

Created by Oeng Kimchour. A Chrome extension that finds the headline, caption and hashtags
in a post, colours the headline in Canva, lines it up, adjusts the photo and fills Notes —
and takes stories from Claude or ChatGPT straight into Canva.

**To install or update, use `canva-headline-highlighter.zip`** — the user guide is in
[`sat-highlighter/README.md`](sat-highlighter/README.md).

## What's new in 4.0

- **A new panel**: Studio, Tools and Settings in a glass panel, with an Updates sheet that
  shows both versions and the release notes.
- **Smart Detect** finds the headline, caption and hashtags in any post, labelled or not
  (Headline, Title, Caption, Description, and the same labels in Spanish, Portuguese,
  French, Italian, German and Indonesian), and shows how sure it is about each one.
- **Edit before you run**: the detected fields can be changed, and other headline
  candidates are one click away. Run uses exactly what you see.
- **It asks when it isn't sure** which line, or which text box on the design, is the
  headline — and Cancel means nothing on the design changes.
- **Ask box** (Alt + K): say what you want — "copy the caption and hashtags", "highlight
  the title", "don't run it yet, just copy the caption". It checks with you before anything
  it only half understood changes the design or Notes.
- **Highlight Headline** rings the headline on the design and colours it, checked letter by
  letter. **Copy All** copies all three neatly separated. With an empty source, **Detect**
  reads the open design's headline and the caption in Notes.
- **Claude and ChatGPT** replies are read by their structure, so a story with a heading and
  hashtags is found without labels. Only a story with Headline and Caption labels is ever
  sent on its own.
- Hashtags in Khmer, Hindi and Thai keep their vowel signs, and digit-only or run-together
  hashtags (#2024, #aviation#pilot) are kept.

## What's in the repo

| Path | What it is |
|---|---|
| `canva-headline-highlighter.zip` | The extension, as people download it. The update check fetches this. |
| `version.json` | The newest version and its release notes. The update check reads this. |
| `sat-highlighter/` | The extension's source — the same files as the zip. |
| `tests/` | Unit tests, a browser smoke test, the accuracy benchmark and their fixtures. |
| `scripts/build.js` | Builds the zip from `sat-highlighter/`. |

### The extension

| File | Runs on | Does |
|---|---|---|
| `engine.js` | Canva, Claude, ChatGPT | Recognition: headline / caption / hashtags with confidence, phrase picking, ranking the text boxes on a design. Plain functions. |
| `intent.js` | Canva | Turns instructions ("copy the caption and hashtags") into step plans. Plain functions. |
| `content.js` | Canva | The panel, the Ask executor, and everything that drives Canva's own interface. |
| `chat.js` | Claude, ChatGPT | Watches replies for a finished story and offers to send it. |
| `background.js`, `updates.js` | Service worker | Story hand-off between tabs; the update check, download and reload. |
| `panel.css` | Canva | The panel's styles. |

New capabilities go in as a strategy in `engine.js` (see `STRATEGIES`), a verb in
`intent.js` (`VERBS`) with a case in `execStep` in `content.js`, or a step in `STAGES`.

## Checking a change

```
npm test            # unit tests: engine corpus, intents, update check, headline ranking, phrases
npm run test:ui     # the real panel and chat card in Chromium, on mock Canva and ChatGPT pages,
                    # plus the regression checks from the 4.0 pre-release review
npm run bench       # accuracy, false positives, confidence, speed -> tests/BENCHMARK.md
npm run build       # canva-headline-highlighter.zip from sat-highlighter/
```

`npm test`, `bench` and `build` need only Node 18+. `test:ui` needs Playwright
(`npm install`), and saves screenshots of every state to `tests/ui/shots/`.

The mock pages in `tests/fixtures/` stand in for Canva and ChatGPT where the extension
depends on them: one click on a text box shows a text toolbar, a double-click makes it
editable, a paste replaces its text. They can't prove a step works on the live Canva
editor — a Canva redesign can still break one — so try a release on a real design before
publishing it.

## Publishing a version

1. Bump `version` in `sat-highlighter/manifest.json` and `package.json`.
2. In `version.json`, set `version`, `date` and `added` / `fixed` (3.x shows at most six
   new and four fixed items, so keep to that); move the previous entry into `history`.
   Set `download` back to `main`'s zip for now,
   `https://raw.githubusercontent.com/<owner>/<repo>/main/canva-headline-highlighter.zip?v=<version>`:
   a link still pointing at the last release's commit stops the build.
3. `npm test && npm run build` — the build stops if `version.json` and the manifest
   disagree.
4. Commit everything, including the new zip. Then set `download` in `version.json` to that
   commit's zip, `https://raw.githubusercontent.com/<owner>/<repo>/<commit>/canva-headline-highlighter.zip`,
   run `npm run build` again — it stops unless that commit holds this exact zip for this
   version (the zip comes out byte for byte the same) — and commit `version.json` on its
   own. Push both commits to `main` together.

   A link to a commit never changes. GitHub caches `main`'s files for up to five minutes and
   ignores `?v=`, so a link to `main` could hand out the old zip next to the new
   `version.json` for those minutes.
5. Every installed Highlighter sees the new version within 12 hours, or a few minutes after
   publishing with Check for updates.
