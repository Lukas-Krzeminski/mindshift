import { PHASES, type Phase } from './phases'
import type { Branch } from './outcome'
import { isQualityTier, type QualityTier } from '../quality/presets'

/**
 * URL parameters for rehearsal and testing, e.g.
 *   ?presenter=1                    arm the presenter panel / hotkeys
 *   ?phase=tripChallenging          start directly in a phase
 *   ?branch=positive                force the required Puzzle 3 outcome (and the world for later phases)
 *   ?quality=medium                 lock a quality tier (disables auto)
 *   ?debug=1                        stats overlay + window.__mindshift hooks
 */
export interface LaunchOptions {
  phase?: Phase
  branch?: Branch
  quality?: QualityTier
  presenter: boolean
  debug: boolean
}

const truthy = (v: string | null) => v !== null && v !== '0' && v !== 'false'

export function parseLaunchOptions(search: string): LaunchOptions {
  const p = new URLSearchParams(search)
  const phase = p.get('phase')
  const branch = p.get('branch')
  const quality = p.get('quality')
  return {
    phase: phase && (PHASES as readonly string[]).includes(phase) ? (phase as Phase) : undefined,
    branch: branch === 'positive' || branch === 'challenging' ? branch : undefined,
    quality: isQualityTier(quality) ? quality : undefined,
    presenter: truthy(p.get('presenter')),
    debug: truthy(p.get('debug')),
  }
}
