import { useEffect, type CSSProperties } from 'react'
import { useSymbols } from './symbolStore'

/**
 * Left-side "what this stands for" card. Slides in, holds long enough to read aloud,
 * then hands over to the next queued card. The store clears itself whenever the phase changes.
 */
export function SymbolCardLayer() {
  const card = useSymbols((s) => s.current)
  useEffect(() => {
    if (!card) return
    const t = window.setTimeout(() => useSymbols.getState().next(), card.duration * 1000)
    return () => window.clearTimeout(t)
  }, [card])

  if (!card) return null
  return (
    <aside className="symbol-card glass" key={card.key} style={{ '--dur': `${card.duration}s` } as CSSProperties} aria-live="polite">
      <p className="symbol-eyebrow">
        <span className="symbol-mark" aria-hidden="true" />
        What it stands for
      </p>
      <h3 className="symbol-title">{card.title}</h3>
      <p className="symbol-meaning">{card.meaning}</p>
      <span className="symbol-timer" aria-hidden="true" />
    </aside>
  )
}
