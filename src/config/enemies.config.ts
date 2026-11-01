import type { EnemyDefinition } from '../enemies/Enemy.types'
import { VISUAL_THEME } from './visualTheme'
import { ENEMY_BALANCE } from './enemyBalance.config'

const BALANCE = ENEMY_BALANCE

const CRAWLER: EnemyDefinition = Object.freeze({
  id: 'alien-crawler',
  name: 'Rastrero alienigena',
  maxHealth: BALANCE.crawler.maxHealth,
  moveSpeed: BALANCE.crawler.moveSpeed,
  collisionRadius: BALANCE.crawler.collisionRadius,
  detectionRange: BALANCE.crawler.detectionRange,
  behavior: Object.freeze({ type: 'chase', stopDistance: BALANCE.crawler.stopDistance }),
  attacks: Object.freeze([
    Object.freeze({
      id: 'claw',
      type: 'melee',
      minRange: 0,
      maxRange: BALANCE.crawler.meleeRange,
      cooldownSeconds: BALANCE.crawler.cooldownSeconds,
      windupSeconds: BALANCE.crawler.windupSeconds,
      activeSeconds: BALANCE.crawler.activeSeconds,
      recoverySeconds: BALANCE.crawler.recoverySeconds,
      priority: 10,
      damage: BALANCE.crawler.meleeDamage,
      damageType: 'physical',
    }),
  ]),
  visual: Object.freeze({ bodyColor: VISUAL_THEME.colors.alienHide, accentColor: VISUAL_THEME.colors.alienAccent, eyeColor: VISUAL_THEME.colors.danger, bodyHeight: 0.9 }),
  sounds: Object.freeze({ spawn: 'crawler.spawn', attack: 'crawler.attack', damaged: 'crawler.hurt', death: 'crawler.death' }),
  lootTableId: 'enemy-basic',
})

const MECHANICAL_OUTLAW: EnemyDefinition = Object.freeze({
  id: 'mechanical-outlaw',
  name: 'Forajido mecanico',
  maxHealth: BALANCE.outlaw.maxHealth,
  moveSpeed: BALANCE.outlaw.moveSpeed,
  collisionRadius: BALANCE.outlaw.collisionRadius,
  detectionRange: BALANCE.outlaw.detectionRange,
  behavior: Object.freeze({ type: 'keep-distance', preferredDistance: BALANCE.outlaw.preferredDistance, tolerance: BALANCE.outlaw.distanceTolerance }),
  attacks: Object.freeze([
    Object.freeze({
      id: 'plasma-shot',
      type: 'projectile',
      minRange: BALANCE.outlaw.closeRange,
      maxRange: BALANCE.outlaw.plasmaRange,
      cooldownSeconds: BALANCE.outlaw.plasmaCooldownSeconds,
      windupSeconds: BALANCE.outlaw.plasmaWindupSeconds,
      activeSeconds: BALANCE.outlaw.plasmaActiveSeconds,
      recoverySeconds: BALANCE.outlaw.plasmaRecoverySeconds,
      burstCount: BALANCE.outlaw.plasmaBurstCount,
      burstIntervalSeconds: BALANCE.outlaw.plasmaBurstIntervalSeconds,
      priority: 5,
      damage: BALANCE.outlaw.plasmaDamage,
      damageType: 'plasma',
      projectile: Object.freeze({
        id: 'enemy.plasma',
        damage: BALANCE.outlaw.plasmaDamage,
        projectileSpeed: 14,
        maxRange: BALANCE.outlaw.plasmaRange,
        projectileRadius: 0.16,
        damageType: 'plasma',
        projectileColor: VISUAL_THEME.colors.plasmaCore,
        projectileEmissive: VISUAL_THEME.colors.alienViolet,
        projectileEmissiveIntensity: 2.1,
      }),
    }),
    Object.freeze({
      id: 'close-strike',
      type: 'melee',
      minRange: 0,
      maxRange: BALANCE.outlaw.closeRange,
      cooldownSeconds: BALANCE.outlaw.closeCooldownSeconds,
      windupSeconds: BALANCE.outlaw.closeWindupSeconds,
      activeSeconds: BALANCE.outlaw.closeActiveSeconds,
      recoverySeconds: BALANCE.outlaw.closeRecoverySeconds,
      priority: 20,
      damage: BALANCE.outlaw.closeDamage,
      damageType: 'physical',
    }),
  ]),
  visual: Object.freeze({ bodyColor: VISUAL_THEME.colors.metal, accentColor: VISUAL_THEME.colors.sand, eyeColor: VISUAL_THEME.colors.cyan, bodyHeight: 1.8 }),
  sounds: Object.freeze({ spawn: 'outlaw.spawn', attack: 'outlaw.attack', damaged: 'outlaw.hurt', death: 'outlaw.death', special: 'outlaw.plasma' }),
  lootTableId: 'enemy-mechanical',
})

export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([CRAWLER, MECHANICAL_OUTLAW])
