# Project status

Plan: MVP Mon Nov 23 · feature freeze Wed Nov 25 · presentation Fri–Sun Nov 27–29, 2026.

## Done
### D0 (Nov 16): foundation
Flow state machine (12 phases + other-world run), deterministic outcome rule, scoring, presenter panel, URL launch options, GPU tiers, title/results/references screens, Pages workflow, offline launcher.

### D1–D7 first pass (Nov 16): the whole game is now real, end to end
- **Puzzles**: Flow-style rules engine (cut/restore, retract, gates), 3 handcrafted lattices proven solvable and fully coverable by a solver, holographic 3D boards (glyph-coded endpoints, glowing signal tubes with travelling pulses, 5-HT2A gates, timer fuse around the frame), tutorial ghost guide, intro/required/outcome cards, chord notes per connection, automatic result reporting.
- **Neural chamber**: nebula sky, glowing mist sea, procedurally grown instanced neurons with outward pulses; camera flies between lattices.
- **Player**: Rapier kinematic character controller (accel/decel, sprint, coyote jump + buffer, feather-drift, collision-aware camera), pointer-lock mouse look with drag fallback, CC0 Quaternius rig with idle/walk/jog/sprint/jump clips, luminous "inner Alex" shader (iridescent vs. harsh/fragmented).
- **Luminous Shallows**: dawn sky with aurora + clouds + sun, mirror sea with caustic web and colored footstep ripples, iridescent arches with mirrored reflections, glowing reeds, jellyfish lights, light shafts, Tree of Connection (finale bloom), 3 memory shards that unfold into dioramas (procedural crayon drawing, paint palette, kite), guide wisps, insight scoring, time limit.
- **Brutalist Maze**: endless concrete corridor (breathing/melting walls, formwork seams, acid light that slowly cycles, bleeding color, kaleidoscope alcoves, stairs to nowhere, distant monoliths), drifting fog walls, intrusive-thought captions, macropsia avatar scaling, tracer trail, heavier controls, receding monolith → therapist-led breath (whole class) → walls slide open → moving toward the monolith cracks it with warm light. Presenter "reduced intensity" halves everything.
- **Clinic**: procedural session room (wood floor, sun shafts, curtains, couch, plants, lamp, crayon drawing on the side table); Alex (beanie, eyeshades, headphones, clothes painted by skeleton region) and the therapist, animated seated.
- **Cinematics**: clinic intro (captions + shared breath), brain dive (procedural glass brain with DTI-colored tracts + lab lines), zoom-out (world orb → brain beacon → back into the room), integration (branch-specific lines). Membrane flashes hide the cuts.
- **Audio** (all synthesized): ambience per scene, chime/notes/chords, timer heartbeat, maze drone + heartbeat that slows with the breath.
- 57 unit tests; production build 8.2 MB.

### Nov 16 (evening): clinic overhaul, round 1
- Session room now uses real CC0 furniture from Poly Haven (lounge chair, armchair, side table, oil lamp, coffee table, plants) with image-based lighting and contact shadows.
- Characters seated by pelvis-fit; accessories measured from the actual head mesh; capsule moment (mushroom morphs into capsule, hand-to-mouth IK); x-ray reveal of the brain inside Alex's head; brain dive starts where the clinic ends.
- Fixed: white blotches everywhere (contrast grading produced negative colors; a final clamp pass now prevents it).
- Tried and rejected by the user: clay-diorama restyle, loose generated sweaters, Mixamo characters.

### Nov 16 (night): clinic overhaul, round 2
- Back to the original Quaternius characters with light everyday clothes (fitted knit top + trousers + shoes); clean crew neckline and cuffs; chest smoothed so the top reads as fabric.
- Two matching upright armchairs (lounge chair removed — it caused clipping); seat height and backrest measured from the chair model by ray-cast; feet clamped to the floor. Therapist angled toward Alex.
- Capsule moment reframed: close-up of the glowing mushroom on a dark dish beside the "ME + MOM" crayon drawing, then the capsule floats to her fingertips and she brings it to her lips. Lamp light no longer blows out the side table.
- X-ray reveal and zoom-out keep the clothing silhouette. Glowing inner Alex in the worlds is unchanged (by request).

### Nov 16 (late): puzzles rebuilt (tutorial + 4 / 6 / 8 pairs)
- New flow: tutorial (4×4) → Puzzle 1 (6×6, 4 pairs, 1 gate, 50 s) → Puzzle 2 (7×7, 6 pairs, 2 gates, 80 s) → **Puzzle 3 (8×8, 8 pairs, 3 gates, 110 s, required; decides the world)**. Puzzles 1–2 auto-start after their intro card and a timeout just moves on (partial points).
- Levels come from `scripts/gen-levels.ts` and are proven by the tests: exactly one way to fill every cell, and drawing each pair's shortest route never works, in any order or direction, so every lattice needs planning.
- 8 signal colors, each with its own glyph (circle, triangle, square, diamond, star, hexagon, plus, heart); 8-note chord.
- Contrast: dark glass plate behind each lattice, brighter grid and cell dots; neuron branches between the camera and the active lattice are cut away; camera leaves headroom so the title/timer never covers the board.
- Fixed: puzzle title/timer block was drifting right of center (animation overrode the centering transform).
- Scoring rebalanced (solve 800 / 1200 / 1800; gates score on every lattice); ranks and the radiant tier rescaled.

### Nov 16 (late): symbol cards + readable puzzle challenges
- "What it stands for" cards pop up the moment each symbol appears (left side, ~6–8 s, one at a time, cleared on every phase change). All text lives in `src/content/symbols.ts`; factual cards cite references (tested).
  - Clinic: calm room/eyeshades/music (set & setting), mushroom → capsule, breathing together (preparation), diving into her head.
  - Brain/puzzles: glowing fibres (networks), lattices (metaphor), gold rings (5-HT2A), why a puzzle decides.
  - Worlds: Shallows, her memories, Tree of Connection / Maze, the voices, breathing again, the monolith.
  - After: coming back to the room, her daughter's drawing, the talk afterwards (integration).
- All three timed lattices now wait on their challenge card until someone presses Start (Enter works too), so the class can read the challenge first.

### Nov 16 (late): both worlds rebuilt
- **Luminous Shallows**: three floating memory islands (rock with glowing veins, meadow of light, reeds, a waterfall of light), each marked by a tall beacon. Step into a spiral light column to float up (it holds Alex gently while rising). Finding a memory: shockwave across meadow and sea, pillar of light, petal burst, and a thread of light that draws itself to the Tree. Goal line: "Float up to Alex's memories · n/3" → "Follow the threads to the Tree". **Final moment**: Alex reaches the Tree, the camera cranes up, threads flare, the Tree blossoms and her daughter's crayon sun rises over the horizon.
- **Brutalist Maze**: a real seeded labyrinth (7×8 cells, 3.6 m corridors, 13–22 m walls, kaleidoscope dead ends), constant camera tremor plus a jolt whenever a concrete **face pushes out of a wall** (with an intrusive thought and a low groan). A faint warm thread on the floor marks the way and brightens if Alex is lost; a warm beam beyond the exit shows the way out; after 60 s the walls sink as a safety net. Outside: **Hold SPACE to breathe** ×3 (no therapist; Alex's own words; auto-assists after 9 s idle), each breath calms the world. Then "Move toward it". **Final moment**: the monolith cracks open with warm light at dawn as the camera rises.
- Player controller: updraft columns, camera shake, cinematic camera takeover for final moments, debug-only teleport (`__mindshift.player.teleportTo`).
- Maze generator is unit-tested (perfect maze, long valid route, closed except the exit, faces on walls).

### Nov 16 (late): full rehearsal pass (production build, automated)
- Both branches run Title → Results with no console errors, plus both "other world" bonus runs (return to Results, no extra points, button disappears once both worlds are seen). Puzzle timers hold until Start; Puzzle 1/2 timeouts continue; only Puzzle 3 decides the world; Play again resets the score.
- Fixed: "all two gates" wording → "both"; Results breakdown grouped to one line per puzzle (fits one screen at 1280×800); symbol cards on narrow screens no longer cover captions.

### Timing budget (target 6.5–7 min)
| Segment | Measured / estimated |
|---|---|
| Clinic intro (37 s + reading time: lines wait for SPACE) | ~45–55 s |
| Brain dive (15 s + reading time) | ~18–22 s |
| Tutorial | ~20 s |
| Puzzle 1 (read card + play, max 50 s) | ~45 s |
| Puzzle 2 (max 80 s) | ~65 s |
| Puzzle 3 incl. class vote (max 110 s) | ~105 s |
| World (Shallows: water + column + 5-jump climb + tree / Maze: ~1.5–2 min route + light room) | ~100–150 s |
| Lanterns ending (23 s + reading time) | ~28–35 s |
| Results discussion | ~30 s |
| **Typical total** | **~8–8.5 min** (estimate after the Nov 20 changes; re-measure in rehearsal. Other-world run adds ~1.5–2 min) |
- Biggest levers if it runs long in rehearsal: Puzzle 2 timer (80 → 65 s), Puzzle 3 timer (110 → 95 s), fewer breaths in the maze (3 → 2).

### Nov 17: clinic feedback round
- Eyeshades removed from Alex; headphones are now soft cream (no black band on her head).
- Clothes: the sweater front is rebuilt as a smooth knit panel (no bust, no cleavage, no pecs) that falls straight instead of hugging the waist; arms smoothed so muscles don't show. Same thickness as before.
- Seating: pelvis raised so thighs rest on the cushion (Alex no longer looks like she is kneeling), slightly back toward the backrest.
- Therapist hair brown; eyebrows near-black for Alex, dark brown for the therapist.
- Taking the capsule: real hand pose (fingers pointing to her lips, index and thumb pinched, other fingers folded, back of the hand to the room); the capsule rides between thumb and index.
- No symbol cards during the clinic intro (the opening speaks for itself); captions are now pop-up speech bubbles (speaker label, glass panel, tail for Alex/therapist).

### Nov 17: new ending, both worlds harder, songs, clinic round 2
- **Ending**: the return to the therapy room (zoom-out + integration) is gone. New finale "Lanterns at Dawn": ~420 lanterns rise off a still lake at sunrise and assemble into her daughter's crayon drawing (ME + MOM, sun, heart); integration line + closing line; 23 s, then Results.
- **Luminous Shallows → floating islands parkour**: lower gravity (14), faster running (×1.35), longer jumps; stepping-stone paths with real gaps up to three memory islands, checkpoints and fall-respawn; sunset sky, cloud sea, birds. After the 3rd memory: finale, then the ending.
- **Maze → blood-moon labyrinth**: 9×11 cells, no thread or beacon, red stone, faces in the walls, shadow figures at corridor ends, blood-red grade. The exit leads to a room with a beam of light: step in, hold SPACE to breathe 3 times (auto-assist if idle), light floods, then the ending. Safety nets: walls sink after 95 s (bonus run 50 s); hard limit 170 s (110 s).
- **Songs**: the good-world song plays in the Shallows and the ending, the bad-world song in the maze. Each fades in over 2 s when its scene starts (from the top), loops with a 3 s crossfaded seam, and ducks the ambience. Files: `public/assets/audio/good-world.mp3` (70 s) and `bad-world.mp3` (55 s), made from the team's screen recordings.
- **Clinic**: headphones removed (beanie only). Chairs scaled to 0.8 so the seat fits the characters; both seated by measured fit (0 points through the chair; under 1 cm above the cushion). Pill reach rebuilt: the elbow stays down at her side (17+ cm below the shoulder), the hand rides up with the arm (wrist blends from its resting bend to its bend at the lips, forearm carries the palm-turn), fingers curl smoothly. No joint turns more than ~12° per 0.05 s, so no spinning or flipping.

### Nov 20: dialogue, water world back, clearer maze
- **Title screen**: just the logo, subtitle and Begin (eyebrow line and content note removed). The "In this game, finishing decides…" disclaimer is gone from the required-puzzle card and Results; the References page and button are removed (citation data stays in `src/content/references.ts` for the captions' source tags).
- **Fingers flying in circles (fixed)**: the middle/ring/pinky joints were never reset by the seated clip, so the curl was added again every frame (~69°/frame). Now every bone the reach touches is restored to the clip's pose at the start of each frame: max 6°/frame during the reach, and the hand returns to its normal pose afterwards.
- **Dialogue waits for the player**: in the clinic, brain dive and lantern ending each line stays up; once fully shown it says "Press SPACE to continue" (Enter or a click also work). The cutscene keeps playing until its next line or key beat (taking the capsule, the shared breath, leaving the scene), then eases to a stop until the player continues. Lines inside the playable worlds stay timed (SPACE is jump/breathe there). Dev hook: `__mindshift.continue()`.
- **Luminous Shallows → water world + sky islands**: the dawn sea of liquid light is back (reflections, arches, reeds, jellyfish, light shafts), with magical floating islands in the sky pouring waterfalls of light into it. Memory 1 is on the water; memory 2 is on a floating island reached by a column of light that shoots Alex up; memory 3 is on a higher island reached only by a 5-jump parkour (4 floating stones, 1.35 m higher each, ~2.8 m gaps, then the island). Then follow the threads to the Tree; reaching it starts the finale. Lighter gravity / faster running kept. All 5 jumps verified with real key input.
- **Maze → one clear route**: a single winding route of 57 cells (~205 m) to the light room, with exactly 6 short straight dead ends (1–2 cells; the end wall is visible at once) spread along it; everything else is solid stone. ~1.5–2 min for a first-timer (~1 min sprinting). Dead-end panels no longer cover the doorway to the light. Safety nets: walls sink at 150 s (bonus 75 s); hard limit 220 s (bonus 130 s).

## Pending
- [ ] Song titles, artists and licenses for `docs/CREDITS.md` (the songs themselves are in: `public/assets/audio/`, 2 s fade-in, crossfaded loop seam).

## Next (polish passes)
- Visual iteration with the user on every scene (colors, framing, character look).
- Timings: rehearse with real players against the budget above; tune Puzzle 3 (required) timer with first-time players.
- Performance pass on the Intel iGPU and at 1080p on the RTX.
- Copy the final paper decisions into `src/content/` (locks Sat Nov 21).

## Waiting on the user
- [ ] GitHub account sign-in so the repo can be pushed and Pages enabled.
- [ ] Team decisions on the §12 paper audit.
- [ ] Visual feedback on each scene.

## Known issues
- Library warnings in the console (not ours): `THREE.Clock` deprecated (R3F) and Rapier's "deprecated parameters for the initialization function".
- The built-in Claude browser runs on the Intel GPU and throttles when hidden; judge performance in Chrome on the RTX laptop.
- Alex's beanie is positioned by hand from the measured head; small offsets may need tuning.
