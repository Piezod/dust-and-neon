import type { EnemyDefinition } from '../enemies/Enemy.types'

const CRAWLER: EnemyDefinition = Object.freeze({
  id: 'alien-crawler',
  name: 'Rastrero alienigena',
  maxHealth: 45,
  moveSpeed: 2.5,
  collisionRadius: 0.55,
  detectionRange: 15,
  behavior: Object.freeze({ type: 'chase', stopDistance: 1.25 }),
  attacks: Object.freeze([
    Object.freeze({ id: 'claw', type: 'melee', minRange: 0, maxRange: 1.5, cooldownSeconds: 1.5, priority: 10, damage: 10, damageType: 'physical' }),
  ]),
  visual: Object.freeze({ bodyColor: '#466d63', accentColor: '#91ba74', eyeColor: '#f05a62', bodyHeight: 0.9 }),
  lootTableId: 'enemy-basic',
})

const MECHANICAL_OUTLAW: EnemyDefinition = Object.freeze({
  id: 'mechanical-outlaw',
  name: 'Forajido mecanico',
  maxHealth: 70,
  moveSpeed: 2,
  collisionRadius: 0.65,
  detectionRange: 18,
  behavior: Object.freeze({ type: 'keep-distance', preferredDistance: 7, tolerance: 0.45 }),
  attacks: Object.freeze([
    Object.freeze({
      id: 'plasma-shot',
      type: 'projectile',
      minRange: 1.8,
      maxRange: 12,
      cooldownSeconds: 2,
      priority: 5,
      damage: 8,
      damageType: 'plasma',
      projectile: Object.freeze({
        id: 'enemy.plasma',
        damage: 8,
        projectileSpeed: 14,
        maxRange: 12,
        projectileRadius: 0.16,
        damageType: 'plasma',
        projectileColor: '#e5b4ff',
        projectileEmissive: '#ad45e8',
        projectileEmissiveIntensity: 2.1,
      }),
    }),
    Object.freeze({ id: 'close-strike', type: 'melee', minRange: 0, maxRange: 1.8, cooldownSeconds: 2.5, priority: 20, damage: 12, damageType: 'physical' }),
  ]),
  visual: Object.freeze({ bodyColor: '#59666d', accentColor: '#c48654', eyeColor: '#44ead2', bodyHeight: 1.8 }),
  lootTableId: 'enemy-mechanical',
})

export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([CRAWLER, MECHANICAL_OUTLAW])
