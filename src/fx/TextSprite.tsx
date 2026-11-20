import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../scenes/useCameraPose'

/**
 * Text drawn into a canvas texture on a plane: lives inside the 3D scene (depth-sorted,
 * glows with bloom, never floats above the HTML UI) and needs no font download.
 */
export function TextSprite({
  text,
  position = [0, 0, 0],
  height = 0.2,
  color = '#ffffff',
  intensity = 1,
  weight = 600,
  family = 'Unbounded, Inter, system-ui, sans-serif',
  letterSpacing = 0.12,
  opacity = 1,
}: {
  text: string
  position?: Vec3
  height?: number
  color?: string
  intensity?: number
  weight?: number
  family?: string
  letterSpacing?: number
  opacity?: number
}) {
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    void document.fonts?.ready.then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])

  const { texture, aspect } = useMemo(() => {
    const px = 96
    const font = `${weight} ${px}px ${family}`
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    ctx.font = font
    const spacing = px * letterSpacing
    const chars = [...text]
    const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + spacing, -spacing)
    canvas.width = Math.ceil(width + px * 0.6)
    canvas.height = Math.ceil(px * 1.5)
    const c2 = canvas.getContext('2d')!
    c2.font = font
    c2.fillStyle = '#ffffff'
    c2.textBaseline = 'middle'
    let x = px * 0.3
    for (const ch of chars) {
      c2.fillText(ch, x, canvas.height / 2)
      x += c2.measureText(ch).width + spacing
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { texture: tex, aspect: canvas.width / canvas.height }
    // fontsReady forces a redraw once web fonts have loaded
  }, [text, weight, family, letterSpacing, fontsReady])

  useEffect(() => () => texture.dispose(), [texture])
  const tint = useMemo(() => new THREE.Color(color).multiplyScalar(intensity), [color, intensity])

  return (
    <mesh position={position}>
      <planeGeometry args={[height * 1.5 * aspect, height * 1.5]} />
      <meshBasicMaterial map={texture} color={tint} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
