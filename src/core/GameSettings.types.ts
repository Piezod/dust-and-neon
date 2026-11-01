import type { CustomDifficultySettings, DifficultyProfileId } from '../config/difficulty.config'

export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface GameSettings {
  readonly masterVolume: number
  readonly musicVolume: number
  readonly effectsVolume: number
  readonly musicEnabled: boolean
  readonly graphicsQuality: GraphicsQuality
  readonly aimSensitivity: number
  readonly showTouchControls: boolean
  readonly difficulty: DifficultyProfileId
  readonly customDifficulty: CustomDifficultySettings
}

export const DEFAULT_GAME_SETTINGS: GameSettings = Object.freeze({
  masterVolume: 0.75,
  musicVolume: 0.4,
  effectsVolume: 0.8,
  musicEnabled: true,
  graphicsQuality: 'high',
  aimSensitivity: 1,
  showTouchControls: true,
  difficulty: 'normal',
  customDifficulty: Object.freeze({ enemyHealth: 1, enemyDamage: 1, spawnBudget: 1, attackCooldown: 1, projectileSpeed: 1, telegraphDuration: 1, resourceRecovery: 1 }),
})