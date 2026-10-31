import * as THREE from 'three'
import { CombatSystem } from '../combat/CombatSystem'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { Player } from '../entities/Player'
import { EnemyManager } from '../enemies/EnemyManager'
import { PlayerHUD } from '../ui/PlayerHUD'
import { LootManager } from './LootManager'
import { LootPickup } from './LootPickup'
import { LootRewardResolver } from './LootRewardResolver'
import { LootRoller } from './LootRoller'
import { LootTable } from './LootTable'
import type { LootTableDefinition, RandomSource } from './Loot.types'
import { Wallet } from './Wallet'

const WEIGHTED_TABLE: LootTableDefinition = {
  id: 'check.weighted',
  mode: 'weighted-exclusive',
  entries: [
    { id: 'health', type: 'health', probability: 0.15, minQuantity: 20, maxQuantity: 20 },
    { id: 'energy', type: 'energy', probability: 0.2, minQuantity: 25, maxQuantity: 25 },
    { id: 'gold', type: 'gold', probability: 0.4, minQuantity: 5, maxQuantity: 15 },
    { id: 'none', type: 'none', probability: 0.25, minQuantity: 0, maxQuantity: 0 },
  ],
}

const MULTI_TABLE: LootTableDefinition = {
  id: 'check.multi',
  mode: 'independent-rolls',
  entries: [
    { id: 'gold', type: 'gold', probability: 1, minQuantity: 10, maxQuantity: 10 },
    { id: 'health', type: 'health', probability: 1, minQuantity: 20, maxQuantity: 20 },
    { id: 'energy', type: 'energy', probability: 1, minQuantity: 25, maxQuantity: 25 },
  ],
}

function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0
  return () => values[index++] ?? 0
}

export function runLootChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string, tolerance = 1e-8): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label)
  }
  const rejects = (action: () => unknown, label: string): void => {
    let rejected = false
    try { action() } catch { rejected = true }
    check(rejected, label)
  }

  const weighted = new LootTable(WEIGHTED_TABLE)
  check(new LootRoller(() => 0.149999).roll(weighted).rewards[0]?.type === 'health', 'Weighted exclusive selects the first probability interval')
  check(new LootRoller(() => 0.15).roll(weighted).rewards[0]?.type === 'energy', 'Weighted exclusive honors an exact probability boundary')
  const goldMinimum = new LootRoller(sequenceRandom([0.35, 0])).roll(weighted).rewards[0]
  const goldMaximum = new LootRoller(sequenceRandom([0.35, 0.999999])).roll(weighted).rewards[0]
  check(goldMinimum.type === 'gold' && goldMinimum.quantity === 5, 'Inclusive gold quantity minimum')
  check(goldMaximum.type === 'gold' && goldMaximum.quantity === 15, 'Inclusive gold quantity maximum')
  check(new LootRoller(() => 0.75).roll(weighted).rewards.length === 0, 'Weighted none result creates no reward')
  const emptyTable = new LootTable({ id: 'check.empty', mode: 'independent-rolls', entries: [] })
  check(new LootRoller(() => { throw new Error('Empty table must not roll') }).roll(emptyTable).rewards.length === 0, 'Empty table creates no reward and does not consume RNG')
  rejects(() => new LootTable({ ...WEIGHTED_TABLE, id: 'invalid.sum', entries: WEIGHTED_TABLE.entries.slice(0, 2) }), 'Invalid exclusive sum is rejected')
  rejects(() => new LootTable({ ...WEIGHTED_TABLE, id: 'invalid.range', entries: [{ ...WEIGHTED_TABLE.entries[0], minQuantity: 21, maxQuantity: 20 }] }), 'Invalid quantity range is rejected')
  rejects(() => new LootTable({ ...WEIGHTED_TABLE, id: 'invalid.probability', entries: [{ ...WEIGHTED_TABLE.entries[0], probability: 1.1 }] }), 'Out-of-range probability is rejected')
  const independent = new LootTable(MULTI_TABLE)
  const independentResult = new LootRoller(sequenceRandom([0.4, 0.1, 0.9])).roll(independent)
  check(independentResult.rewards.length === 3, 'Independent rolls can generate multiple rewards')
  check(new LootRoller(sequenceRandom([0.9, 0.25, 0.35])).roll(new LootTable({
    id: 'check.thresholds',
    mode: 'independent-rolls',
    entries: [
      { id: 'gold', type: 'gold', probability: 1, minQuantity: 1, maxQuantity: 1 },
      { id: 'health', type: 'health', probability: 0.25, minQuantity: 1, maxQuantity: 1 },
      { id: 'energy', type: 'energy', probability: 0.35, minQuantity: 1, maxQuantity: 1 },
    ],
  })).rewards.length === 1, 'Independent probability thresholds are exact and deterministic')
  rejects(() => new LootRoller(() => 1).roll(weighted), 'Invalid RNG output is rejected')

  const wallet = new Wallet()
  const balances: number[] = []
  const unsubscribe = wallet.subscribe((balance) => balances.push(balance))
  check(!wallet.spend(1) && wallet.balance === 0, 'Wallet cannot spend more than available')
  check(wallet.canAfford(0), 'Wallet can check a zero cost')
  wallet.add(15)
  check(wallet.canAfford(15) && wallet.spend(5), 'Wallet adds and spends valid gold')
  close(wallet.balance, 10, 'Wallet balance remains non-negative')
  check(balances.join(',') === '0,15,10', 'Wallet notifies subscribers on balance changes')
  unsubscribe()
  wallet.add(1)
  check(balances.length === 3, 'Wallet unsubscribe removes listener')
  rejects(() => wallet.add(-1), 'Wallet rejects negative additions')
  rejects(() => wallet.spend(1.5), 'Wallet rejects fractional spending')

  const runWallet = new Wallet()
  const scene = new THREE.Scene()
  const player = new Player()
  scene.add(player.root)
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  combat.registerTarget(player)
  const baseEnemy = ENEMY_DEFINITIONS.find((definition) => definition.id === 'alien-crawler')!
  const withLoot = Object.freeze({ ...baseEnemy, id: 'loot-check-enemy', lootTableId: 'check.multi' })
  const withoutLoot = Object.freeze({ ...baseEnemy, id: 'no-loot-check-enemy', lootTableId: undefined })
  const enemies = new EnemyManager(scene, [], combat, player, [withLoot, withoutLoot])
  const loot = new LootManager(scene, [], enemies, player, runWallet, [MULTI_TABLE], () => 0)
  const container = document.createElement('div')
  document.body.append(container)
  const hud = new PlayerHUD(container, player.stats, player.abilities, enemies, runWallet, loot)
  const deathEvents: string[] = []
  enemies.onDeath((event) => deathEvents.push(event.enemyId))
  try {
    player.stats.takeDamage(30)
    player.stats.spendEnergy(50)
    const enemy = enemies.spawn(withLoot.id, new THREE.Vector3(12, 0, 3))
    const enemyId = enemy.combatId
    enemy.applyDamage({ sourceId: player.combatId, sourceFaction: player.faction, amount: 45, type: 'physical' })
    check(enemy.isDead && deathEvents.filter((id) => id === enemyId).length === 1, 'Enemy death event reaches loot manager exactly once')
    check(loot.activeCount === 3, 'Independent death table generates three pickups')
    const rewards = [...loot.getActivePickups()]
    check(new Set(rewards.map((pickup) => pickup.id)).size === 3, 'Each pickup has a unique instance id')
    check(new Set(rewards.map((pickup) => `${pickup.position.x.toFixed(3)},${pickup.position.z.toFixed(3)}`)).size === 3, 'Drops from one death are spatially distributed')
    check(rewards.every((pickup) => pickup.root.parent === scene), 'Pickup visuals are attached to the scene')
    check(container.querySelector('[data-value="gold"]')?.textContent === '0', 'HUD starts with zero run gold')

    const healthPickup = rewards.find((pickup) => pickup.type === 'health')!
    const healthGeometry = (healthPickup.root.children[0] as THREE.Mesh).geometry
    let geometryDisposed = false
    healthGeometry.addEventListener('dispose', () => { geometryDisposed = true })
    player.position.copy(healthPickup.position)
    loot.update(0.016)
    close(player.stats.currentHealth, 90, 'Health pickup uses CharacterStats.heal')
    check(healthPickup.state === 'disposed' && healthPickup.root.parent === null && geometryDisposed, 'Collected pickup removes and disposes its Three.js resources')
    loot.update(1)
    close(player.stats.currentHealth, 90, 'Collected pickup cannot apply its reward twice')

    const energyPickup = rewards.find((pickup) => pickup.type === 'energy')!
    player.position.copy(energyPickup.position)
    loot.update(0.1)
    close(player.stats.currentEnergy, 75, 'Energy pickup uses CharacterStats.restoreEnergy')
    const goldPickup = rewards.find((pickup) => pickup.type === 'gold')!
    player.position.copy(goldPickup.position)
    loot.update(0.1)
    close(runWallet.balance, 10, 'Gold pickup updates run wallet')
    check(container.querySelector('[data-value="gold"]')?.textContent === '10', 'Wallet subscription updates HUD immediately')
    check(loot.activeCount === 0, 'Collected pickups are removed from active manager')

    const resolver = new LootRewardResolver(player.stats, runWallet, () => player.stats.currentHealth > 0)
    resolver.apply({ type: 'health', quantity: 1000 })
    resolver.apply({ type: 'energy', quantity: 1000 })
    close(player.stats.currentHealth, player.stats.getStat('maxHealth'), 'Health reward respects maximum')
    close(player.stats.currentEnergy, player.stats.getStat('maxEnergy'), 'Energy reward respects maximum')
    const balanceBeforeDebug = runWallet.balance
    const debugPickup = loot.spawnDebugPickup('gold')
    check(debugPickup !== null && runWallet.balance === balanceBeforeDebug, 'F3-style debug spawn does not alter loot rolls or wallet')
    player.stats.takeDamage(1000)
    player.position.copy(debugPickup!.position)
    loot.update(0.1)
    check(debugPickup!.state === 'active' && runWallet.balance === balanceBeforeDebug, 'Dead player cannot collect loot')
    player.stats.heal(1000)
    loot.update(0.1)
    check(debugPickup!.state === 'disposed' && runWallet.balance === balanceBeforeDebug + 10, 'Debug pickup collects once after player is alive')

    const noLootEnemy = enemies.spawn(withoutLoot.id, new THREE.Vector3(16, 0, 3))
    const pickupsBeforeNoTable = loot.activeCount
    noLootEnemy.applyDamage({ sourceId: player.combatId, sourceFaction: player.faction, amount: 100, type: 'physical' })
    check(loot.activeCount === pickupsBeforeNoTable, 'Enemy without lootTableId generates no pickups')
    check(container.querySelector('[data-value="enemy-count"]')?.textContent === '0', 'F3 enemy counter follows enemy death')

    const animationPosition = new THREE.Vector3(50, 0, 50)
    const animationA = new LootPickup('animation-a', 'energy', 25, animationPosition, 0.38, 0.25)
    const animationB = new LootPickup('animation-b', 'energy', 25, animationPosition, 0.38, 0.25)
    const animationStartA = animationA.root.position.clone()
    const animationStartB = animationB.root.position.clone()
    for (let frame = 0; frame < 10; frame++) animationA.update(0.02)
    animationB.update(0.2)
    close(animationA.root.position.y, animationB.root.position.y, 'Pickup float animation is deltaTime-consistent')
    check(animationA.root.position.distanceTo(animationStartA) > 0 && animationB.root.position.distanceTo(animationStartB) > 0, 'Pickup animation updates its visible transform')
    animationA.dispose()
    animationB.dispose()
    const activeBeforeDebugButton = loot.activeCount
    container.querySelector<HTMLButtonElement>('[data-action="debug-gold"]')!.click()
    check(loot.activeCount === activeBeforeDebugButton + 1 && runWallet.balance === balanceBeforeDebug + 10, 'F3 debug button spawns a pickup without altering normal loot rolls')
  } finally {
    hud.destroy()
    loot.dispose()
    enemies.dispose()
    combat.dispose()
    player.dispose()
    container.remove()
    scene.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose()
    })
  }
  return `${checks} loot checks passed`
}