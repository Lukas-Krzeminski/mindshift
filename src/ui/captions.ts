import { create } from 'zustand'

export type Speaker = 'alex' | 'therapist' | 'narrator' | 'lab' | 'intrusive'

export interface CaptionItem {
  id: number
  text: string
  speaker: Speaker
  /** Seconds on screen (after the word-by-word reveal). Ignored for dialogue lines (`wait`). */
  hold: number
  /** Optional small line under the caption (e.g. "One possible experience..."). */
  sub?: string
  /**
   * Dialogue line: stays up until the player continues (SPACE / Enter / click), like a dialogue box
   * in a story game. Cutscenes hold their next beat until it is dismissed.
   */
  wait?: boolean
  createdAt: number
  /** performance.now() when the last word has appeared (the continue prompt shows from then). */
  readyAt: number
}

interface CaptionStore {
  items: CaptionItem[]
  show: (text: string, opts?: { speaker?: Speaker; hold?: number; sub?: string; replace?: boolean; wait?: boolean }) => number
  hide: (id: number) => void
  clear: () => void
  /** Dismisses the waiting dialogue line once it has fully appeared (`force` skips that check). */
  continueDialogue: (force?: boolean) => boolean
}

let nextId = 1

/** Seconds until every word of `text` has appeared (matches the CSS word-by-word reveal). */
export const revealSeconds = (text: string) => text.split(' ').length * 0.09 + 0.4

/** Story/science captions shown over any scene. `replace` clears others of the same speaker class. */
export const useCaptions = create<CaptionStore>()((set, get) => ({
  items: [],
  show: (text, opts = {}) => {
    const id = nextId++
    const now = performance.now()
    const item: CaptionItem = {
      id,
      text,
      speaker: opts.speaker ?? 'narrator',
      hold: opts.hold ?? Math.max(3.2, text.split(' ').length * 0.42),
      sub: opts.sub,
      wait: opts.wait,
      createdAt: now,
      readyAt: now + revealSeconds(text) * 1000,
    }
    // Intrusive thoughts pile up on purpose; a normal caption replaces earlier normal captions.
    const current = get().items
    const keep = item.speaker === 'intrusive' || opts.replace === false ? current : current.filter((i) => i.speaker === 'intrusive')
    set({ items: [...keep, item] })
    if (!item.wait) window.setTimeout(() => get().hide(id), revealSeconds(text) * 1000 + item.hold * 1000)
    return id
  },
  hide: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
  clear: () => set({ items: [] }),
  continueDialogue: (force = false) => {
    const now = performance.now()
    const items = get().items
    if (!items.some((i) => i.wait && (force || now >= i.readyAt))) return false
    set({ items: items.filter((i) => !i.wait) })
    return true
  },
}))

export const showCaption = (...args: Parameters<CaptionStore['show']>) => useCaptions.getState().show(...args)

/** Shows a dialogue line that waits for the player to continue. */
export const sayLine = (text: string, speaker: Speaker = 'narrator') => showCaption(text, { speaker, wait: true })

/** True while a dialogue line is on screen waiting for the player. */
export const isDialogueWaiting = () => useCaptions.getState().items.some((i) => i.wait)
