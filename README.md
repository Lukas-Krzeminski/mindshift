# MIND//SHIFT: Inside the Psychedelic Brain

A ~5-minute browser 3D game for a General Psychology group project on psilocybin-assisted therapy research with people living with cancer. Built with React Three Fiber, Rapier and Vite.

> The game is a fictional, artistic story. Puzzle performance deciding Alex's experience is a game mechanic, not a clinical prediction.

## Run it

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm test           # unit tests (flow, outcome rule, scoring, content checks)
npm run build      # production build into dist/
```

**Offline (presentation backup):** run `npm run build` once, then double-click `start-offline.bat`. It serves `dist/` at http://localhost:4173 with no internet and no Node.js. For a USB backup, copy `dist/`, `start-offline.bat` and `start-offline.ps1` together.

## Presenter controls

| Control | Action |
|---|---|
| `Ctrl+Shift+P` | Open/close the presenter panel (arms presenter mode) |
| `` ` `` | Toggle the panel (once armed) |
| `N` | Skip the current phase (once armed) |

Rehearsal URLs (append to the game URL):

- `?presenter=1`: arm presenter mode from the start
- `?phase=tripChallenging`: start in any phase (`title`, `clinic`, `brainDive`, `tutorial`, `puzzle1`, `puzzle2`, `tripPositive`, `tripChallenging`, `zoomOut`, `integration`, `results`, `references`)
- `?branch=positive` / `?branch=challenging`: force the required Puzzle 3 outcome
- `?quality=high|medium|low`: lock a graphics tier
- `?debug=1`: FPS stats + `window.__mindshift` test hooks

## Layout

```
src/game      flow (phases.ts), outcome rule, scoring, store, presenter actions
src/content   ALL on-screen text + APA references (single place to review wording)
src/scenes    the persistent canvas and every phase's 3D scene
src/ui        title, HUD, results, references, presenter panel
src/quality   GPU tier detection and quality presets
docs/         STATUS (progress/bugs), ASSETS (downloads), CREDITS (licenses)
```
