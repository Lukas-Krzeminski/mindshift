export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityPreset {
  /** Device-pixel-ratio range handed to the R3F canvas. */
  dpr: [number, number]
  /** 0 disables shadows entirely. */
  shadowMapSize: number
  /** MSAA samples for the postprocessing composer (0 = off). */
  msaa: number
  /** Multiplier for particle / instance counts in every scene. */
  particleScale: number
  reflectiveWater: boolean
  depthOfField: boolean
  bloom: boolean
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  high: { dpr: [1, 1.5], shadowMapSize: 2048, msaa: 4, particleScale: 1, reflectiveWater: true, depthOfField: true, bloom: true },
  medium: { dpr: [1, 1], shadowMapSize: 1024, msaa: 0, particleScale: 0.5, reflectiveWater: false, depthOfField: false, bloom: true },
  low: { dpr: [0.75, 0.75], shadowMapSize: 0, msaa: 0, particleScale: 0.25, reflectiveWater: false, depthOfField: false, bloom: true },
}

export const TIER_ORDER: QualityTier[] = ['high', 'medium', 'low']

export function lowerTier(tier: QualityTier): QualityTier {
  const i = TIER_ORDER.indexOf(tier)
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)]
}

export const isQualityTier = (v: unknown): v is QualityTier =>
  v === 'high' || v === 'medium' || v === 'low'
