import { create } from 'zustand'

/** Full-screen "membrane" light pass used to hide cuts between scales (clinic -> brain -> mind). */
export const useFlash = create<{ n: number; fire: () => void }>()((set) => ({
  n: 0,
  fire: () => set((s) => ({ n: s.n + 1 })),
}))

export const fireFlash = () => useFlash.getState().fire()

export function FlashOverlay() {
  const n = useFlash((s) => s.n)
  if (n === 0) return null
  return <div key={n} className="membrane-flash" />
}
