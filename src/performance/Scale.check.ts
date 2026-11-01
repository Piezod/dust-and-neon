import * as THREE from 'three'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { LOOT_TABLES } from '../config/loot.config'
import { PERK_DEFINITIONS, UPGRADE_DEFINITIONS } from '../config/progression.config'
import { World } from '../world/World'
import { CombatSystem } from '../combat/CombatSystem'
import { Player } from '../entities/Player'
import { EnemyManager } from '../enemies/EnemyManager'

export function runExtensibilityAndPerformanceChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const assertValid = (condition: boolean, label: string): void => check(condition, label)

  check(ENEMY_DEFINITIONS.some((definition) => definition.behavior.type === 'chase'), 'Enemy catalog includes a chase strategy')
  check(ENEMY_DEFINITIONS.some((definition) => definition.behavior.type === 'keep-distance'), 'Enemy catalog includes a keep-distance strategy')
  check(ENEMY_DEFINITIONS.some((definition) => definition.attacks.length > 1), 'An enemy definition supports multiple attacks')
  check(ENEMY_DEFINITIONS.some((definition) => definition.attacks.some((attack) => attack.type === 'melee'))
    && ENEMY_DEFINITIONS.some((definition) => definition.attacks.some((attack) => attack.type === 'projectile')),
  'Attack catalog exercises multiple registered executor strategies')
  check(UPGRADE_DEFINITIONS.length >= 2 && PERK_DEFINITIONS.length >= 2, 'Progression content is catalog-driven')
  check(LOOT_TABLES.length >= 2, 'Loot content is catalog-driven')

  const customDefinition = Object.freeze({
    ...ENEMY_DEFINITIONS[0],
    id: 'scale-configured-crawler',
    name: 'Scale test variant',
  })
  const world = new World()
  const player = new Player()
  const scene = new THREE.Scene()
  scene.add(world.root, player.root)
  const combat = new CombatSystem(scene, world.obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => player.stats.isAlive)
  combat.registerTarget(player)
  const enemyManager = new EnemyManager(scene, world.obstacles, combat, player, [...ENEMY_DEFINITIONS, customDefinition])
  const configuredEnemy = enemyManager.trySpawn(customDefinition.id, new THREE.Vector3(24, 0, 0), 0)
  check(configuredEnemy?.definition.id === customDefinition.id, 'EnemyManager can register a new enemy variant from its definition')

  const projectileCount = 80
  const enemyCount = 48
  for (let index = 0; index < enemyCount; index++) {
    const definition = ENEMY_DEFINITIONS[index % ENEMY_DEFINITIONS.length]
    const angle = index * Math.PI * 2 / enemyCount
    const radius = 23 + index % 4
    const position = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    enemyManager.spawn(definition.id, position, 0)
  }
  for (let index = 0; index < projectileCount; index++) {
    const angle = index * Math.PI * 2 / projectileCount
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
    combat.spawnProjectile(REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, new THREE.Vector3(0, 1.4, 0), direction)
  }

  const activeAtStart = combat.projectileCount
  const start = performance.now()
  for (let frame = 0; frame < 60; frame++) {
    enemyManager.update(0.02)
    combat.update(0.02, false, new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(1, 0, 0))
  }
  const elapsedMilliseconds = performance.now() - start
  check(activeAtStart === projectileCount, 'Stress scenario starts with all projectiles registered')
  check(enemyManager.aliveCount === enemyCount + 1, 'Stress scenario updates multiple independent enemies')
  check(combat.projectileCount === 0, 'Stress projectiles expire and are removed after their maximum range')
  assertValid(Number.isFinite(elapsedMilliseconds) && elapsedMilliseconds >= 0, 'Performance measurement is finite')

  enemyManager.dispose()
  combat.dispose()
  player.dispose()
  world.dispose()
  scene.traverse((object) => {
    if (object instanceof THREE.Light) object.dispose()
  })
  return `${checks} extensibility checks passed; ${enemyCount + 1} enemies + ${projectileCount} projectiles x 60 ticks: ${elapsedMilliseconds.toFixed(2)} ms`
}