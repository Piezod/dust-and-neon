import * as THREE from 'three'
import { Game } from '../core/Game'
import { GameEventBus } from '../events/GameEventBus'
import { DEFAULT_GAME_SETTINGS, type GraphicsQuality } from '../core/GameSettings.types'
import type { EnemyManager } from './EnemyManager'
import type { Player } from '../entities/Player'
import type { LootManager } from '../loot/LootManager'
import type { WaveManager } from '../waves/WaveManager'

interface GameCombatHarness {
  tick(time: number): void
  readonly player: Player
  readonly enemies: EnemyManager
  readonly loot: LootManager
  readonly waves: WaveManager
  readonly scene: THREE.Scene
}

let activeGame: Game | null = null
let activeHost: HTMLDivElement | null = null

export function runEnemyCombatVisualCheck(container: HTMLElement, quality: GraphicsQuality = 'high'): string {
  disposeEnemyCombatVisualCheck()
  const host = document.createElement('div')
  host.className = 'game-stage combat-visual-check'
  host.style.cssText = 'position:fixed;inset:0;z-index:20;overflow:hidden;pointer-events:none;background:#171a20'
  container.append(host)
  activeHost = host
  const events = new GameEventBus()
  const killedEvents: string[] = []
  events.subscribe((event) => {
    if (event.type === 'enemy-killed') killedEvents.push(event.death.enemyId)
  })
  activeGame = new Game(host, { mode: 'infinite', events, settings: { ...DEFAULT_GAME_SETTINGS,
    masterVolume: 0,
    musicVolume: 0,
    effectsVolume: 0,
    musicEnabled: false,
    graphicsQuality: quality,
    aimSensitivity: 1,
    showTouchControls: false,
  } })
  const game = activeGame as unknown as GameCombatHarness
  let time = 0
  for (let frame = 0; frame < 42; frame++) {
    time += 50
    game.tick(time)
  }
  if (game.waves.state !== 'combat') throw new Error('Combat visual check did not reach gameplay')

  game.enemies.getAlive().forEach((enemy, index) => {
    enemy.root.position.set(game.player.position.x + 20 + index * 3, 0, game.player.position.z + 20)
  })

  const spawn = new THREE.Vector3(game.player.position.x, 0, game.player.position.z + 1.4)
  const crawler = game.enemies.spawn('alien-crawler', spawn, 0)
  crawler.root.position.copy(spawn)
  crawler.update(0.001, game.player, game.enemies.getAlive())
  const telegraph = crawler.root.getObjectByName('EnemyAttackTelegraph') as THREE.Mesh | null
  if (crawler.attackController.getPhaseState()?.phase !== 'windup' || !telegraph?.visible) {
    throw new Error('Crawler windup telegraph was not visible in scene')
  }
  time += 16
  game.tick(time)
  const telegraphVisibleBeforeActive = telegraph.visible

  const healthBeforeHit = game.player.stats.currentHealth
  for (let frame = 0; frame < 6; frame++) {
    time += 50
    game.tick(time)
  }
  if (game.player.stats.currentHealth !== healthBeforeHit || crawler.attackController.getPhaseState()?.phase !== 'windup') {
    throw new Error('Melee dealt damage during its windup phase')
  }
  time += 50
  game.tick(time)
  if (healthBeforeHit - game.player.stats.currentHealth !== 10 || crawler.attackController.getPhaseState()?.phase !== 'active') {
    throw new Error(`Melee active phase did not apply exactly one hit (${healthBeforeHit - game.player.stats.currentHealth})`)
  }
  const colliderBeforeDeath = crawler.getCombatBounds()
  const lootBeforeDeath = game.loot.activeCount
  crawler.applyDamage({ sourceId: game.player.combatId, sourceFaction: game.player.faction, amount: 1000, type: 'physical' })
  const lootAfterFirstDeath = game.loot.activeCount
  crawler.applyDamage({ sourceId: game.player.combatId, sourceFaction: game.player.faction, amount: 1000, type: 'physical' })
  if (killedEvents.filter((id) => id === crawler.combatId).length !== 1 || game.loot.activeCount !== lootAfterFirstDeath) {
    throw new Error('Enemy death or loot event was produced more than once')
  }
  if (game.enemies.getAlive().some((enemy) => enemy.combatId === crawler.combatId) || game.enemies.dyingCount === 0) {
    throw new Error('Dead enemy was not removed from combat before its visual fade')
  }
  for (let frame = 0; frame < 3; frame++) {
    time += 50
    game.tick(time)
  }
  const colliderDuringDeath = crawler.getCombatBounds()
  if (colliderDuringDeath.x !== colliderBeforeDeath.x || colliderDuringDeath.z !== colliderBeforeDeath.z || colliderDuringDeath.radius !== colliderBeforeDeath.radius) {
    throw new Error('Death presentation changed the enemy collider')
  }
  const model = crawler.root.getObjectByName('EnemyModelVisual')
  if (!model || model.scale.x >= 1) throw new Error('Enemy death animation did not scale its visual model')
  for (let frame = 0; frame < 5; frame++) {
    time += 50
    game.tick(time)
  }
  if (game.enemies.dyingCount !== 0 || game.scene.getObjectByName(crawler.root.name)) {
    throw new Error('Enemy death visuals were not cleaned up after their animation')
  }
  if (lootAfterFirstDeath < lootBeforeDeath) throw new Error('Loot count regressed after enemy death')
  return `Combat visual frame ready: telegraph=${telegraphVisibleBeforeActive}, one melee hit, unique loot/death, death cleaned`
}

export function prepareEnemyWindupVisualCapture(container: HTMLElement, quality: GraphicsQuality = 'high'): string {
  disposeEnemyCombatVisualCheck()
  const host = document.createElement('div')
  host.className = 'game-stage enemy-windup-capture'
  host.style.cssText = 'position:fixed;inset:0;z-index:20;overflow:hidden;pointer-events:none;background:#171a20'
  container.append(host)
  activeHost = host
  const events = new GameEventBus()
  activeGame = new Game(host, { mode: 'infinite', events, settings: { ...DEFAULT_GAME_SETTINGS,
    masterVolume: 0,
    musicVolume: 0,
    effectsVolume: 0,
    musicEnabled: false,
    graphicsQuality: quality,
    aimSensitivity: 1,
    showTouchControls: false,
  } })
  const game = activeGame as unknown as GameCombatHarness
  let time = 0
  for (let frame = 0; frame < 42; frame++) {
    time += 50
    game.tick(time)
  }
  if (game.waves.state !== 'combat') throw new Error('Windup capture did not reach combat')
  game.enemies.getAlive().forEach((enemy, index) => {
    enemy.root.position.set(game.player.position.x + 22 + index * 3, 0, game.player.position.z + 20)
  })
  const position = game.player.position.clone().add(new THREE.Vector3(0, 0, 1.4))
  const enemy = game.enemies.spawn('alien-crawler', position, 0)
  enemy.root.position.copy(position)
  enemy.update(0, game.player, [enemy])
  time += 16
  game.tick(time)
  const telegraph = enemy.root.getObjectByName('EnemyAttackTelegraph') as THREE.Mesh | null
  if (enemy.attackController.getPhaseState()?.phase !== 'windup' || !telegraph?.visible) {
    throw new Error('Windup telegraph was not visible in the real Game scene')
  }
  return 'Crawler windup telegraph rendered in the real Game scene'
}

export function disposeEnemyCombatVisualCheck(): void {
  activeGame?.dispose()
  activeGame = null
  activeHost?.remove()
  activeHost = null
}
