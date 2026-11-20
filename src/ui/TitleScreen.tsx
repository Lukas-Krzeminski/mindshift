import { useGame } from '../game/store'
import { audio } from '../audio/AudioManager'
import { CONTENT_NOTE } from '../content/captions'

export function TitleScreen() {
  const dispatch = useGame((s) => s.dispatch)
  const volume = useGame((s) => s.settings.volume)

  const begin = () => {
    audio.unlock() // browsers only allow audio after a user gesture
    audio.setVolume(volume)
    audio.chime()
    dispatch({ type: 'START' })
  }

  return (
    <div className="screen title-screen">
      <div className="title-block">
        <p className="eyebrow">An interactive psychology experience</p>
        <h1 className="logo">
          MIND<span className="logo-slash">//</span>SHIFT
        </h1>
        <p className="subtitle">Inside the Psychedelic Brain</p>
        <button className="btn btn-primary btn-lg" onClick={begin} autoFocus>
          Begin
        </button>
      </div>
      <p className="content-note">{CONTENT_NOTE}</p>
    </div>
  )
}
