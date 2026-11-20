import { create } from 'zustand'
import { useGame } from '../game/store'
import { SYMBOLS, symbolDuration, type SymbolCard, type SymbolId } from '../content/symbols'

interface SymbolStore {
  current: (SymbolCard & { key: number; duration: number }) | null
  queue: SymbolId[]
  /** Ids already shown this phase (a card never repeats within one scene). */
  seen: SymbolId[]
  show: (id: SymbolId) => void
  /** Current card finished: advance to the next queued one. */
  next: () => void
  clear: () => void
}

let key = 1

/** "What this stands for" cards, shown one at a time in the order they were triggered. */
export const useSymbols = create<SymbolStore>()((set, get) => ({
  current: null,
  queue: [],
  seen: [],
  show: (id) => {
    const { current, queue, seen } = get()
    if (seen.includes(id)) return
    if (!current) set({ current: { ...SYMBOLS[id], key: key++, duration: symbolDuration(SYMBOLS[id]) }, seen: [...seen, id] })
    else set({ queue: [...queue, id], seen: [...seen, id] })
  },
  next: () => {
    const [head, ...rest] = get().queue
    set({ current: head ? { ...SYMBOLS[head], key: key++, duration: symbolDuration(SYMBOLS[head]) } : null, queue: rest })
  },
  clear: () => set({ current: null, queue: [], seen: [] }),
}))

export const showSymbol = (id: SymbolId) => useSymbols.getState().show(id)

// Every phase change (including presenter jumps/skips) starts with a clean slate, synchronously,
// before the next scene mounts and triggers its own cards.
useGame.subscribe((s, prev) => {
  if (s.flowSeq !== prev.flowSeq) useSymbols.getState().clear()
})
