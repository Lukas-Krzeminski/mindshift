import { describe, expect, it } from 'vitest'
import {
  initialFlow,
  otherWorldAvailable,
  transition,
  type FlowContext,
  type FlowEvent,
  type FlowState,
} from '../src/game/phases'

const normal: FlowContext = { forcedBranch: null }

function run(events: FlowEvent[], ctx: FlowContext = normal, start: FlowState = initialFlow): FlowState {
  return events.reduce((s, e) => transition(s, e, ctx), start)
}

const toPuzzle3: FlowEvent[] = [
  { type: 'START' },
  { type: 'NEXT' }, // clinic -> brainDive
  { type: 'NEXT' }, // brainDive -> tutorial
  { type: 'PUZZLE_SOLVED' }, // tutorial -> puzzle1
  { type: 'PUZZLE_SOLVED' }, // puzzle1 -> puzzle2
  { type: 'PUZZLE_SOLVED' }, // puzzle2 -> puzzle3
]

describe('main flow', () => {
  it('walks title -> puzzle3 in order', () => {
    expect(run(toPuzzle3).phase).toBe('puzzle3')
  })

  it('puzzle 1 and 2 timeouts still continue (only puzzle 3 decides the world)', () => {
    const s = run([{ type: 'START' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'PUZZLE_SOLVED' }, { type: 'PUZZLE_TIMEOUT' }])
    expect(s.phase).toBe('puzzle2')
    expect(s.branch).toBeNull()
    const s3 = transition(s, { type: 'PUZZLE_TIMEOUT' }, normal)
    expect(s3.phase).toBe('puzzle3')
    expect(s3.branch).toBeNull()
  })

  it('tutorial cannot time out', () => {
    const atTutorial = run([{ type: 'START' }, { type: 'NEXT' }, { type: 'NEXT' }])
    expect(transition(atTutorial, { type: 'PUZZLE_TIMEOUT' }, normal)).toBe(atTutorial)
  })

  it('solving puzzle 3 enters the positive world; timeout enters the challenging world', () => {
    const solved = run([...toPuzzle3, { type: 'PUZZLE_SOLVED' }])
    expect(solved.phase).toBe('tripPositive')
    expect(solved.branch).toBe('positive')
    const timedOut = run([...toPuzzle3, { type: 'PUZZLE_TIMEOUT' }])
    expect(timedOut.phase).toBe('tripChallenging')
    expect(timedOut.branch).toBe('challenging')
  })

  it('world -> lantern ending -> results (no return to the clinic)', () => {
    const mid = run([...toPuzzle3, { type: 'PUZZLE_SOLVED' }, { type: 'WORLD_COMPLETE' }])
    expect(mid.phase).toBe('ending')
    const s = transition(mid, { type: 'NEXT' }, normal)
    expect(s.phase).toBe('results')
    expect(s.visitedWorlds).toEqual(['positive'])
  })

  it('invalid events are no-ops that return the same object', () => {
    expect(transition(initialFlow, { type: 'NEXT' }, normal)).toBe(initialFlow)
    const atClinic = run([{ type: 'START' }])
    expect(transition(atClinic, { type: 'WORLD_COMPLETE' }, normal)).toBe(atClinic)
  })
})

describe('presenter override', () => {
  it('forces the branch regardless of solve/timeout', () => {
    expect(run([...toPuzzle3, { type: 'PUZZLE_SOLVED' }], { forcedBranch: 'challenging' }).phase).toBe('tripChallenging')
    expect(run([...toPuzzle3, { type: 'PUZZLE_TIMEOUT' }], { forcedBranch: 'positive' }).phase).toBe('tripPositive')
  })

  it('JUMP reaches any phase; jumping to a world sets its branch', () => {
    const s = transition(initialFlow, { type: 'JUMP', phase: 'tripChallenging' }, normal)
    expect(s.phase).toBe('tripChallenging')
    expect(s.branch).toBe('challenging')
    expect(s.bonusRun).toBe(false)
  })

  it('JUMP to results without a branch picks one so the other-world button works', () => {
    const s = transition(initialFlow, { type: 'JUMP', phase: 'results' }, normal)
    expect(s.branch).toBe('positive')
    expect(otherWorldAvailable(s)).toBe('challenging')
  })

  it('JUMP to title resets everything', () => {
    const deep = run([...toPuzzle3, { type: 'PUZZLE_SOLVED' }])
    expect(transition(deep, { type: 'JUMP', phase: 'title' }, normal)).toEqual(initialFlow)
  })
})

describe('other-world run from Results', () => {
  const atResults = (solve: boolean) =>
    run([...toPuzzle3, { type: solve ? 'PUZZLE_SOLVED' : 'PUZZLE_TIMEOUT' }, { type: 'WORLD_COMPLETE' }, { type: 'NEXT' }, { type: 'NEXT' }])

  it.each([
    [true, 'tripChallenging'],
    [false, 'tripPositive'],
  ] as const)('after solved=%s the button opens %s', (solved, expected) => {
    const s = transition(atResults(solved), { type: 'PLAY_OTHER_WORLD' }, normal)
    expect(s.phase).toBe(expected)
    expect(s.bonusRun).toBe(true)
  })

  it('bonus world returns straight to results (no second zoom-out) and the button disappears', () => {
    const bonus = transition(atResults(true), { type: 'PLAY_OTHER_WORLD' }, normal)
    const back = transition(bonus, { type: 'WORLD_COMPLETE' }, normal)
    expect(back.phase).toBe('results')
    expect(back.bonusRun).toBe(false)
    expect(back.visitedWorlds.sort()).toEqual(['challenging', 'positive'])
    expect(otherWorldAvailable(back)).toBeNull()
    expect(transition(back, { type: 'PLAY_OTHER_WORLD' }, normal)).toBe(back)
  })

  it('restart from results', () => {
    expect(transition(atResults(true), { type: 'RESTART' }, normal)).toEqual(initialFlow)
  })
})
