import type { CustomDifficultySettings, DifficultyProfileId } from '../config/difficulty.config'
import { isTouchDevice } from '../config/camera.config'

export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface GameSettings {
  readonly masterVolume: number
  readonly musicVolume: number
  readonly effectsVolume: number
  readonly musicEnabled: boolean
  readonly graphicsQuality: GraphicsQuality
  readonly aimSensitivity: number
  readonly showTouchControls: boolean
  readonly joystickSize: number
  readonly touchOpacity: number
  readonly touchAimSensitivity: number
  readonly touchDeadzone: number
  readonly mobileZoom: number
  readonly difficulty: DifficultyProfileId
  readonly customDifficulty: CustomDifficultySettings
}

export const DEFAULT_GAME_SETTINGS: GameSettings = Object.freeze({
  masterVolume: 0.75,
  musicVolume: 0.4,
  effectsVolume: 0.8,
  musicEnabled: true,
  graphicsQuality: typeof window !== 'undefined' && isTouchDevice() ? 'low' : 'high',
  aimSensitivity: 1,
  showTouchControls: true,
  joystickSize: 124,
  touchOpacity: 0.8,
  touchAimSensitivity: 1,
  touchDeadzone: 0.16,
  mobileZoom: 1,
  difficulty: 'normal',
  customDifficulty: Object.freeze({ enemyHealth: 1, enemyDamage: 1, spawnBudget: 1, attackCooldown: 1, projectileSpeed: 1, telegraphDuration: 1, resourceRecovery: 1 }),
})