import * as THREE from 'three'
import { CombatSystem } from '../combat/CombatSystem'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { WAVE_DEFINITIONS } from '../config/waves.config'
import { Player } from '../entities/Player'
import { EnemyManager } from '../enemies/EnemyManager'
import { WaveManager } from './WaveManager'
import type { WaveDefinition } from './Wave.types'
import { GameEventBus } from '../events/GameEventBus'

export function runWaveChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }

  const definitions = ENEMY_DEFINITIONS
  const scene = new THREE.Scene()
  const player = new Player()
  scene.add(player.root)
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => player.stats.isAlive)
  combat.registerTarget(player)
  const enemies = new EnemyManager(scene, [], combat, player, definitions)
  const waves = new WaveManager(WAVE_DEFINITIONS, enemies)
  try {
    check(WAVE_DEFINITIONS.length === 2, 'Two waves are configured')
    check(waves.state === 'preparation' && waves.getSnapshot().waveNumber === 1, 'Run begins in first-wave preparation')
    check(waves.getSnapshot().enemiesRemaining === 4, 'Remaining count includes pending spawns')
    waves.update(WAVE_DEFINITIONS[0].preparationSeconds, true, player.position)
    check(waves.state === 'combat', 'Preparation transitions to combat')
    check(enemies.aliveCount === 0, 'No enemy spawns before the first combat tick')
    waves.update(0, true, player.position)
    check(enemies.aliveCount === 1, 'First enemy spawns progressively during combat')
    const firstSpawn = enemies.getAlive()[0]
    check(firstSpawn.getCombatBounds().x !== player.position.x || firstSpawn.getCombatBounds().z !== player.position.z, 'Wave spawn is separated from player')
    for (let frame = 0; frame < 100; frame++) waves.update(0.1, true, player.position)
    check(enemies.aliveCount === 4, 'Remaining wave-one groups spawn progressively')
    for (const enemy of enemies.getAlive()) enemy.applyDamage({ sourceId: player.combatId, sourceFaction: player.faction, amount: 1000, type: 'physical' })
    check(enemies.aliveCount === 0, 'Defeating all enemies clears the wave')
    waves.update(0, true, player.position)
    check(waves.state === 'completed', 'Combat ends when all spawns and enemies are cleared')
    waves.update(WAVE_DEFINITIONS[0].completionSeconds, true, player.position)
    check(waves.state === 'upgrades' && !waves.acceptsPlayerInput && !waves.advancesSimulation, 'Intermission pauses player input and simulation')
    const pausedRemaining = waves.getSnapshot().enemiesRemaining
    waves.update(0.5, true, player.position)
    check(waves.state === 'upgrades' && waves.getSnapshot().enemiesRemaining === pausedRemaining, 'No enemies spawn during intermission')
    waves.update(WAVE_DEFINITIONS[0].upgradesSeconds, true, player.position)
    check(waves.state === 'preparation' && waves.getSnapshot().waveNumber === 2, 'Intermission advances to the next wave')
  } finally {
    waves.dispose()
    enemies.dispose()
    combat.dispose()
    player.dispose()
  }

  const infiniteScene = new THREE.Scene()
  const infinitePlayer = new Player()
  infiniteScene.add(infinitePlayer.root)
  const infiniteCombat = new CombatSystem(infiniteScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => infinitePlayer.stats.isAlive)
  infiniteCombat.registerTarget(infinitePlayer)
  const infiniteEvents = new GameEventBus()
  const infiniteEnemies = new EnemyManager(infiniteScene, [], infiniteCombat, infinitePlayer, definitions)
  const infiniteWaves = new WaveManager(WAVE_DEFINITIONS, infiniteEnemies, { infinite: true, events: infiniteEvents, maxAlive: 2 })
  const observedEvents: string[] = []
  infiniteEvents.subscribe((event) => observedEvents.push(event.type))
  try {
    check(infiniteWaves.getSnapshot().totalWaves === 0 && !infiniteWaves.getSnapshot().runComplete, 'Infinite mode has no finite run completion')
    infiniteWaves.update(WAVE_DEFINITIONS[0].preparationSeconds, true, infinitePlayer.position)
    check(observedEvents.filter((type) => type === 'wave-started').length === 1, 'Infinite wave start emits once after preparation')
    for (let frame = 0; frame < 60; frame++) infiniteWaves.update(0.1, true, infinitePlayer.position)
    check(infiniteEnemies.aliveCount === 2 && infiniteWaves.getSnapshot().spawnsPending > 0, 'Infinite spawn loop respects the active-enemy cap')
    for (let frame = 0; frame < 20 && infiniteWaves.state !== 'completed'; frame++) {
      for (const enemy of infiniteEnemies.getAlive()) {
        enemy.applyDamage({ sourceId: infinitePlayer.combatId, sourceFaction: infinitePlayer.faction, amount: 1000, type: 'physical' })
      }
      infiniteWaves.update(0.5, true, infinitePlayer.position)
    }
    check(infiniteWaves.state === 'completed', 'Capped infinite wave completes after all pending spawns are defeated')
    check(observedEvents.filter((type) => type === 'wave-completed').length === 1, 'Infinite wave completion emits once')
    infiniteWaves.update(WAVE_DEFINITIONS[0].completionSeconds, true, infinitePlayer.position)
    check(infiniteWaves.state === 'upgrades', 'Infinite mode preserves intermission between waves')
    infiniteWaves.completeIntermission()
    check(infiniteWaves.getSnapshot().waveNumber === 2 && infiniteWaves.getSnapshot().spawnsPending === 8, 'Infinite wave generation scales the next wave')
    infiniteWaves.update(WAVE_DEFINITIONS[1].preparationSeconds, true, infinitePlayer.position)
    check(observedEvents.filter((type) => type === 'wave-started').length === 2, 'Each infinite wave start emits once')
  } finally {
    infiniteWaves.dispose()
    infiniteEnemies.dispose()
    infiniteCombat.dispose()
    infinitePlayer.dispose()
    infiniteEvents.clear()
  }

  const smallWave: WaveDefinition = {
    id: 'check.wave',
    preparationSeconds: 0,
    completionSeconds: 0,
    upgradesSeconds: 0,
    spawnRadiusMin: 8,
    spawnRadiusMax: 10,
    spawnAttempts: 2,
    spawnGroups: [{ enemyId: 'alien-crawler', count: 1, intervalSeconds: 0 }],
  }
  const blockedScene = new THREE.Scene()
  const blockedPlayer = new Player()
  blockedScene.add(blockedPlayer.root)
  const wall = new THREE.Box2(new THREE.Vector2(-100, -100), new THREE.Vector2(100, 100))
  const blockedCombat = new CombatSystem(blockedScene, [wall], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => blockedPlayer.stats.isAlive)
  const blockedEnemies = new EnemyManager(blockedScene, [wall], blockedCombat, blockedPlayer, definitions)
  const blockedWaves = new WaveManager([smallWave], blockedEnemies)
  try {
    blockedWaves.update(0, true, blockedPlayer.position)
    blockedWaves.update(0, true, blockedPlayer.position)
    check(blockedWaves.state === 'combat' && blockedWaves.getSnapshot().spawnsPending === 1, 'Failed spawn remains pending during bounded retries')
    blockedWaves.update(0.2, true, blockedPlayer.position)
    check(blockedWaves.state === 'completed' && blockedWaves.getSnapshot().skippedSpawns === 1, 'Exhausted retries use the explicit skip fallback')
    blockedPlayer.stats.takeDamage(1000)
    blockedWaves.update(0, false, blockedPlayer.position)
    check(blockedWaves.state === 'game-over', 'Player death transitions the wave state to game-over')
    blockedWaves.update(10, false, blockedPlayer.position)
    check(blockedEnemies.aliveCount === 0, 'Game-over does not spawn more enemies')
  } finally {
    blockedWaves.dispose()
    blockedEnemies.dispose()
    blockedCombat.dispose()
    blockedPlayer.dispose()
  }
  return `${checks} wave checks passed`
}