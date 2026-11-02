import { DEFAULT_GAME_SETTINGS } from '../core/GameSettings.types'
import type { GameSettings, GraphicsQuality } from '../core/GameSettings.types'
import { sanitizeCustomDifficulty, sanitizeDifficultyProfile } from '../config/difficulty.config'

const SETTINGS_KEY = 'dust-and-neon.settings.v1'
type SettingsListener = (settings: GameSettings) => void

export class SettingsStore {
  private value: GameSettings
  private readonly listeners = new Set<SettingsListener>()
  private readonly storage: Storage | null

  constructor(storage: Storage | null = this.getLocalStorage()) {
    this.storage = storage
    this.value = this.load()
  }

  get settings(): GameSettings {
    return this.value
  }

  update(changes: Partial<GameSettings>): GameSettings {
    this.value = Object.freeze({ ...this.value, ...this.sanitize(changes, this.value) })
    this.persist()
    for (const listener of this.listeners) listener(this.value)
    return this.value
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener)
    listener(this.value)
    return () => this.listeners.delete(listener)
  }

  private load(): GameSettings {
    if (!this.storage) return DEFAULT_GAME_SETTINGS
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(SETTINGS_KEY) ?? 'null')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_GAME_SETTINGS
      return Object.freeze(this.sanitize(parsed as Partial<GameSettings>, DEFAULT_GAME_SETTINGS))
    } catch {
      return DEFAULT_GAME_SETTINGS
    }
  }

  private sanitize(candidate: Partial<GameSettings>, fallback: GameSettings): GameSettings {
    const volume = (value: unknown, current: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : current
    const quality: unknown = candidate.graphicsQuality
    const sensitivity = candidate.aimSensitivity
    const bounded = (value: unknown, current: number, minimum: number, maximum: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : current
    return {
      masterVolume: volume(candidate.masterVolume, fallback.masterVolume),
      musicVolume: volume(candidate.musicVolume, fallback.musicVolume),
      effectsVolume: volume(candidate.effectsVolume, fallback.effectsVolume),
      musicEnabled: typeof candidate.musicEnabled === 'boolean' ? candidate.musicEnabled : fallback.musicEnabled,
      graphicsQuality: quality === 'low' || quality === 'medium' || quality === 'high' ? quality as GraphicsQuality : fallback.graphicsQuality,
      aimSensitivity: typeof sensitivity === 'number' && Number.isFinite(sensitivity)
        ? Math.min(2, Math.max(0.25, sensitivity))
        : fallback.aimSensitivity,
      showTouchControls: typeof candidate.showTouchControls === 'boolean' ? candidate.showTouchControls : fallback.showTouchControls,
      joystickSize: bounded(candidate.joystickSize, fallback.joystickSize, 96, 156),
      touchOpacity: bounded(candidate.touchOpacity, fallback.touchOpacity, 0.3, 1),
      touchAimSensitivity: bounded(candidate.touchAimSensitivity, fallback.touchAimSensitivity, 0.5, 2),
      touchDeadzone: bounded(candidate.touchDeadzone, fallback.touchDeadzone, 0.05, 0.35),
      mobileZoom: bounded(candidate.mobileZoom, fallback.mobileZoom, 0.75, 1.5),
      difficulty: sanitizeDifficultyProfile(candidate.difficulty ?? fallback.difficulty),
      customDifficulty: sanitizeCustomDifficulty({ ...fallback.customDifficulty, ...candidate.customDifficulty }),
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.value))
    } catch {
      // Settings remain active for this page session when storage is unavailable.
    }
  }

  private getLocalStorage(): Storage | null {
    try {
      return localStorage
    } catch {
      return null
    }
  }
}