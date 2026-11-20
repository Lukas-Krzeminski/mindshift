import { create } from 'zustand'

/** What the world HUD shows; set by the active world scene. */
export interface WorldHudState {
  title: string
  goal: string
  sub: string
  /** 0..1 breathing ring scale while the breath beat runs; null hides it. */
  breath: { scale: number; label: string; hint?: string; center?: boolean; active?: boolean } | null
  set: (patch: Partial<Omit<WorldHudState, 'set'>>) => void
  reset: () => void
}

const EMPTY = { title: '', goal: '', sub: '', breath: null }

export const useWorldHud = create<WorldHudState>()((set) => ({
  ...EMPTY,
  set: (patch) => set(patch),
  reset: () => set(EMPTY),
}))
