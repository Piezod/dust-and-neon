import * as THREE from 'three'
import type { CombatSystem } from '../combat/CombatSystem'
import type { CharacterStats } from '../core/CharacterStats'
import type { Damageable } from '../combat/Damageable'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { GameEventBus } from '../events/GameEventBus'
import type { Wallet } from '../loot/Wallet'
import type { BossDefinition, BossSnapshot } from './Boss.types'
import type { DifficultyMultipliers } from '../config/difficulty.config'
import { MINIMUM_ATTACK_REACTION_SECONDS, NORMAL_DIFFICULTY } from '../config/difficulty.config'
import { BossArena } from './BossArena'
import { Boss } from './Boss'

export class BossManager {
  private readonly scene: THREE.Scene
  private readonly combat: CombatSystem
  private readonly obstacles: readonly THREE.Box2[]
  private readonly player: CharacterStats
  private readonly playerTarget: Damageable
  private readonly enemies: EnemyManager
  private readonly wallet: Wallet
  private readonly events?: GameEventBus
  private readonly random: () => number
  private boss: Boss | null = null
  private arena: BossArena | null = null
  private definition: BossDefinition | null = null
  private defeated = false
  private rewardsApplied = false
  private disposed = false

  constructor(
    scene: THREE.Scene,
    combat: CombatSystem,
    obstacles: readonly THREE.Box2[],
    playerTarget: Damageable,
    playerStats: CharacterStats,
    enemies: EnemyManager,
    wallet: Wallet,
    events?: GameEventBus,
    random: () => number = Math.random,
  ) {
    this.scene = scene
    this.combat = combat
    this.obstacles = obstacles
    this.playerTarget = playerTarget
    this.player = playerStats
    this.enemies = enemies
    this.wallet = wallet
    this.events = events
    this.random = random
  }

  get active(): boolean {
    return this.boss !== null && !this.boss.isDefeated
  }

  get isCombatReady(): boolean {
    return this.boss?.isCombatReady === true
  }

  get isDefeated(): boolean {
    return this.defeated
  }

  get isDeathAnimationFinished(): boolean {
    return this.defeated && this.boss?.deathAnimationFinished === true
  }

  get currentBoss(): Boss | null {
    return this.boss
  }

  getSnapshot(): BossSnapshot | null {
    return this.boss?.getSnapshot() ?? null
  }

  start(definition: BossDefinition, position: THREE.Vector3, difficulty: DifficultyMultipliers = NORMAL_DIFFICULTY): boolean {
    if (this.disposed || this.boss) return false
    const adjustedDefinition = scaleBossDefinition(definition, difficulty)
    this.validateDefinition(adjustedDefinition)
    this.definition = adjustedDefinition
    this.defeated = false
    this.rewardsApplied = false
    this.boss = new Boss({
      definition: adjustedDefinition,
      position,
      scene: this.scene,
      combat: this.combat,
      player: this.playerTarget,
      obstacles: this.obstacles,
      hazards: this.enemies.hazards,
      events: this.events,
      random: this.random,
      summon: (enemyId, count) => this.summon(enemyId, count),
      onDefeated: (boss) => this.onBossDefeated(boss),
    })
    this.arena = new BossArena(this.scene, position, adjustedDefinition.arenaRadius, adjustedDefinition.arenaColor)
    this.scene.add(this.boss.root)
    this.combat.registerTarget(this.boss)
    return true
  }

  update(deltaTime: number): void {
    if (this.disposed || !this.boss) return
    this.arena?.update(deltaTime)
    this.boss.update(deltaTime)
    if (this.boss.deathAnimationFinished) {
      this.combat.unregisterTarget(this.boss.combatId)
      this.boss.dispose()
      this.boss = null
      this.arena?.dispose()
      this.arena = null
      this.definition = null
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.boss) {
      this.combat.unregisterTarget(this.boss.combatId)
      this.boss.dispose()
      this.boss = null
    }
    this.arena?.dispose()
    this.arena = null
  }

  private onBossDefeated(boss: Boss): void {
    if (this.defeated || this.boss !== boss) return
    this.defeated = true
    this.combat.unregisterTarget(boss.combatId)
    if (!this.rewardsApplied && this.definition) {
      this.rewardsApplied = true
      this.wallet.add(this.definition.rewards.gold)
      this.player.heal(this.definition.rewards.healthRecovery)
      this.player.restoreEnergy(this.definition.rewards.energyRecovery)
    }
  }

  private summon(enemyId: string, count: number): void {
    if (!this.boss || !this.definition || this.disposed) return
    const room = Math.max(0, this.definition.maxSummons - this.enemies.aliveCount)
    const summonCount = Math.min(room, Math.max(0, Math.floor(count)))
    for (let index = 0; index < summonCount; index++) {
      const angle = index * Math.PI * 2 / Math.max(1, summonCount) + this.random() * 0.3
      const position = this.boss.root.position.clone().add(new THREE.Vector3(Math.cos(angle) * 4, 0, Math.sin(angle) * 4))
      this.enemies.trySpawn(enemyId, position, 4)
    }
  }

  private validateDefinition(definition: BossDefinition): void {
    const attackIds = new Set(definition.attacks.map((attack) => attack.id))
    if (attackIds.size !== definition.attacks.length) throw new Error(`Boss ${definition.id} has duplicate attacks`)
    for (const phase of definition.phases) {
      for (const attackId of phase.attackIds) if (!attackIds.has(attackId)) throw new Error(`Boss phase ${phase.id} references unknown attack ${attackId}`)
    }
  }

}

function scaleBossDefinition(definition: BossDefinition, difficulty: DifficultyMultipliers): BossDefinition {
  return {
    ...definition,
    maxHealth: Math.max(1, Math.round(definition.maxHealth * difficulty.bossHealth)),
    maxSummons: Math.min(6, Math.max(0, Math.ceil(definition.maxSummons * difficulty.bossSummons))),
    rewards: {
      ...definition.rewards,
      healthRecovery: Math.max(0, Math.round(definition.rewards.healthRecovery * difficulty.resourceRecovery)),
      energyRecovery: Math.max(0, Math.round(definition.rewards.energyRecovery * difficulty.resourceRecovery)),
    },
    attacks: definition.attacks.map((attack) => ({
      ...attack,
      damage: Math.max(0, attack.damage * difficulty.bossDamage),
      cooldownSeconds: Math.max(0.35, attack.cooldownSeconds * difficulty.attackCooldown),
      windupSeconds: Math.max(MINIMUM_ATTACK_REACTION_SECONDS, attack.windupSeconds * difficulty.telegraphDuration),
      projectile: attack.projectile ? {
        ...attack.projectile,
        damage: Math.max(0, attack.projectile.damage * difficulty.bossDamage),
        projectileSpeed: attack.projectile.projectileSpeed * difficulty.projectileSpeed,
      } : undefined,
    })),
  }
}
