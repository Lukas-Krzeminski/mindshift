# Asset downloads

Raw downloads go in `asset-src/` (git-ignored). Claude converts and compresses the parts the game uses into `public/assets/` and logs each one in `docs/CREDITS.md`.

## Needed now (D1): please download these

| Pack | Where | License | What to pick | Put it in |
|---|---|---|---|---|
| Universal Base Characters | https://quaternius.com/packs/universalbasecharacters.html (or quaternius.itch.io/universal-base-characters) | CC0 | The free **Standard** download (glTF/FBX). Paying is optional. | `asset-src/quaternius/base-characters/` |
| Universal Animation Library | https://quaternius.com/packs/universalanimationlibrary.html (or quaternius.itch.io/universal-animation-library) | CC0 | The free **Standard** download. | `asset-src/quaternius/animation-library/` |

On itch.io you can choose "No thanks, just take me to the downloads" for the free tier.

If the free Standard animations lack a sitting/reclining clip, the fallback is Mixamo (free Adobe account). Claude will say exactly which clips to grab.

## Later (Claude fetches these after asking you first)
- D5: Poly Haven CC0 furniture, plants and an interior HDRI for the clinic; ambientCG CC0 concrete texture for the maze.
- D5: brain mesh. Candidates are NIH 3D "Detailed Human Brain Model" and Sketchfab CC-BY brains; the license is checked first, with a procedural brain as fallback.
- D7: royalty-free music (3 short tracks) + CC0 sound effects.
