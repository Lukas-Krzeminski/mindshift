import type { QualityTier } from './presets'

export interface GpuInfo {
  renderer: string
  tier: QualityTier
}

/**
 * Classifies a WebGL renderer string (e.g. Chrome's ANGLE string) into a starting tier.
 * The runtime FPS monitor can still step the tier down afterwards.
 */
export function classifyRenderer(renderer: string): QualityTier {
  const r = renderer.toLowerCase()
  if (/swiftshader|llvmpipe|software|basic render|softpipe/.test(r)) return 'low'
  // Discrete GPUs. Intel's *integrated* Arc (e.g. "Arc(TM) 140T") must not match;
  // discrete Intel Arc cards are named A/B + 3 digits (A770, B580).
  if (/nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|arc\(tm\) [ab]\d{3}|arc [ab]\d{3}/.test(r)) return 'high'
  return 'medium'
}

export function detectGpu(): GpuInfo {
  let renderer = 'unknown'
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return { renderer: 'no WebGL', tier: 'low' }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    return { renderer, tier: 'medium' }
  }
  return { renderer, tier: classifyRenderer(renderer) }
}
