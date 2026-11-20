import { useGame } from './store'
import { parseLaunchOptions } from './launchOptions'
import { detectGpu } from '../quality/tierDetect'
import { installDevHooks } from './devHooks'

/** Runs once before React mounts: URL options, GPU tier, dev hooks, launch phase. */
export function bootstrap(): void {
  const opts = parseLaunchOptions(window.location.search)
  const gpu = detectGpu()
  const { setSettings, setPresenter, dispatch } = useGame.getState()

  useGame.setState({ gpu, debug: opts.debug })
  setSettings({
    quality: opts.quality ?? gpu.tier,
    qualityAuto: !opts.quality,
    forcedBranch: opts.branch ?? null,
  })
  if (opts.presenter) setPresenter({ armed: true })
  if (import.meta.env.DEV || opts.debug) installDevHooks()
  if (opts.phase && opts.phase !== 'title') dispatch({ type: 'JUMP', phase: opts.phase, branch: opts.branch })
}
