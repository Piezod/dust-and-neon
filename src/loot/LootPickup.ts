import * as THREE from 'three'
import type { LootReward, LootRewardType } from './Loot.types'
import { LootRewardResolver } from './LootRewardResolver'
import { LootVisual } from './LootVisual'

export type LootPickupState = 'active' | 'collected' | 'disposed'

export class LootPickup {
  readonly visual: LootVisual
  private stateValue: LootPickupState = 'active'
  readonly id: string
  readonly type: LootRewardType
  readonly quantity: number
  readonly position: THREE.Vector3
  readonly collectionRadius: number

  constructor(
    id: string,
    type: LootRewardType,
    quantity: number,
    position: THREE.Vector3,
    collectionRadius: number,
    phase = 0,
  ) {
    this.id = id
    this.type = type
    this.quantity = quantity
    this.position = position.clone()
    this.collectionRadius = collectionRadius
    if (!id || !Number.isSafeInteger(quantity) || quantity <= 0) throw new RangeError('Pickup id and positive integer quantity are required')
    if (!Number.isFinite(collectionRadius) || collectionRadius <= 0) throw new RangeError('Pickup collection radius must be positive')
    this.visual = new LootVisual(type, position, phase)
  }

  get state(): LootPickupState {
    return this.stateValue
  }

  get root(): THREE.Group {
    return this.visual.root
  }

  update(deltaTime: number): void {
    if (this.stateValue === 'active') this.visual.update(deltaTime)
  }

  tryCollect(playerPosition: THREE.Vector3, playerRadius: number, isPlayerAlive: boolean, resolver: LootRewardResolver): boolean {
    if (this.stateValue !== 'active' || !isPlayerAlive) return false
    const reach = this.collectionRadius + playerRadius
    if (this.position.distanceToSquared(playerPosition) > reach * reach) return false
    this.stateValue = 'collected'
    resolver.apply({ type: this.type, quantity: this.quantity } satisfies LootReward)
    return true
  }

  dispose(): void {
    if (this.stateValue === 'disposed') return
    this.stateValue = 'disposed'
    this.visual.dispose()
  }
}