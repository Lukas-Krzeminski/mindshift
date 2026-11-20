import { beforeEach, describe, expect, it } from 'vitest'
import { parseLaunchOptions } from '../src/game/launchOptions'
import { classifyRenderer } from '../src/quality/tierDetect'
import { lowerTier } from '../src/quality/presets'
import { defaultSettings, selectTotalScore, useGame } from '../src/game/store'
import { initialFlow } from '../src/game/phases'
import { REFERENCES } from '../src/content/references'
import { CLINIC_CAPTIONS, INTEGRATION, LAB_LINES, TAKEAWAYS } from '../src/content/captions'
import { SYMBOL_LIST } from '../src/content/symbols'
import { useSymbols } from '../src/ui/symbolStore'

describe('launch options', () => {
  it('parses rehearsal URLs', () => {
    expect(parseLaunchOptions('?presenter=1&phase=tripChallenging&branch=positive&quality=low&debug=1')).toEqual({
      phase: 'tripChallenging',
      branch: 'positive',
      quality: 'low',
      presenter: true,
      debug: true,
    })
  })

  it('ignores junk values', () => {
    expect(parseLaunchOptions('?phase=nope&branch=evil&quality=ultra&presenter=0')).toEqual({
      phase: undefined,
      branch: undefined,
      quality: undefined,
      presenter: false,
      debug: false,
    })
  })
})

describe('GPU tiering', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Laptop GPU (0x00002F58) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (8GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    ['Apple GPU', 'medium'],
  ] as const)('%s -> %s', (renderer, tier) => {
    expect(classifyRenderer(renderer)).toBe(tier)
  })

  it('steps down but never below low', () => {
    expect(lowerTier('high')).toBe('medium')
    expect(lowerTier('low')).toBe('low')
  })
})

describe('store', () => {
  beforeEach(() => {
    useGame.setState({ flow: initialFlow, flowSeq: 0, scoreEntries: [], settings: defaultSettings })
  })

  it('dispatch reports no-ops and bumps flowSeq only on real transitions', () => {
    const { dispatch } = useGame.getState()
    expect(dispatch({ type: 'NEXT' })).toBe(false)
    expect(useGame.getState().flowSeq).toBe(0)
    expect(dispatch({ type: 'START' })).toBe(true)
    expect(useGame.getState().flowSeq).toBe(1)
  })

  it('a fresh run clears the previous score; jumps keep it', () => {
    const s = useGame.getState()
    s.addScore({ label: 'old', points: 500 })
    s.dispatch({ type: 'JUMP', phase: 'results' })
    expect(selectTotalScore(useGame.getState())).toBe(500)
    useGame.getState().dispatch({ type: 'RESTART' })
    expect(selectTotalScore(useGame.getState())).toBe(0)
  })

  it('a new phase always un-pauses timers', () => {
    const s = useGame.getState()
    s.setSettings({ timersPaused: true })
    s.dispatch({ type: 'START' })
    expect(useGame.getState().settings.timersPaused).toBe(false)
  })
})

describe('content integrity', () => {
  const ids = new Set(REFERENCES.map((r) => r.id))
  const captions = [
    ...CLINIC_CAPTIONS,
    ...LAB_LINES,
    ...TAKEAWAYS,
    INTEGRATION.caption,
    ...SYMBOL_LIST.map((x) => ({ id: x.id, text: `${x.title}. ${x.meaning}`, sources: x.sources })),
  ]

  it('every factual caption cites a known reference id', () => {
    for (const c of captions) for (const src of c.sources) expect(ids.has(src), `${c.id} -> ${src}`).toBe(true)
  })

  it('never claims psilocybin treats or cures cancer, or treats nerve damage', () => {
    const text = captions.map((c) => c.text.toLowerCase()).join(' ')
    expect(text).not.toMatch(/cures?\b|treats cancer|neuropathy|nerve damage/)
  })
})

describe('symbol cards', () => {
  beforeEach(() => {
    useGame.setState({ flow: initialFlow, flowSeq: 0, scoreEntries: [], settings: defaultSettings })
    useSymbols.getState().clear()
  })

  it('show one at a time, in order, never repeating within a phase', () => {
    const s = useSymbols.getState()
    s.show('room')
    s.show('capsule')
    s.show('room')
    expect(useSymbols.getState().current?.id).toBe('room')
    expect(useSymbols.getState().queue).toEqual(['capsule'])
    useSymbols.getState().next()
    expect(useSymbols.getState().current?.id).toBe('capsule')
    useSymbols.getState().next()
    expect(useSymbols.getState().current).toBeNull()
  })

  it('clear the moment the phase changes', () => {
    useSymbols.getState().show('room')
    useSymbols.getState().show('capsule')
    useGame.getState().dispatch({ type: 'START' })
    expect(useSymbols.getState().current).toBeNull()
    expect(useSymbols.getState().queue).toEqual([])
  })

  it('stay short enough to read aloud', () => {
    for (const x of SYMBOL_LIST) expect(x.meaning.split(' ').length, x.id).toBeLessThanOrEqual(22)
  })
})
