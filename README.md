# Headline Highlighter for Canva

Created by Oeng Kimchour. A Chrome extension that finds the headline, caption and hashtags
in a post, colours the headline in Canva, lines it up, adjusts the photo and fills Notes —
and takes stories from Claude or ChatGPT straight into Canva.

**To install or update, use `canva-headline-highlighter.zip`** — the user guide is in
[`sat-highlighter/README.md`](sat-highlighter/README.md).

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
npm run test:ui     # the real panel and chat card in Chromium, on mock Canva and ChatGPT pages
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
2. In `version.json`, set `version`, `date`, `download` (ending `?v=<version>`), and
   `added` / `fixed`; move the previous entry into `history`.
3. `npm test && npm run build` — the build stops if `version.json` and the manifest
   disagree.
4. Commit `canva-headline-highlighter.zip` and `version.json` to `main`. Every installed
   Highlighter sees the new version within 12 hours, or straight away with Check for
   updates.
