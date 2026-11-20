import { Float, Sparkles } from '@react-three/drei'
import type { Phase } from '../../game/phases'
import { useCameraPose } from '../useCameraPose'

/**
 * TEMPORARY stand-in for cinematic/puzzle phases until their real scenes land (D1-D7).
 * Tinted per phase so the flow is easy to follow while testing.
 */
const LOOK: Partial<Record<Phase, { tint: string; bg: string }>> = {
  clinic: { tint: '#ffd27a', bg: '#1b120c' },
  brainDive: { tint: '#4fe3ff', bg: '#0b0b2a' },
  tutorial: { tint: '#5fe0d0', bg: '#0b0b2a' },
  puzzle1: { tint: '#4fe3ff', bg: '#0d0b30' },
  puzzle2: { tint: '#ff4fd8', bg: '#120a30' },
  zoomOut: { tint: '#b48cff', bg: '#0b0b2a' },
  integration: { tint: '#ffb3c7', bg: '#1b120c' },
}

export function PlaceholderScene({ phase }: { phase: Phase }) {
  const look = LOOK[phase] ?? { tint: '#4fe3ff', bg: '#07071c' }
  useCameraPose([0, 1.2, 7], [0, 0.4, 0])
  return (
    <>
      <color attach="background" args={[look.bg]} />
      <fog attach="fog" args={[look.bg, 6, 24]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[3, 4, 4]} intensity={40} color={look.tint} />
      <Float speed={1.1} rotationIntensity={0.7} floatIntensity={0.9}>
        <mesh>
          <icosahedronGeometry args={[1.35, 1]} />
          <meshStandardMaterial color={look.tint} emissive={look.tint} emissiveIntensity={1.8} wireframe />
        </mesh>
        <mesh scale={0.5}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshStandardMaterial color="#ffffff" emissive={look.tint} emissiveIntensity={3.5} />
        </mesh>
      </Float>
      <Sparkles count={160} scale={[14, 8, 14]} size={2.5} speed={0.3} color={look.tint} />
    </>
  )
}
