import * as THREE from 'three'
import type { Player } from '../entities/Player'
import type { EnemyDeathEvent } from '../enemies/Enemy.types'
import type { EnemyManager } from '../enemies/EnemyManager'
import { LootPickup } from './LootPickup'
import type { LootReward, LootRewardType, LootTableDefinition, RandomSource } from './Loot.types'
import { LootRewardResolver } from './LootRewardResolver'
import { LootRoller } from './LootRoller'
import { LootTable } from './LootTable'
import type { Wallet } from './Wallet'
import type { GameEventBus } from '../events/GameEventBus'

const PICKUP_RADIUS = 0.38
const PICKUP_CLEARANCE = 0.12
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export class LootManager {
  private readonly tables: ReadonlyMap<string, LootTable>
  private readonly roller: LootRoller
  private readonly resolver: LootRewardResolver
  private readonly pickups = new Map<string, LootPickup>()
  private readonly unsubscribeDeath: () => void
  private nextPickupId = 0
  private disposed = false
  private resourceRecoveryMultiplier = 1
  private readonly parent: THREE.Object3D
  private readonly obstacles: readonly THREE.Box2[]
  private readonly player: Player
  private readonly events?: GameEventBus

  constructor(
    parent: THREE.Object3D,
    obstacles: readonly THREE.Box2[],
    enemies: EnemyManager,
    player: Player,
    wallet: Wallet,
    tableDefinitions: readonly LootTableDefinition[],
    randomSource: RandomSource = Math.random,
    events?: GameEventBus,
  ) {
    this.parent = parent
    this.obstacles = obstacles
    const tables = tableDefinitions.map((definition) => new LootTable(definition))
    this.tables = new Map(tables.map((table) => [table.id, table]))
    if (this.tables.size !== tables.length) throw new Error('Loot table IDs must be unique')
    this.roller = new LootRoller(randomSource)
    this.resolver = new LootRewardResolver(player.stats, wallet, () => player.stats.currentHealth > 0)
    this.unsubscribeDeath = enemies.onDeath((event) => this.onEnemyDeath(event))
    this.player = player
    this.events = events
  }

  get activeCount(): number {
    return this.pickups.size
  }

  getActivePickups(): readonly LootPickup[] {
    return Array.from(this.pickups.values())
  }

  setResourceRecoveryMultiplier(value: number): void {
    this.resourceRecoveryMultiplier = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.75, 1.3) : 1
  }

  update(deltaTime: number): void {
    if (this.disposed) return
    const playerPosition = this.player.position
    const alive = this.player.stats.currentHealth > 0
    for (const pickup of Array.from(this.pickups.values())) {
      pickup.update(deltaTime)
      if (!pickup.tryCollect(playerPosition, this.player.radius, alive, this.resolver)) continue
      this.pickups.delete(pickup.id)
      this.events?.emit({
        type: 'loot-collected',
        reward: { type: pickup.type, quantity: pickup.quantity },
        position: [pickup.position.x, pickup.position.y, pickup.position.z],
        soundId: `loot.${pickup.type}`,
      })
      pickup.dispose()
    }
  }

  spawnDebugPickup(type: LootRewardType): LootPickup | null {
    if (this.disposed || (type !== 'health' && type !== 'energy' && type !== 'gold')) return null
    const quantity = type === 'health' ? 20 : type === 'energy' ? 25 : 10
    const base = this.player.position.clone().add(new THREE.Vector3(1.7, 0, 0.2))
    return this.createPickup({ type, quantity }, base, this.pickups.size)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeDeath()
    for (const pickup of this.pickups.values()) pickup.dispose()
    this.pickups.clear()
  }

  private onEnemyDeath(event: EnemyDeathEvent): void {
    if (this.disposed || !event.lootTableId) return
    const table = this.tables.get(event.lootTableId)
    if (!table) return
    const result = this.roller.roll(table)
    const origin = new THREE.Vector3(...event.position)
    for (let index = 0; index < result.rewards.length; index++) {
      const angle = index * GOLDEN_ANGLE
      const radius = 0.8 + Math.floor(index / 8) * 0.35
      const requested = origin.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
      const reward = result.rewards[index]
      this.createPickup({
        ...reward,
        quantity: reward.type === 'gold' ? reward.quantity : Math.max(1, Math.round(reward.quantity * this.resourceRecoveryMultiplier)),
      }, requested, index)
    }
  }

  private createPickup(reward: LootReward, requested: THREE.Vector3, distributionIndex: number): LootPickup | null {
    const position = this.findValidPosition(requested, distributionIndex)
    if (!position) return null
    const id = `loot:${++this.nextPickupId}`
    const pickup = new LootPickup(id, reward.type, reward.quantity, position, PICKUP_RADIUS, distributionIndex * 0.71)
    this.pickups.set(id, pickup)
    this.parent.add(pickup.root)
    return pickup
  }

  private findValidPosition(requested: THREE.Vector3, distributionIndex: number): THREE.Vector3 | null {
    const candidate = new THREE.Vector3()
    const attempts = 24
    for (let attempt = 0; attempt < attempts; attempt++) {
      const angle = distributionIndex * GOLDEN_ANGLE + attempt * Math.PI / 4
      const radius = attempt === 0 ? 0 : PICKUP_RADIUS * 1.8 + Math.floor(attempt / 8) * 0.35
      candidate.set(requested.x + Math.cos(angle) * radius, requested.y, requested.z + Math.sin(angle) * radius)
      if (!this.clearOfObstacles(candidate.x, candidate.z)) continue
      if (!this.clearOfPickups(candidate.x, candidate.z)) continue
      return candidate.clone()
    }
    return null
  }

  private clearOfObstacles(x: number, z: number): boolean {
    const radius = PICKUP_RADIUS + PICKUP_CLEARANCE
    return this.obstacles.every((obstacle) => {
      const closestX = THREE.MathUtils.clamp(x, obstacle.min.x, obstacle.max.x)
      const closestZ = THREE.MathUtils.clamp(z, obstacle.min.y, obstacle.max.y)
      return (x - closestX) ** 2 + (z - closestZ) ** 2 >= radius * radius
    })
  }

  private clearOfPickups(x: number, z: number): boolean {
    const minimumDistance = PICKUP_RADIUS * 2 + PICKUP_CLEARANCE
    for (const pickup of this.pickups.values()) {
      if (Math.hypot(x - pickup.position.x, z - pickup.position.z) < minimumDistance) return false
    }
    return true
  }
}