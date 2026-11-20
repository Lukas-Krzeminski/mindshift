import { buildLevel, type Level, type LevelDef } from './model'

/**
 * Lattices (plan §2, revised Nov 16: tutorial + 4 / 6 / 8 pairs, the 8-pair lattice decides the world).
 * Puzzles 1-3 come from scripts/gen-levels.ts and are verified by tests/puzzle.test.ts:
 * exactly one way to fill every cell, and drawing each pair's shortest route never works,
 * so every lattice needs real planning. Gates sit on the detours the shortest routes skip.
 * Letters: UPPERCASE endpoint, lowercase path, '#' blocked, '.' empty.
 */
export const PUZZLE_KEYS = ['tutorial', 'puzzle1', 'puzzle2', 'puzzle3'] as const
export type PuzzleKey = (typeof PUZZLE_KEYS)[number]

/** The lattice whose result decides Alex's world. */
export const REQUIRED_PUZZLE: PuzzleKey = 'puzzle3'

const DEFS: Record<PuzzleKey, LevelDef> = {
  tutorial: {
    id: 'tutorial',
    size: 4,
    timeLimit: null,
    solution: [
      'AaaA',
      'B...',
      'b...',
      'bbbB',
    ],
  },
  puzzle1: {
    id: 'puzzle1',
    size: 6,
    timeLimit: 50,
    solution: [
      'Abbbbb',
      'abCccb',
      'abaAcb',
      'aBaCcb',
      'a#aDBb',
      'aaaddD',
    ],
    gates: [[0, 5]],
  },
  puzzle2: {
    id: 'puzzle2',
    size: 7,
    timeLimit: 80,
    solution: [
      'bBAaeeE',
      'bdDae#C',
      'bdaaeEc',
      'bdA#ccc',
      'bddccfF',
      'bBdcFfC',
      'Dddcccc',
    ],
    gates: [
      [0, 4],
      [6, 3],
    ],
  },
  puzzle3: {
    id: 'puzzle3',
    size: 8,
    timeLimit: 110,
    solution: [
      'ccCAaaaa',
      'cDBbbb#a',
      'CddddbAa',
      'eeeEdb#B',
      'EFdddbbb',
      'ffDggggg',
      'fGgghhHg',
      'ffFHhGgg',
    ],
    gates: [
      [4, 4],
      [5, 7],
      [6, 0],
    ],
  },
}

export const puzzleForPhase = (phase: string): PuzzleKey | null =>
  (PUZZLE_KEYS as readonly string[]).includes(phase) ? (phase as PuzzleKey) : null

const cache = new Map<PuzzleKey, Level>()

export function getLevel(key: PuzzleKey): Level {
  let level = cache.get(key)
  if (!level) {
    level = buildLevel(DEFS[key])
    cache.set(key, level)
  }
  return level
}

export const LEVEL_DEFS = DEFS

/** Neon palette per color index + a glyph so colors stay distinguishable for color-blind viewers. */
export const SIGNAL_COLORS = [
  { hex: '#4fe3ff', glyph: 'circle', name: 'cyan' },
  { hex: '#ff4fd8', glyph: 'triangle', name: 'magenta' },
  { hex: '#ffd27a', glyph: 'square', name: 'gold' },
  { hex: '#6bff9e', glyph: 'diamond', name: 'mint' },
  { hex: '#ff8a5b', glyph: 'star', name: 'coral' },
  { hex: '#b48cff', glyph: 'hexagon', name: 'violet' },
  { hex: '#3f8cff', glyph: 'plus', name: 'blue' },
  { hex: '#f4f4ff', glyph: 'heart', name: 'pearl' },
] as const

export type Glyph = (typeof SIGNAL_COLORS)[number]['glyph']
