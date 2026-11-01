import * as THREE from 'three'
import { Ability } from './Ability'
import type { AbilityActivationContext, AbilityDefinition } from './Ability.types'
import type { CharacterStats } from '../core/CharacterStats'
import type { Player } from '../entities/Player'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { CombatSystem } from '../combat/CombatSystem'
import type { GameEventBus } from '../events/GameEventBus'
import { hasLineOfSight } from '../enemies/EnemyNavigation'

export interface SkillAbilityContext {
  readonly player: Player
  readonly enemies: EnemyManager
  readonly combat: CombatSystem
  readonly obstacles: readonly THREE.Box2[]
  readonly events?: GameEventBus
}

const ARC_ABILITY: AbilityDefinition = Object.freeze({ id: 'arc-voltaic', name: 'Arco voltaico', inputCode: 'KeyQ', inputLabel: 'Q', energyCost: 32, cooldownSeconds: 8 })
const FROST_ABILITY: AbilityDefinition = Object.freeze({ id: 'frost-pulse', name: 'Pulso de escarcha', inputCode: 'KeyE', inputLabel: 'E', energyCost: 28, cooldownSeconds: 9 })
const SHIELD_ABILITY: AbilityDefinition = Object.freeze({ id: 'emergency-shield', name: 'Escudo de emergencia', inputCode: 'KeyR', inputLabel: 'R', energyCost: 30, cooldownSeconds: 13 })

export class ArcVoltaicAbility extends Ability {
  private readonly context: SkillAbilityContext
  private readonly visited = new Set<string>()
  private readonly struckPositions: [number, number, number][] = []

  constructor(stats: CharacterStats, context: SkillAbilityContext) {
    super(ARC_ABILITY, stats)
    this.context = context
  }

  protected onActivate(_activation: AbilityActivationContext): void {
    this.visited.clear()
    this.struckPositions.length = 0
    const origin = this.context.player.position
    let sourcePosition = origin.clone()
    let damage = 22
    for (let targetIndex = 0; targetIndex < 3; targetIndex++) {
      const target = this.context.enemies.getAlive()
        .filter((enemy) => !enemy.isDead && !this.visited.has(enemy.combatId))
        .map((enemy) => ({ enemy, bounds: enemy.getCombatBounds() }))
        .filter(({ bounds }) => Math.hypot(bounds.x - sourcePosition.x, bounds.z - sourcePosition.z) <= 9 + bounds.radius
          && hasLineOfSight(sourcePosition, new THREE.Vector3(bounds.x, 0, bounds.z), this.context.obstacles))
        .sort((first, second) => Math.hypot(first.bounds.x - sourcePosition.x, first.bounds.z - sourcePosition.z)
          - Math.hypot(second.bounds.x - sourcePosition.x, second.bounds.z - sourcePosition.z))[0]?.enemy
      if (!target) break
      this.visited.add(target.combatId)
      const bounds = target.getCombatBounds()
      this.context.combat.applyDamage(target, {
        sourceId: this.context.player.combatId,
        sourceFaction: this.context.player.faction,
        amount: damage,
        type: 'electric',
        sourcePosition: [sourcePosition.x, 1, sourcePosition.z],
        effects: [{ type: 'shock', staggerSeconds: 0.14 }],
      })
      this.struckPositions.push([bounds.x, 0.7, bounds.z])
      sourcePosition = new THREE.Vector3(bounds.x, 0, bounds.z)
      damage *= 0.65
    }
    this.context.events?.emit({
      type: 'player-ability-used',
      abilityId: this.id,
      position: [origin.x, 1, origin.z],
      targets: [...this.struckPositions],
      radius: 9,
    })
  }
}

export class FrostPulseAbility extends Ability {
  private readonly context: SkillAbilityContext
  private readonly center = new THREE.Vector3()

  constructor(stats: CharacterStats, context: SkillAbilityContext) {
    super(FROST_ABILITY, stats)
    this.context = context
  }

  protected onActivate(_activation: AbilityActivationContext): void {
    this.center.copy(this.context.player.position)
    const targets = this.context.enemies.getAlive()
      .filter((enemy) => !enemy.isDead)
      .map((enemy) => ({ enemy, bounds: enemy.getCombatBounds() }))
      .filter(({ bounds }) => Math.hypot(bounds.x - this.center.x, bounds.z - this.center.z) <= 4.5 + bounds.radius
        && hasLineOfSight(this.center, new THREE.Vector3(bounds.x, 0, bounds.z), this.context.obstacles))
      .sort((first, second) => Math.hypot(first.bounds.x - this.center.x, first.bounds.z - this.center.z)
        - Math.hypot(second.bounds.x - this.center.x, second.bounds.z - this.center.z))
      .slice(0, 12)
    for (const { enemy } of targets) this.context.combat.applyDamage(enemy, {
      sourceId: this.context.player.combatId,
      sourceFaction: this.context.player.faction,
      amount: 16,
      type: 'cryo',
      sourcePosition: [this.center.x, 0.8, this.center.z],
      effects: [{ type: 'slow', durationSeconds: 1.5, movementMultiplier: 0.7 }],
    })
    this.context.events?.emit({
      type: 'player-ability-used',
      abilityId: this.id,
      position: [this.center.x, 0.12, this.center.z],
      targets: targets.map(({ bounds }) => [bounds.x, 0.5, bounds.z] as [number, number, number]),
      radius: 4.5,
    })
  }
}

export class EmergencyShieldAbility extends Ability {
  private remainingDuration = 0
  private remainingCapacity = 0
  private readonly capacity: number
  private readonly duration: number
  private readonly onVisual: (active: boolean, remainingCapacity: number, remainingDuration: number) => void

  constructor(stats: CharacterStats, onVisual: (active: boolean, remainingCapacity: number, remainingDuration: number) => void = () => undefined) {
    super(SHIELD_ABILITY, stats)
    this.capacity = 42
    this.duration = 4
    this.onVisual = onVisual
  }

  get shieldCapacity(): number {
    return this.remainingCapacity
  }

  get shieldDuration(): number {
    return this.remainingDuration
  }

  absorbDamage(amount: number): number {
    if (!this.active || !Number.isFinite(amount) || amount <= 0) return 0
    const absorbed = Math.min(amount, this.remainingCapacity)
    this.remainingCapacity -= absorbed
    if (this.remainingCapacity <= 0) this.cancel()
    else this.onVisual(true, this.remainingCapacity, this.remainingDuration)
    return absorbed
  }

  protected onActivate(_activation: AbilityActivationContext): void {
    this.remainingCapacity = this.capacity
    this.remainingDuration = this.duration
    this.active = true
    this.onVisual(true, this.remainingCapacity, this.remainingDuration)
  }

  protected onUpdate(deltaTime: number): void {
    if (!this.active) return
    this.remainingDuration = Math.max(0, this.remainingDuration - deltaTime)
    if (this.remainingDuration === 0 || this.remainingCapacity === 0) this.cancel()
    else this.onVisual(true, this.remainingCapacity, this.remainingDuration)
  }

  protected onCancel(): void {
    this.remainingCapacity = 0
    this.remainingDuration = 0
    this.onVisual(false, 0, 0)
  }

  protected getStatusDetail(): string | undefined {
    return this.active ? `ESCUDO ${Math.ceil(this.remainingCapacity)} · ${this.remainingDuration.toFixed(1)}s` : undefined
  }
}

export function equipReserveAuxiliary(stats: CharacterStats): void {
  if (stats.getModifiers().some((modifier) => modifier.id === 'skill.auxiliary-reserve')) return
  stats.addModifier({ id: 'skill.auxiliary-reserve', stat: 'maxEnergy', flat: 24 })
}
