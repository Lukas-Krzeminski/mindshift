import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, Stats } from '@react-three/drei'
import { useGame } from '../game/store'
import { QUALITY_PRESETS, lowerTier } from '../quality/presets'
import { PostFX } from '../fx/PostFX'
import { SceneRouter } from './SceneRouter'

function stepDownQuality() {
  const { settings, setSettings } = useGame.getState()
  if (settings.qualityAuto) setSettings({ quality: lowerTier(settings.quality) })
}

/** The one WebGL canvas for the whole game; phases swap content inside it. */
export function GameCanvas() {
  const quality = useGame((s) => s.settings.quality)
  const qualityAuto = useGame((s) => s.settings.qualityAuto)
  const debug = useGame((s) => s.debug)
  const preset = QUALITY_PRESETS[quality]

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      dpr={preset.dpr}
      shadows={preset.shadowMapSize > 0}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 55, near: 0.1, far: 2000, position: [0, 1.6, 8] }}
    >
      {qualityAuto && <PerformanceMonitor flipflops={3} onDecline={stepDownQuality} />}
      <Suspense fallback={null}>
        <SceneRouter />
      </Suspense>
      <PostFX preset={preset} />
      {debug && <Stats />}
    </Canvas>
  )
}
