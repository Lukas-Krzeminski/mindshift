/**
 * Symbol cards: the moment something meaningful appears, a small card says what it stands for.
 * Story symbols cite nothing ([]); anything stated as fact cites src/content/references.ts.
 * Status: DRAFT until the team locks the poster's papers (target Sat Nov 21).
 */

export interface SymbolCard {
  id: SymbolId
  /** What the player sees. */
  title: string
  /** What it stands for (one or two short sentences, readable from the back of a classroom). */
  meaning: string
  sources: string[]
}

export type SymbolId =
  | 'room'
  | 'capsule'
  | 'breath'
  | 'inside'
  | 'fibers'
  | 'lattice'
  | 'gates'
  | 'deadline'
  | 'shallows'
  | 'memories'
  | 'tree'
  | 'maze'
  | 'voices'
  | 'mazeBreath'
  | 'beam'
  | 'lanterns'

const list: SymbolCard[] = [
  // clinic
  {
    id: 'room',
    title: 'The calm room, eyeshades and music',
    meaning: 'Set and setting: trials use a home-like room, turn attention inward, and keep a trained guide present throughout.',
    sources: ['johnson2008', 'ross2016'],
  },
  {
    id: 'capsule',
    title: 'The mushroom becomes a capsule',
    meaning: 'Psilocybin comes from mushrooms, but trials give a pure, measured dose with medical supervision.',
    sources: ['ross2016', 'agrawal2023'],
  },
  {
    id: 'breath',
    title: 'Breathing together',
    meaning: 'Preparation: patients practise calming skills beforehand, so they can use them if it gets hard.',
    sources: ['johnson2008'],
  },
  {
    id: 'inside',
    title: 'Diving into her head',
    meaning: "From here, we follow what happens inside Alex's brain and mind.",
    sources: [],
  },
  // brain + puzzles
  {
    id: 'fibers',
    title: 'The glowing fibres',
    meaning: 'Brain networks: the pathways different brain regions use to talk to each other.',
    sources: ['siegel2024'],
  },
  {
    id: 'lattice',
    title: 'The lattices',
    meaning: 'Rerouting signals stands for brain networks communicating in new ways. A metaphor, not a real map.',
    sources: ['siegel2024'],
  },
  {
    id: 'gates',
    title: 'The gold rings',
    meaning: 'Serotonin 5‑HT2A receptors: where psilocin, made from psilocybin in the body, acts.',
    sources: ['madsen2019'],
  },
  {
    id: 'deadline',
    title: 'Why a puzzle decides',
    meaning: 'It stands for how unpredictable a session is. In reality, no skill or test decides whether it feels gentle or hard.',
    sources: [],
  },
  // positive world
  {
    id: 'shallows',
    title: 'The Luminous Shallows',
    meaning: 'A meaningful, peaceful experience. Many patients describe beauty, connection and insight.',
    sources: ['ross2016'],
  },
  {
    id: 'memories',
    title: 'Her memories',
    meaning: 'Her daughter, her art, letting go: sessions often turn toward what matters most in a life.',
    sources: ['rosa2025'],
  },
  {
    id: 'tree',
    title: 'The Tree of Connection',
    meaning: 'Her memories, threaded together: feeling connected to others and to life is a theme patients often report.',
    sources: ['ross2016'],
  },
  // challenging world
  {
    id: 'maze',
    title: 'The labyrinth',
    meaning: 'A challenging experience. Fear, confusion and anxiety can surface, even in a safe setting.',
    sources: ['johnson2008'],
  },
  {
    id: 'voices',
    title: 'The faces in the walls',
    meaning: "Alex's fears pressing in: the cancer coming back, leaving her daughter too soon.",
    sources: [],
  },
  {
    id: 'mazeBreath',
    title: 'Holding Space to breathe',
    meaning: 'The skill she practised beforehand. Slowing her breath helps her ride out the hardest part.',
    sources: ['johnson2008'],
  },
  {
    id: 'beam',
    title: 'The beam of light',
    meaning: 'Moving toward what scares her instead of running. With slow breaths, the panic starts to pass.',
    sources: [],
  },
  // ending
  {
    id: 'lanterns',
    title: 'The lanterns and the drawing',
    meaning: 'What she let go of rises into what she lives for. Afterwards, integration sessions help patients make sense of it.',
    sources: ['rosa2025'],
  },
]

export const SYMBOLS: Record<SymbolId, SymbolCard> = Object.fromEntries(list.map((s) => [s.id, s])) as Record<SymbolId, SymbolCard>
export const SYMBOL_LIST: readonly SymbolCard[] = list

/** Seconds a card stays up: long enough to read aloud twice. */
export const symbolDuration = (s: SymbolCard): number =>
  Math.max(5.5, 2.2 + (s.title.split(' ').length + s.meaning.split(' ').length) * 0.24)
