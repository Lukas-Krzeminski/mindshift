import * as THREE from 'three'
import type { Glyph } from './levels'

/** Outline glyph around each endpoint so pairs are distinguishable without color. */
function polygon(sides: number, radius: number, rotation: number, inner?: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  const n = inner ? sides * 2 : sides
  for (let i = 0; i < n; i++) {
    const r = inner && i % 2 === 1 ? inner : radius
    const a = rotation + (i / n) * Math.PI * 2
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r))
  }
  return pts
}

const cache = new Map<Glyph, THREE.BufferGeometry>()

export function glyphGeometry(glyph: Glyph): THREE.BufferGeometry {
  const hit = cache.get(glyph)
  if (hit) return hit
  const R = 0.46
  const k = 0.82
  let outer: THREE.Vector2[]
  switch (glyph) {
    case 'circle':
      outer = polygon(48, R * 0.95, 0)
      break
    case 'triangle':
      outer = polygon(3, R * 1.12, Math.PI / 2)
      break
    case 'square':
      outer = polygon(4, R * 1.05, Math.PI / 4)
      break
    case 'diamond':
      outer = polygon(4, R * 1.12, 0)
      break
    case 'star':
      outer = polygon(5, R * 1.18, Math.PI / 2, R * 0.6)
      break
    case 'hexagon':
      outer = polygon(6, R * 1.05, 0)
      break
    case 'plus': {
      const a = R * 1.08
      const b = R * 0.36
      outer = [[b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b], [-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b]].map(([x, y]) => new THREE.Vector2(x, y))
      break
    }
    case 'heart':
      outer = Array.from({ length: 64 }, (_, i) => {
        const t = (i / 64) * Math.PI * 2
        const x = 16 * Math.pow(Math.sin(t), 3)
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
        return new THREE.Vector2(x * R * 0.068, (y + 2.5) * R * 0.068)
      }).reverse()
      break
  }
  const shape = new THREE.Shape(outer)
  shape.holes.push(new THREE.Path(outer.map((p) => p.clone().multiplyScalar(k)).reverse()))
  const geo = new THREE.ShapeGeometry(shape)
  cache.set(glyph, geo)
  return geo
}
