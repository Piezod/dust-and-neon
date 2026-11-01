import type { GameEvent, GameEventBus } from '../events/GameEventBus'
import type { GameSettings } from '../core/GameSettings.types'
import type { SettingsStore } from '../app/SettingsStore'
import { ProceduralMusicEngine, type MusicTrack } from './ProceduralMusicEngine'

export type { MusicTrack } from './ProceduralMusicEngine'

const SOUND_FREQUENCIES: Readonly<Record<string, number>> = {
  'menu.click': 660,
  'weapon.revolver': 145,
  'weapon.impact': 240,
  'weapon.plasma': 410,
  'player.damage': 96,
  'player.death': 54,
  'ability.dash': 330,
  'enemy.spawn': 92,
  'enemy.attack': 128,
  'enemy.damage': 270,
  'enemy.death': 72,
  'loot.health': 523,
  'loot.energy': 740,
  'loot.gold': 880,
  'upgrade.purchased': 587,
  'perk.selected': 784,
  'perk.iron-heart': 392,
  'perk.quickdraw': 698,
  'achievement.unlocked': 988,
  'wave.started': 392,
  'wave.completed': 587,
  'boss.intro': 82,
  'boss.damage': 310,
  'boss.defeated': 660,
}

export class AudioManager {
  readonly placeholderAudio = true
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private effectsGain: GainNode | null = null
  private musicEngine: ProceduralMusicEngine | null = null
  private readonly sfxVoices = new Set<AudioScheduledSourceNode>()
  private readonly maxSfxVoices = 18
  private noiseBuffer: AudioBuffer | null = null
  private currentTrack: MusicTrack = 'menu'
  private unlocked = false
  private disposed = false
  private readonly lastPlayed = new Map<string, number>()
  private settings: GameSettings
  private readonly unsubscribeSettings: () => void
  private readonly unsubscribeEvents: () => void

  constructor(settings: SettingsStore, events: GameEventBus) {
    this.settings = settings.settings
    this.unsubscribeSettings = settings.subscribe((value) => this.applySettings(value))
    this.unsubscribeEvents = events.subscribe((event) => this.onEvent(event))
  }

  async unlock(): Promise<void> {
    if (this.disposed) return
    try {
      if (!this.context) {
        const AudioContextConstructor = window.AudioContext
        if (!AudioContextConstructor) return
        this.context = new AudioContextConstructor()
        this.masterGain = this.context.createGain()
        this.musicGain = this.context.createGain()
        this.effectsGain = this.context.createGain()
        this.musicGain.connect(this.masterGain)
        this.effectsGain.connect(this.masterGain)
        this.masterGain.connect(this.context.destination)
        this.musicEngine = new ProceduralMusicEngine(this.context, this.musicGain)
        this.noiseBuffer = this.createNoiseBuffer()
        this.applySettings(this.settings)
      }
      if (this.context.state === 'suspended') await this.context.resume()
      this.unlocked = this.context.state === 'running'
      if (this.unlocked) {
        this.musicEngine?.setEnabled(this.settings.musicEnabled)
        this.musicEngine?.setTrack(this.currentTrack)
      }
    } catch {
      this.unlocked = false
    }
  }

  setMusicTrack(track: MusicTrack): void {
    if (this.currentTrack === track) return
    this.currentTrack = track
    this.musicEngine?.setTrack(track)
  }

  playSfx(id: string): void {
    if (this.disposed || !this.unlocked || !this.context || !this.effectsGain) return
    const now = this.context.currentTime
    const previous = this.lastPlayed.get(id) ?? -Infinity
    if (now - previous < (id.includes('attack') || id.includes('damage') ? 0.075 : 0.045)) return
    if (this.sfxVoices.size >= this.maxSfxVoices) return
    this.lastPlayed.set(id, now)
    if (id.includes('plasma')) {
      this.playTone(520, 0.19, 'sawtooth', 0.12, 118)
    } else if (id === 'weapon.revolver') {
      this.playTone(178, 0.115, 'sawtooth', 0.12, 68)
      this.playNoise(0.028, 3400, 0.045)
    } else if (id === 'ability.dash') {
      this.playTone(210, 0.24, 'triangle', 0.085, 640)
    } else if (id.includes('death') || id.includes('damage') || id.includes('hurt')) {
      this.playNoise(id.includes('death') ? 0.24 : 0.105, id.includes('death') ? 420 : 1250, id.includes('death') ? 0.12 : 0.07)
      this.playTone(id.includes('death') ? 84 : 190, 0.16, 'sine', 0.065, id.includes('death') ? 48 : 92)
    } else if (id === 'weapon.impact') {
      this.playNoise(0.065, 2100, 0.08)
    } else if (id === 'loot.gold') {
      const base = this.soundFrequency(id)
      this.playTone(base, 0.13, 'sine', 0.07, base * 1.18)
      this.playTone(base * 1.5, 0.18, 'triangle', 0.045, base * 1.72)
    } else {
      const frequency = this.soundFrequency(id)
      const waveform: OscillatorType = id.includes('spawn') || id.includes('wave') ? 'sine' : 'triangle'
      this.playTone(frequency, 0.11, waveform, 0.075, frequency * (id.includes('select') || id.includes('purchase') ? 1.28 : 0.82))
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeSettings()
    this.unsubscribeEvents()
    this.musicEngine?.dispose()
    this.musicEngine = null
    this.sfxVoices.clear()
    this.lastPlayed.clear()
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') void context.close()
  }

  private applySettings(settings: GameSettings): void {
    this.settings = settings
    if (!this.context || !this.masterGain || !this.musicGain || !this.effectsGain) return
    const now = this.context.currentTime
    this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.03)
    this.musicGain.gain.setTargetAtTime(settings.musicEnabled ? settings.musicVolume : 0, now, 0.03)
    this.effectsGain.gain.setTargetAtTime(settings.effectsVolume, now, 0.03)
    if (this.unlocked) this.musicEngine?.setEnabled(settings.musicEnabled)
  }

  private playTone(frequency: number, duration: number, waveform: OscillatorType, volume: number, endFrequency = frequency): void {
    if (!this.context || !this.effectsGain || this.sfxVoices.size >= this.maxSfxVoices) return
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    const now = this.context.currentTime
    oscillator.type = waveform
    oscillator.frequency.setValueAtTime(frequency, now)
    if (endFrequency > 0 && endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration)
    filter.type = 'lowpass'
    filter.frequency.value = waveform === 'sawtooth' ? 3800 : 2400
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.018)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.effectsGain)
    this.sfxVoices.add(oscillator)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
    oscillator.onended = () => {
      this.sfxVoices.delete(oscillator)
      oscillator.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
  }

  private playNoise(duration: number, cutoff: number, volume: number): void {
    if (!this.context || !this.effectsGain || !this.noiseBuffer || this.sfxVoices.size >= this.maxSfxVoices) return
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const envelope = this.context.createGain()
    const now = this.context.currentTime
    source.buffer = this.noiseBuffer
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.effectsGain)
    this.sfxVoices.add(source)
    source.start(now, Math.random() * 0.4, duration)
    source.onended = () => {
      this.sfxVoices.delete(source)
      source.disconnect()
      filter.disconnect()
      envelope.disconnect()
    }
  }

  private createNoiseBuffer(): AudioBuffer {
    const buffer = this.context!.createBuffer(1, this.context!.sampleRate, this.context!.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index++) data[index] = (Math.random() * 2 - 1) * 0.4
    return buffer
  }

  private soundFrequency(id: string): number {
    const exact = SOUND_FREQUENCIES[id]
    if (exact) return exact
    const category = id.includes('death') ? 'death'
      : id.includes('damage') || id.includes('hurt') ? 'damage'
        : id.includes('attack') ? 'attack'
          : id.includes('spawn') ? 'spawn' : ''
    const known = category ? SOUND_FREQUENCIES[`enemy.${category}`] : undefined
    if (known) return known
    let hash = 0
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
    return 180 + hash % 480
  }

  private onEvent(event: GameEvent): void {
    if (event.type === 'wave-preparing') this.setMusicTrack('exploration')
    else if (event.type === 'wave-started') this.setMusicTrack('combat')
    else if (event.type === 'wave-completed') this.setMusicTrack('intermission')
    else if (event.type === 'boss-started') this.setMusicTrack('combat')
    else if (event.type === 'boss-defeated') this.setMusicTrack('intermission')
    else if (event.type === 'game-over') this.setMusicTrack('game-over')
    else if (event.type === 'run-completed') this.setMusicTrack('menu')

    if (event.type === 'enemy-spawned') this.playSfx(event.soundId ?? 'enemy.spawn')
    else if (event.type === 'enemy-attacked') this.playSfx(event.soundId ?? 'enemy.attack')
    else if (event.type === 'enemy-damaged') this.playSfx(event.soundId ?? 'enemy.damage')
    else if (event.type === 'enemy-killed') this.playSfx(event.soundId ?? 'enemy.death')
    else if (event.type === 'player-shot') this.playSfx('weapon.revolver')
    else if (event.type === 'dash-activated') this.playSfx('ability.dash')
    else if (event.type === 'player-ability-used') this.playSfx(`ability.${event.abilityId}`)
    else if (event.type === 'player-damaged') this.playSfx(event.lethal ? 'player.death' : 'player.damage')
    else if (event.type === 'projectile-impact') this.playSfx(event.projectileId.includes('plasma') ? 'weapon.plasma' : 'weapon.impact')
    else if (event.type === 'loot-collected') this.playSfx(event.soundId)
    else if (event.type === 'upgrade-purchased') this.playSfx('upgrade.purchased')
    else if (event.type === 'perk-selected') this.playSfx(event.soundId ?? 'perk.selected')
    else if (event.type === 'menu-action') this.playSfx('menu.click')
    else if (event.type === 'achievement-unlocked') this.playSfx('achievement.unlocked')
    else if (event.type === 'wave-started') this.playSfx('wave.started')
    else if (event.type === 'wave-completed') this.playSfx('wave.completed')
    else if (event.type === 'boss-started') this.playSfx('boss.intro')
    else if (event.type === 'boss-damaged') this.playSfx('boss.damage')
    else if (event.type === 'boss-phase-audio') this.playSfx(event.soundId)
    else if (event.type === 'boss-attack-phase' && event.phase === 'active') this.playSfx(`boss.attack.${event.attackId}`)
    else if (event.type === 'boss-defeated') this.playSfx('boss.defeated')
  }
}
