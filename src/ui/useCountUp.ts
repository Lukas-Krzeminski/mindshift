import { useEffect, useRef, useState } from 'react'

/** Smoothly counts a displayed number toward `target` (score HUD, results). */
export function useCountUp(target: number, durationMs = 700): number {
  const [shown, setShown] = useState(target)
  const fromRef = useRef(target)
  const shownRef = useRef(target)

  useEffect(() => {
    fromRef.current = shownRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(fromRef.current + (target - fromRef.current) * eased)
      shownRef.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return shown
}
