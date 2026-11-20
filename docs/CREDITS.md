# Credits and licenses

Every third-party file used by the game is listed here, and the list is mirrored on the in-game credits line.

## Software libraries
| Library | License |
|---|---|
| three.js, React, React Three Fiber, drei, @react-three/rapier, @react-three/postprocessing, postprocessing, Zustand, Vite | MIT |
| Rapier physics (via @dimforge/rapier3d-compat) | Apache-2.0 |

## Fonts
| Font | Source | License |
|---|---|---|
| Unbounded | @fontsource/unbounded | SIL Open Font License 1.1 |
| Inter | @fontsource-variable/inter | SIL Open Font License 1.1 |

## 3D models and animation
| Asset | Source | License | Used as |
|---|---|---|---|
| Universal Base Characters [Standard] (female + male bodies, Hair_Long, Hair_SimpleParted) | Quaternius, quaternius.com | CC0 1.0 | Alex, the therapist, inner Alex's hair |
| Universal Animation Library [Standard] (10 clips) | Quaternius, quaternius.com | CC0 1.0 | Idle, walk, jog, sprint, jump, sitting animations |

| Mid-Century Lounge Chair, Modern Arm Chair 01, Side Table 01, Coffee Table Round 01, Potted Plant 01, Potted Plant 02, Vintage Oil Lamp (1k) | Poly Haven, polyhaven.com | CC0 1.0 | Session-room furniture |
| Anniversary Lounge HDRI (1k) | Poly Haven, polyhaven.com | CC0 1.0 | Session-room image-based lighting |

Fetched with `node scripts/fetch-polyhaven.mjs`; converted with `npm run assets` (glTF-Transform: WebP textures, meshopt compression, simplified plant meshes).

## Music
| File | Used in | Source | License |
|---|---|---|---|
| `public/assets/audio/good-world.mp3` | Floating islands + lantern ending | Non-copyright track, screen-recorded by the team (title/artist: TBD) | TBD — confirm before publishing |
| `public/assets/audio/bad-world.mp3` | Blood-moon maze | Non-copyright track, screen-recorded by the team (title/artist: TBD) | TBD — confirm before publishing |

## Everything else
All environments, the brain, the neurons, the session room, the crayon drawing and all other audio (ambience, puzzle notes, effects) are procedural (code, shaders and Web Audio synthesis).
