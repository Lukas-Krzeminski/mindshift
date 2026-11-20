import { GameCanvas } from './scenes/GameCanvas'
import { UIRoot } from './ui/UIRoot'

export function App() {
  return (
    <div className="app">
      <GameCanvas />
      <UIRoot />
    </div>
  )
}
