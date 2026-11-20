import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { QualityPreset } from '../quality/presets'

/**
 * Global post stack. Scenes render in linear HDR; bloom picks up emissive values > 1,
 * then AgX tone mapping maps to the display. Scene-specific passes (color bleed,
 * afterimage, DOF) join here in later milestones.
 */
export function PostFX({ preset }: { preset: QualityPreset }) {
  return (
    <EffectComposer multisampling={preset.msaa}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.25} radius={0.72} />
      <Vignette offset={0.32} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}
