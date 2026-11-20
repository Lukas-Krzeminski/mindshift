/**
 * Keyboard + mouse-look input for third-person movement.
 * Mouse look uses pointer lock (like most third-person games); if the browser refuses
 * pointer lock, click-dragging still turns the camera.
 */
export const input = {
  keys: new Set<string>(),
  /** Mouse movement accumulated since the last frame (consumed by the camera). */
  lookDX: 0,
  lookDY: 0,
  wheel: 0,
  locked: false,
  dragging: false,
  /** Seconds since the player last touched any control (for hints). */
  lastActivity: 0,
}

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function attachInput(canvas: HTMLCanvasElement): () => void {
  const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey) return
    input.keys.add(e.code)
    input.lastActivity = performance.now()
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault()
  }
  const onKeyUp = (e: KeyboardEvent) => input.keys.delete(e.code)
  const onBlur = () => {
    input.keys.clear()
    input.dragging = false
  }
  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== canvas) return
    input.dragging = true
    input.lastActivity = performance.now()
    if (!document.pointerLockElement) {
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined
        p?.catch?.(() => undefined)
      } catch {
        /* drag-to-look still works */
      }
    }
  }
  const onMouseMove = (e: MouseEvent) => {
    if (input.locked || input.dragging) {
      input.lookDX += e.movementX
      input.lookDY += e.movementY
      input.lastActivity = performance.now()
    }
  }
  const onPointerUp = () => (input.dragging = false)
  const onLockChange = () => (input.locked = document.pointerLockElement === canvas)
  const onWheel = (e: WheelEvent) => (input.wheel += e.deltaY)
  const onContext = (e: Event) => e.preventDefault()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('mousemove', onMouseMove)
  window.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointerlockchange', onLockChange)
  canvas.addEventListener('wheel', onWheel, { passive: true })
  canvas.addEventListener('contextmenu', onContext)
  // Space must never "click" a button that still has focus from a previous screen.
  ;(document.activeElement as HTMLElement | null)?.blur?.()

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    canvas.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointerlockchange', onLockChange)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('contextmenu', onContext)
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    input.keys.clear()
    input.dragging = false
    input.locked = false
  }
}

export const keyDown = (...codes: string[]) => codes.some((c) => input.keys.has(c))
