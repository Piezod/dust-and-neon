export type MusicTrack = 'menu' | 'exploration' | 'combat' | 'intermission' | 'game-over'

const TRACK_NOTES: Readonly<Record<MusicTrack, readonly number[]>> = {
  menu: [110, 164.81, 146.83, 123.47, 98, 146.83, 130.81, 164.81],
  exploration: [82.41, 110, 98, 73.42, 87.31, 130.81, 110, 98],
  combat: [146.83, 196, 174.61, 220, 164.81, 246.94, 196, 220],
  intermission: [98, 130.81, 110, 87.31, 123.47, 146.83, 110, 82.41],
  'game-over': [73.42, 82.41, 98, 65.41, 87.31, 73.42, 61.74, 82.41],
}

interface TrackBus {
  readonly gain: GainNode
  interval: number | null
  fadeTimer: number | null
  step: number
  wind: AudioBufferSourceNode | null
}

export class ProceduralMusicEngine {
  private readonly context: AudioContext
  private readonly destination: AudioNode
  private readonly buses: readonly [TrackBus, TrackBus]
  private readonly delay: DelayNode
  private readonly delayFeedback: GainNode
  private readonly delayReturn: GainNode
  private readonly noiseBuffer: AudioBuffer
  private activeBus: 0 | 1 | null = null
  private currentTrack: MusicTrack = 'menu'
  private enabled = true
  private disposed = false

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context
    this.destination = destination
    this.delay = context.createDelay(1.1)
    this.delay.delayTime.value = 0.34
    this.delayFeedback = context.createGain()
    this.delayFeedback.gain.value = 0.19
    this.delayReturn = context.createGain()
    this.delayReturn.gain.value = 0.22
    this.delay.connect(this.delayReturn)
    this.delayReturn.connect(destination)
    this.delayReturn.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delay)
    this.noiseBuffer = this.createNoiseBuffer()
    this.buses = [this.createBus(), this.createBus()]
  }

  get track(): MusicTrack {
    return this.currentTrack
  }

  get activeTrackCount(): number {
    return this.buses.filter((bus) => bus.interval !== null).length
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) return
    this.enabled = enabled
    if (enabled) {
      if (this.activeBus !== null) {
        const active = this.buses[this.activeBus]
        if (active.fadeTimer !== null) window.clearTimeout(active.fadeTimer)
        active.fadeTimer = null
        this.fade(active, 1, 0.35)
        return
      }
      this.setTrack(this.currentTrack)
      return
    }
    if (this.activeBus === null) return
    const index = this.activeBus
    const bus = this.buses[index]
    this.fade(bus, 0, 0.45)
    bus.fadeTimer = window.setTimeout(() => {
      this.stopBus(bus)
      this.activeBus = null
    }, 500)
  }

  setTrack(track: MusicTrack): void {
    if (this.disposed) return
    if (this.currentTrack === track && this.activeBus !== null && this.buses[this.activeBus].interval !== null) return
    this.currentTrack = track
    if (!this.enabled) return
    const previous = this.activeBus
    const next: 0 | 1 = previous === 0 ? 1 : 0
    const nextBus = this.buses[next]
    this.startBus(nextBus, track)
    this.fade(nextBus, 1, 1.4)
    if (previous !== null) {
      const previousBus = this.buses[previous]
      this.fade(previousBus, 0, 1.4)
      previousBus.fadeTimer = window.setTimeout(() => this.stopBus(previousBus), 1500)
    }
    this.activeBus = next
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const bus of this.buses) this.stopBus(bus)
    this.delay.disconnect()
    this.delayFeedback.disconnect()
    this.delayReturn.disconnect()
  }

  private createBus(): TrackBus {
    const gain = this.context.createGain()
    gain.gain.value = 0
    gain.connect(this.destination)
    gain.connect(this.delay)
    return { gain, interval: null, fadeTimer: null, step: 0, wind: null }
  }

  private startBus(bus: TrackBus, track: MusicTrack): void {
    this.stopBus(bus)
    bus.step = 0
    bus.gain.gain.cancelScheduledValues(this.context.currentTime)
    bus.gain.gain.setValueAtTime(0, this.context.currentTime)
    const wind = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const windGain = this.context.createGain()
    wind.buffer = this.noiseBuffer
    wind.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = track === 'combat' ? 680 : track === 'game-over' ? 230 : 390
    filter.Q.value = 0.65
    windGain.gain.value = track === 'combat' ? 0.018 : 0.026
    wind.connect(filter)
    filter.connect(windGain)
    windGain.connect(bus.gain)
    wind.start()
    bus.wind = wind
    const playNextStep = (): void => this.playStep(bus, track)
    playNextStep()
    bus.interval = window.setInterval(playNextStep, this.stepMilliseconds(track))
  }

  private stopBus(bus: TrackBus): void {
    if (bus.interval !== null) window.clearInterval(bus.interval)
    if (bus.fadeTimer !== null) window.clearTimeout(bus.fadeTimer)
    bus.interval = null
    bus.fadeTimer = null
    if (bus.wind) {
      try { bus.wind.stop() } catch { /* The source can already be stopped by a crossfade. */ }
      bus.wind.disconnect()
      bus.wind = null
    }
    bus.gain.gain.cancelScheduledValues(this.context.currentTime)
    bus.gain.gain.setValueAtTime(0, this.context.currentTime)
  }

  private playStep(bus: TrackBus, track: MusicTrack): void {
    if (this.disposed || !this.enabled) return
    const notes = TRACK_NOTES[track]
    const step = bus.step++
    const note = notes[Math.floor(step / 2) % notes.length]
    if (step % 4 === 0) {
      this.playTone(bus.gain, note / 2, 1.05, 'sine', 0.045)
      this.playTone(bus.gain, note * 1.5, 1.2, 'triangle', 0.016)
    }
    if (step % 2 === 0) this.playTone(bus.gain, note / 2, 0.32, 'triangle', 0.024)
    if (step % 3 === 1) this.playTone(bus.gain, note * 2, 0.24, 'sine', 0.012)
    if (step % 8 === 0) this.playKick(bus.gain)
    else if (track === 'combat' && step % 4 === 2 || step % 8 === 5) this.playNoiseTap(bus.gain)
  }

  private playTone(destination: AudioNode, frequency: number, duration: number, waveform: OscillatorType, volume: number): void {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    const now = this.context.currentTime
    oscillator.type = waveform
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.detune.setValueAtTime(waveform === 'triangle' ? -4 : 0, now)
    filter.type = 'lowpass'
    filter.frequency.value = waveform === 'triangle' ? 900 : 1450
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.045)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(filter)
    filter.connect(envelope)
    envelope.connect(destination)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.04)
    oscillator.onended = () => {
      oscillator.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
  }

  private playKick(destination: AudioNode): void {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    const now = this.context.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(92, now)
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.16)
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(0.16, now + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.19)
    oscillator.connect(envelope)
    envelope.connect(destination)
    oscillator.start(now)
    oscillator.stop(now + 0.21)
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
  }

  private playNoiseTap(destination: AudioNode): void {
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const envelope = this.context.createGain()
    const now = this.context.currentTime
    source.buffer = this.noiseBuffer
    filter.type = 'bandpass'
    filter.frequency.value = 1900
    filter.Q.value = 0.8
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(0.035, now + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.075)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(destination)
    source.start(now, 0, 0.08)
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
  }

  private fade(bus: TrackBus, target: number, duration: number): void {
    const now = this.context.currentTime
    bus.gain.gain.cancelScheduledValues(now)
    bus.gain.gain.setValueAtTime(bus.gain.gain.value, now)
    bus.gain.gain.linearRampToValueAtTime(target, now + duration)
  }

  private stepMilliseconds(track: MusicTrack): number {
    if (track === 'combat') return 390
    if (track === 'game-over') return 760
    if (track === 'menu') return 700
    if (track === 'intermission') return 590
    return 650
  }

  private createNoiseBuffer(): AudioBuffer {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < channel.length; index++) channel[index] = (Math.random() * 2 - 1) * 0.3
    return buffer
  }
}
