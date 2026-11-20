/**
 * Web Audio manager. Browsers block audio until a user gesture, so unlock() is
 * called from the title screen's "Begin" click.
 * Buses: master -> (music | sfx | ambience). Ambience and effects are synthesized; the two
 * worlds can also play a song file (public/assets/audio/good-world.mp3 / bad-world.mp3).
 * A missing song is simply skipped and the synthesized ambience plays as before.
 */

export type SongName = 'good' | 'bad'
const SONG_LEVEL = 0.75
/** Seconds a world's song takes to fade in when its scene starts. */
const SONG_FADE_IN = 2
const SONG_URL = (name: SongName) => `${import.meta.env.BASE_URL}assets/audio/${name}-world.mp3`

// C major pentatonic over two octaves, one note per signal color (8), so solving a lattice plays a chord.
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]

export type AmbienceName = 'clinic' | 'brain' | 'puzzle' | 'shallows' | 'maze' | 'results'

const AMBIENCE_LEVEL: Record<AmbienceName, number> = {
  clinic: 0.42,
  brain: 0.4,
  puzzle: 0.32,
  shallows: 0.5,
  maze: 0.5,
  results: 0.3,
}

class AudioManager {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  music: GainNode | null = null
  sfx: GainNode | null = null
  ambBus: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private volume = 0.8
  private amb: { name: AmbienceName; gain: GainNode; stop: () => void } | null = null
  private heartBpm = 0
  private heartTimer: number | null = null
  private pendingAmbience: AmbienceName | null = null
  private songs = new Map<SongName, { el: HTMLAudioElement; gain: GainNode; ok: boolean }>()
  private currentSong: SongName | null = null
  private pendingSong: SongName | null | undefined = undefined

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
      this.ambBus = this.bus()
      this.reverb = this.ctx.createConvolver()
      this.reverb.buffer = this.impulse(2.8)
      const wet = this.ctx.createGain()
      wet.gain.value = 0.35
      this.reverb.connect(wet).connect(this.master)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.pendingAmbience) this.ambience(this.pendingAmbience)
    if (this.pendingSong !== undefined) this.song(this.pendingSong)
  }

  /** Crossfades to a world's song (null = fade the song out). The ambience ducks under it. */
  song(name: SongName | null): void {
    if (!this.ctx || !this.music || this.ctx.state !== 'running') {
      this.pendingSong = name
      return
    }
    this.pendingSong = undefined
    if (this.currentSong === name) return
    const now = this.ctx.currentTime
    const oldName = this.currentSong
    const old = oldName ? this.songs.get(oldName) : null
    if (old) {
      old.gain.gain.cancelScheduledValues(now)
      old.gain.gain.setTargetAtTime(0, now, 0.7)
      // pause once faded, unless that song was picked again meanwhile
      window.setTimeout(() => {
        if (this.currentSong !== oldName) old.el.pause()
      }, 3500)
    }
    this.currentSong = name
    if (!name) {
      this.duck(false)
      return
    }
    let s = this.songs.get(name)
    if (!s) {
      const el = new Audio(SONG_URL(name))
      el.loop = true
      el.preload = 'auto'
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      this.ctx.createMediaElementSource(el).connect(gain).connect(this.music)
      const entry = { el, gain, ok: true }
      el.addEventListener('error', () => {
        entry.ok = false
        if (this.currentSong === name) this.duck(false)
      })
      this.songs.set(name, entry)
      s = entry
    }
    if (!s.ok) {
      this.duck(false)
      return
    }
    const entry = s
    const ctx = this.ctx
    // start from silence and from the top of the song (a paused song would otherwise resume mid-way)
    entry.gain.gain.cancelScheduledValues(now)
    entry.gain.gain.setValueAtTime(0, now)
    if (entry.el.paused) entry.el.currentTime = 0
    void entry.el
      .play()
      .then(() => {
        if (this.currentSong !== name) return
        // fade in over SONG_FADE_IN seconds from the moment it actually starts playing
        const t = ctx.currentTime
        entry.gain.gain.cancelScheduledValues(t)
        entry.gain.gain.setValueAtTime(0, t)
        entry.gain.gain.linearRampToValueAtTime(SONG_LEVEL, t + SONG_FADE_IN)
        this.duck(true)
      })
      .catch(() => {
        entry.ok = false
        this.duck(false)
      })
  }

  /** Lower the synthesized ambience while a song plays. */
  private duck(on: boolean): void {
    if (!this.ctx || !this.ambBus) return
    this.ambBus.gain.setTargetAtTime(on ? 0.22 : 1, this.ctx.currentTime, 0.8)
  }

  private bus(): GainNode {
    const g = this.ctx!.createGain()
    g.connect(this.master!)
    return g
  }

  /** Synthetic reverb tail (decaying stereo noise). */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    }
    return buf
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
  }

  /** One enveloped oscillator voice into a bus (+ optional reverb send). */
  tone(freq: number, opts: { type?: OscillatorType; dur?: number; gain?: number; delay?: number; bus?: GainNode | null; reverb?: number; attack?: number } = {}): void {
    if (!this.ctx) return
    const { type = 'sine', dur = 1.2, gain = 0.15, delay = 0, bus = this.sfx, reverb = 0.5, attack = 0.02 } = opts
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(gain, t0 + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(env)
    if (bus) env.connect(bus)
    if (this.reverb && reverb > 0) {
      const send = this.ctx.createGain()
      send.gain.value = reverb
      env.connect(send).connect(this.reverb)
    }
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  chime(freqs: number[] = [523.25, 783.99], duration = 1.6): void {
    freqs.forEach((f, i) => this.tone(f, { dur: duration, gain: 0.16, delay: i * 0.12 }))
  }

  note(colorIndex: number): void {
    const f = PENTATONIC[colorIndex % PENTATONIC.length]
    this.tone(f, { dur: 1.8, gain: 0.14, type: 'triangle' })
    this.tone(f * 2, { dur: 1.2, gain: 0.05, delay: 0.03 })
  }

  resolveChord(): void {
    PENTATONIC.slice(0, 5).forEach((f, i) => this.tone(f, { dur: 2.6, gain: 0.1, delay: i * 0.07, type: 'triangle' }))
    ;[261.63, 392.0, 523.25].forEach((f) => this.tone(f, { dur: 3.4, gain: 0.08, delay: 0.4, attack: 0.25 }))
  }

  heartbeat(gain = 1): void {
    this.tone(62, { dur: 0.22, gain: 0.32 * gain, reverb: 0.1 })
    this.tone(55, { dur: 0.26, gain: 0.26 * gain, delay: 0.2, reverb: 0.1 })
  }

  timeUp(): void {
    this.tone(146.83, { dur: 2.4, gain: 0.12, type: 'sawtooth', reverb: 0.7 })
    this.tone(155.56, { dur: 2.4, gain: 0.1, type: 'sawtooth', reverb: 0.7 })
  }

  blip(freq = 1046.5): void {
    this.tone(freq, { dur: 0.25, gain: 0.05, reverb: 0.3 })
  }

  /** Continuous heartbeat for the challenging world; 0 stops it. */
  setHeartRate(bpm: number): void {
    this.heartBpm = bpm
    if (bpm > 0 && this.heartTimer === null) {
      const loop = () => {
        if (this.heartBpm <= 0) {
          this.heartTimer = null
          return
        }
        this.heartbeat(0.8)
        this.heartTimer = window.setTimeout(loop, 60000 / this.heartBpm)
      }
      loop()
    }
  }

  /** Crossfades to a generative ambience bed for the current scene (null = silence). */
  ambience(name: AmbienceName | null): void {
    if (!this.ctx || !this.ambBus || this.ctx.state !== 'running') {
      this.pendingAmbience = name
      return
    }
    this.pendingAmbience = null
    if (this.amb?.name === name) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const old = this.amb
    this.amb = null
    if (old) {
      old.gain.gain.cancelScheduledValues(now)
      old.gain.gain.setTargetAtTime(0, now, 0.6)
      window.setTimeout(old.stop, 3500)
    }
    if (name !== 'maze') this.setHeartRate(0)
    if (!name) return

    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(this.ambBus)
    out.gain.setTargetAtTime(AMBIENCE_LEVEL[name], now, 0.9)
    const send = ctx.createGain()
    send.gain.value = 0.6
    out.connect(send)
    if (this.reverb) send.connect(this.reverb)
    const stops: (() => void)[] = []

    const pad = (freqs: number[], type: OscillatorType, cutoff: number, lfoRate: number, detune = 7) => {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      filter.Q.value = 0.6
      filter.connect(out)
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = lfoRate
      lfoGain.gain.value = cutoff * 0.35
      lfo.connect(lfoGain).connect(filter.frequency)
      lfo.start()
      stops.push(() => lfo.stop())
      for (const f of freqs) {
        for (const d of [-detune, detune]) {
          const o = ctx.createOscillator()
          o.type = type
          o.frequency.value = f
          o.detune.value = d
          const g = ctx.createGain()
          g.gain.value = 0.32 / freqs.length
          o.connect(g).connect(filter)
          o.start()
          stops.push(() => o.stop())
        }
      }
    }
    const sprinkle = (notes: number[], minGap: number, maxGap: number, gain: number) => {
      let timer = 0
      const tick = () => {
        this.tone(notes[Math.floor(Math.random() * notes.length)], { dur: 3, gain, bus: out, reverb: 0.9, attack: 0.01 })
        timer = window.setTimeout(tick, (minGap + Math.random() * (maxGap - minGap)) * 1000)
      }
      timer = window.setTimeout(tick, 1200)
      stops.push(() => window.clearTimeout(timer))
    }

    switch (name) {
      case 'clinic':
        pad([174.61, 220.0, 261.63, 329.63], 'sine', 900, 0.05)
        break
      case 'results':
        pad([174.61, 261.63, 329.63, 392.0], 'sine', 800, 0.04)
        break
      case 'brain':
        pad([73.42, 110.0, 174.61, 261.63, 329.63], 'triangle', 650, 0.06)
        sprinkle([1046.5, 1174.66, 1567.98], 2.5, 5, 0.025)
        break
      case 'puzzle':
        pad([73.42, 110.0, 146.83, 220.0], 'triangle', 520, 0.08)
        break
      case 'shallows':
        pad([130.81, 164.81, 196.0, 246.94, 293.66], 'triangle', 1500, 0.05)
        sprinkle([523.25, 587.33, 659.25, 783.99, 880.0, 1046.5], 1.6, 3.8, 0.05)
        break
      case 'maze':
        pad([55.0, 58.27], 'sawtooth', 300, 0.11, 3)
        pad([880.0, 932.33], 'sine', 2000, 0.03, 2)
        this.setHeartRate(96)
        break
    }
    this.amb = {
      name,
      gain: out,
      stop: () => {
        stops.forEach((s) => {
          try {
            s()
          } catch {
            /* already stopped */
          }
        })
        out.disconnect()
      },
    }
  }
}

export const audio = new AudioManager()
