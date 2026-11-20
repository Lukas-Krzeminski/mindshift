import { useMemo } from 'react'
import { OrbitControls } from '@react-three/drei'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { mulberry32 } from '../../lib/random'
import { useGame } from '../../game/store'
import { QUALITY_PRESETS } from '../../quality/presets'
import type { Branch } from '../../game/outcome'
import { useCameraPose, type Vec3 } from '../useCameraPose'

/**
 * TEMPORARY greybox for both worlds (replaced in D3/D4). Its job today is to prove the
 * physics stack (Rapier WASM + shadows + post) runs end to end in each world's palette.
 */
const PALETTES: Record<Branch, { sky: string; skyLight: string; ground: string; accents: string[] }> = {
  positive: { sky: '#3a2a55', skyLight: '#ffd27a', ground: '#5fe0d0', accents: ['#ffb3c7', '#ffd27a', '#5fe0d0', '#f6f1ff'] },
  challenging: { sky: '#2a2e2a', skyLight: '#ffb238', ground: '#5e6b63', accents: ['#9cff2e', '#ff2e9a', '#b3001b', '#ffb238'] },
}

export function WorldGreybox({ world }: { world: Branch }) {
  const preset = QUALITY_PRESETS[useGame((s) => s.settings.quality)]
  const palette = PALETTES[world]
  useCameraPose([12, 8, 16], [0, 1, 0])

  const bodies = useMemo(() => {
    const rand = mulberry32(world === 'positive' ? 7 : 13)
    return Array.from({ length: 20 }, (_, i) => ({
      position: [(rand() - 0.5) * 14, 5 + rand() * 16, (rand() - 0.5) * 14] as Vec3,
      ball: i % 2 === 0,
      color: palette.accents[i % palette.accents.length],
    }))
  }, [world, palette])

  const shadowSize = preset.shadowMapSize || 512

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.sky, 30, 95]} />
      <hemisphereLight args={[palette.skyLight, palette.ground, 1.1]} />
      <directionalLight
        position={[14, 22, 10]}
        intensity={2.4}
        castShadow={preset.shadowMapSize > 0}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <Physics gravity={[0, -22, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[60, 0.5, 60]} position={[0, -0.5, 0]} />
        </RigidBody>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color={palette.ground} roughness={0.9} />
        </mesh>
        {bodies.map((b, i) => (
          <RigidBody key={i} position={b.position} colliders={b.ball ? 'ball' : 'cuboid'} restitution={0.35}>
            <mesh castShadow>
              {b.ball ? <sphereGeometry args={[0.7, 32, 32]} /> : <boxGeometry args={[1.2, 1.2, 1.2]} />}
              <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.7} roughness={0.4} />
            </mesh>
          </RigidBody>
        ))}
      </Physics>
      <OrbitControls makeDefault target={[0, 1, 0]} maxPolarAngle={Math.PI * 0.48} enableDamping />
    </>
  )
}
