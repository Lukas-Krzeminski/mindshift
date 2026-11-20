# Project status

Plan: MVP Mon Nov 23 · feature freeze Wed Nov 25 · presentation Fri–Sun Nov 27–29, 2026.

## Done
### D0 (Mon Nov 16): foundation
- Vite 8 + React 19 + TypeScript + React Three Fiber 9 + drei + Rapier + postprocessing + Zustand.
- Game flow state machine for all 12 phases, including the other-world run from Results (`src/game/phases.ts`).
- Deterministic outcome rule: only "Puzzle 2 finished in time" decides the world (`src/game/outcome.ts`).
- Scoring rules + ranks (`src/game/scoring.ts`).
- Presenter panel (Ctrl+Shift+P): jump to any phase, force outcome, skip (N), pause timers, quality, maze intensity, volume, caption size.
- URL launch options for rehearsal (`?phase=`, `?branch=`, `?presenter=1`, `?quality=`, `?debug=1`) + `window.__mindshift` test hooks.
- GPU tier detection (RTX → High, integrated → Medium, software → Low) + automatic step-down on low FPS.
- Title screen (logo, content note, audio unlock), score HUD, Results (score breakdown, rank, 4 takeaways, fiction disclaimer, other-world button), References (APA 7, draft flags in presenter mode).
- Animated neural-network title backdrop; bloom + AgX tone mapping.
- 41 unit tests (flow, outcome, scoring, store, URL options, GPU tiers, content integrity).
- GitHub Pages workflow (`.github/workflows/deploy.yml`) and offline launcher (`start-offline.bat`).

## Temporary stand-ins (clearly labeled "DEV STUB" in the game)
- Clinic, brain dive, tutorial, puzzles, zoom-out, integration: placeholder scene + simulated buttons.
- Both worlds: physics greybox (proves Rapier/shadows/post work), replaced in D3/D4.

## Next
- D1 Tue 17: character controller + third-person camera + animations (greybox); puzzle model + solver + tests.
- D2 Wed 18: 3D puzzle lattice + input + timers → vertical slice deployed.

## Waiting on the user
- [ ] GitHub account sign-in so the repo can be pushed and Pages enabled.
- [ ] Quaternius downloads (see docs/ASSETS.md).
- [ ] Team decisions on the §12 paper audit; final caption wording locks Sat Nov 21.

## Known issues
- Two harmless console warnings from libraries, not our code: `THREE.Clock` deprecated (inside R3F) and "deprecated parameters for the initialization function" (inside Rapier). Revisit if the libraries update before freeze.
- The world greybox has only been checked through the DOM/state (the browser pane was hidden during automated checks); a visual look is pending in the first playtest.

## Verified (D0)
- `npm test`: 41/41 passing; `tsc --noEmit` clean; production build 4.2 MB (physics lazy-loaded).
- In the browser: Title → Begin → all phases → Puzzle 2 solved → Luminous Shallows → zoom-out → integration → Results → other world (Brutalist Maze) → Results ("seen both worlds", button gone) → References (10 entries) → Restart. The Puzzle 2 timeout path leads to the Brutalist Maze and offers the Luminous Shallows. Score breakdowns match the scoring rules. No errors in the console.
