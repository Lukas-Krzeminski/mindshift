import { useEffect } from 'react'
import { create } from 'zustand'
import { EffectComposer, Bloom, ToneMapping, Vignette, BrightnessContrast, HueSaturation } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { QualityPreset } from '../quality/presets'
import { ClampFX, MazeFX } from './MazeEffect'

/** Per-scene grading. Scenes call usePostLook({...}) on mount; defaults suit dark scenes. */
export interface PostLook {
  bloomThreshold: number
  bloomIntensity: number
  bloomRadius: number
  vignette: number
  toneMapping: 'agx' | 'aces' | 'neutral'
  contrast: number
  saturation: number
  brightness: number
}

export const DEFAULT_LOOK: PostLook = {
  bloomThreshold: 0.55,
  bloomIntensity: 0.85,
  bloomRadius: 0.72,
  vignette: 0.5,
  toneMapping: 'agx',
  contrast: 0,
  saturation: 0,
  brightness: 0,
}

export const usePostLookStore = create<{ look: PostLook; set: (l: Partial<PostLook>) => void }>()((set) => ({
  look: DEFAULT_LOOK,
  set: (l) => set({ look: { ...DEFAULT_LOOK, ...l } }),
}))

/** Apply a grading while the calling scene is mounted. */
export function usePostLook(look: Partial<PostLook>): void {
  const key = JSON.stringify(look)
  useEffect(() => {
    usePostLookStore.getState().set(JSON.parse(key) as Partial<PostLook>)
    return () => usePostLookStore.getState().set({})
  }, [key])
}

const TONE: Record<PostLook['toneMapping'], ToneMappingMode> = {
  agx: ToneMappingMode.AGX,
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
}

/**
 * Global post stack. Scenes render in linear HDR; bloom picks up values above the
 * threshold, then tone mapping maps to the display. Scene passes join here later.
 */
export function PostFX({ preset }: { preset: QualityPreset }) {
  const look = usePostLookStore((s) => s.look)
  return (
    <EffectComposer multisampling={preset.msaa}>
      <Bloom mipmapBlur intensity={look.bloomIntensity} luminanceThreshold={look.bloomThreshold} luminanceSmoothing={0.25} radius={look.bloomRadius} />
      <MazeFX />
      <Vignette offset={0.32} darkness={look.vignette} />
      <ToneMapping mode={TONE[look.toneMapping]} />
      <BrightnessContrast brightness={look.brightness} contrast={look.contrast} />
      <HueSaturation saturation={look.saturation} />
      <ClampFX />
    </EffectComposer>
  )
}
