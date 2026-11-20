/**
 * Minimal Web Audio manager. Browsers block audio until a user gesture, so
 * unlock() is called from the title screen's "Begin" click.
 * Buses: master -> (music | sfx | ambience). Grows in D7 (music, soundscapes).
 */
class AudioManager {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  music: GainNode | null = null
  sfx: GainNode | null = null
  ambience: GainNode | null = null
  private volume = 0.8

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
      this.music = this.bus()
      this.sfx = this.bus()
      this.ambience = this.bus()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private bus(): GainNode {
    const g = this.ctx!.createGain()
    g.connect(this.master!)
    return g
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
  }

  /** Soft two-note chime (synthesized, no asset needed). */
  chime(freqs: number[] = [523.25, 783.99], duration = 1.6): void {
    if (!this.ctx || !this.sfx) return
    const t0 = this.ctx.currentTime
    freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const start = t0 + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain).connect(this.sfx!)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    })
  }
}

export const audio = new AudioManager()
