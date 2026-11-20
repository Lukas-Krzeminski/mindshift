import { useEffect, type CSSProperties } from 'react'
import { revealSeconds, useCaptions, type CaptionItem } from './captions'

const SPEAKER_LABEL: Partial<Record<CaptionItem['speaker'], string>> = {
  alex: 'Alex',
  therapist: 'Therapist',
  lab: 'Lab note',
}

/** Word-by-word fading captions: the game's only "voice" (team narrates live). */
export function CaptionLayer() {
  const items = useCaptions((s) => s.items)
  const main = items.filter((i) => i.speaker !== 'intrusive')
  const intrusive = items.filter((i) => i.speaker === 'intrusive')

  // SPACE / Enter continue a finished dialogue line (only while one is waiting, so jumping and
  // breathing in the worlds are untouched). The key is swallowed so it can't press a focused button.
  useEffect(() => {
    let handled = false
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      if (e.repeat) {
        if (handled) e.preventDefault()
        return
      }
      handled = useCaptions.getState().continueDialogue()
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (handled && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
        e.preventDefault()
        e.stopPropagation()
        handled = false
      }
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
    }
  }, [])

  return (
    <>
      <div className="caption-stack">
        {main.slice(-2).map((item) => (
          <Caption key={item.id} item={item} />
        ))}
      </div>
      {intrusive.map((item, k) => (
        <div
          key={item.id}
          className="intrusive"
          style={{ left: `${12 + ((item.id * 37) % 60)}%`, top: `${18 + ((item.id * 53 + k * 11) % 52)}%` } as CSSProperties}
        >
          {item.text}
        </div>
      ))}
    </>
  )
}

function Caption({ item }: { item: CaptionItem }) {
  const words = item.text.split(' ')
  const label = SPEAKER_LABEL[item.speaker]
  return (
    <div
      className={`caption caption-${item.speaker}${item.wait ? ' caption-wait' : ''}`}
      style={{ '--life': `${revealSeconds(item.text) + item.hold}s` } as CSSProperties}
      onClick={item.wait ? () => useCaptions.getState().continueDialogue() : undefined}
    >
      {label && <span className="caption-who">{label}</span>}
      <p className="caption-text">
        {words.map((w, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.09}s` }}>
            {w}{' '}
          </span>
        ))}
      </p>
      {item.sub && <p className="caption-sub">{item.sub}</p>}
      {item.wait && (
        <p className="caption-continue" style={{ animationDelay: `${revealSeconds(item.text)}s` }}>
          Press <kbd>Space</kbd> to continue <span aria-hidden="true">▸</span>
        </p>
      )}
    </div>
  )
}
