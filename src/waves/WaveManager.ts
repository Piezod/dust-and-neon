import * as THREE from 'three'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { WaveDefinition, WaveSnapshot, WaveState, WaveSpawnGroup } from './Wave.types'
import type { GameEventBus } from '../events/GameEventBus'
import type { DifficultyMultipliers } from '../config/difficulty.config'
import { MAX_ACTIVE_ENEMIES, NORMAL_DIFFICULTY } from '../config/difficulty.config'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const INFINITE_ALIVE_CAP = 12

export interface WaveManagerOptions {
  readonly infinite?: boolean
  readonly events?: GameEventBus
  readonly maxAlive?: number
  readonly difficulty?: DifficultyMultipliers
}

export class WaveManager {
  private waves: readonly WaveDefinition[]
  private waveIndex = 0
  private stateValue: WaveState
  private timeRemaining = 0
  private groupIndex = 0
  private spawnedInGroup = 0
  private spawnTimer = 0
  private spawnSequence = 0
  private spawnAttempts = 0
  private skippedSpawnCount = 0
  private disposed = false
  private readonly enemies: EnemyManager
  private readonly infinite: boolean
  private maxAlive: number
  private readonly baseMaxAlive: number
  private difficulty: DifficultyMultipliers
  private readonly events?: GameEventBus

  constructor(waves: readonly WaveDefinition[], enemies: EnemyManager, options: WaveManagerOptions = {}) {
    this.enemies = enemies
    this.infinite = options.infinite ?? false
    this.baseMaxAlive = options.maxAlive ?? INFINITE_ALIVE_CAP
    this.difficulty = options.difficulty ?? NORMAL_DIFFICULTY
    this.maxAlive = Math.min(MAX_ACTIVE_ENEMIES, Math.max(1, Math.ceil(this.baseMaxAlive * this.difficulty.spawnBudget)))
    if (!Number.isSafeInteger(this.maxAlive) || this.maxAlive < 1) throw new RangeError('Maximum alive enemy count must be a positive integer')
    this.events = options.events
    this.validateDefinitions(waves)
    this.waves = waves
    this.stateValue = waves.length > 0 ? 'preparation' : 'completed'
    this.timeRemaining = waves[0]?.preparationSeconds ?? 0
    if (waves.length > 0) this.events?.emit({ type: 'wave-preparing', waveNumber: 1 })
  }

  get state(): WaveState {
    return this.stateValue
  }

  get acceptsPlayerInput(): boolean {
    return this.stateValue === 'preparation' || this.stateValue === 'combat'
  }

  get advancesSimulation(): boolean {
    return this.stateValue === 'preparation' || this.stateValue === 'combat'
  }

  get difficultyContext(): DifficultyMultipliers {
    return this.difficulty
  }

  setDifficultyContext(difficulty: DifficultyMultipliers): void {
    this.difficulty = difficulty
    this.maxAlive = Math.min(MAX_ACTIVE_ENEMIES, Math.max(1, Math.ceil(this.baseMaxAlive * difficulty.spawnBudget)))
  }

  getSnapshot(): WaveSnapshot {
    const alive = this.enemies.aliveCount
    const pending = this.getPendingSpawns()
    return {
      state: this.stateValue,
      waveNumber: this.waves.length === 0 && !this.infinite ? 0 : this.waveIndex + 1,
      totalWaves: this.infinite ? 0 : this.waves.length,
      enemiesAlive: alive,
      spawnsPending: pending,
      enemiesRemaining: alive + pending,
      timeRemaining: this.timeRemaining,
      skippedSpawns: this.skippedSpawnCount,
      runComplete: !this.infinite && this.stateValue === 'completed' && this.waveIndex >= this.waves.length - 1,
    }
  }

  replaceWaves(waves: readonly WaveDefinition[]): void {
    if (this.infinite) throw new Error('Infinite runs cannot replace their wave definitions')
    this.validateDefinitions(waves)
    this.waves = waves
    this.waveIndex = 0
    this.groupIndex = 0
    this.spawnedInGroup = 0
    this.spawnTimer = 0
    this.spawnAttempts = 0
    this.skippedSpawnCount = 0
    this.stateValue = waves.length > 0 ? 'preparation' : 'completed'
    this.timeRemaining = waves[0]?.preparationSeconds ?? 0
    if (waves.length > 0) this.events?.emit({ type: 'wave-preparing', waveNumber: 1 })
  }

  completeIntermission(): boolean {
    if (this.stateValue !== 'upgrades') return false
    if (!this.hasNextWave()) {
      this.stateValue = 'completed'
      this.timeRemaining = 0
      return true
    }
    this.beginWave(this.waveIndex + 1)
    return true
  }

  update(deltaTime: number, playerAlive: boolean, playerPosition: THREE.Vector3): void {
    if (this.disposed) return
    if (!playerAlive) {
      this.stateValue = 'game-over'
      this.timeRemaining = 0
      return
    }
    if (this.stateValue === 'game-over' || this.stateValue === 'completed' && !this.hasNextWave()) return
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    const previousState = this.stateValue
    switch (this.stateValue) {
      case 'preparation':
        this.timeRemaining = Math.max(0, this.timeRemaining - elapsed)
        if (this.timeRemaining === 0) {
          this.stateValue = 'combat'
          this.spawnTimer = 0
        }
        break
      case 'combat':
        this.updateSpawning(elapsed, playerPosition)
        if (this.getPendingSpawns() === 0 && this.enemies.aliveCount === 0) {
          this.stateValue = 'completed'
          this.timeRemaining = this.currentWave.completionSeconds
          this.events?.emit({ type: 'wave-completed', waveNumber: this.waveIndex + 1 })
        }
        break
      case 'completed':
        this.timeRemaining = Math.max(0, this.timeRemaining - elapsed)
        if (this.timeRemaining === 0 && this.hasNextWave()) {
          this.stateValue = 'upgrades'
          this.timeRemaining = this.currentWave.upgradesSeconds
        }
        break
      case 'upgrades':
        this.timeRemaining = Math.max(0, this.timeRemaining - elapsed)
        if (this.timeRemaining === 0) this.completeIntermission()
        break
    }
    if (previousState === 'preparation' && this.stateValue === 'combat') {
      this.events?.emit({ type: 'wave-started', waveNumber: this.waveIndex + 1 })
    }
  }

  dispose(): void {
    this.disposed = true
    this.stateValue = 'completed'
    this.timeRemaining = 0
  }

  private updateSpawning(deltaTime: number, playerPosition: THREE.Vector3): void {
    const wave = this.currentWave
    if (this.enemies.aliveCount >= this.maxAlive) return
    const group = wave.spawnGroups[this.groupIndex]
    if (!group) return
    this.spawnTimer = Math.max(0, this.spawnTimer - deltaTime)
    if (this.spawnTimer > 0) return

    if (this.trySpawn(group, wave, playerPosition)) {
      this.spawnedInGroup++
      this.spawnAttempts = 0
      this.spawnSequence++
    } else {
      this.spawnAttempts++
      if (this.spawnAttempts < wave.spawnAttempts) {
        this.spawnTimer = 0.2
        return
      }
      this.skippedSpawnCount++
      this.spawnedInGroup++
      this.spawnAttempts = 0
      this.spawnSequence++
    }

    if (this.spawnedInGroup >= group.count) {
      this.groupIndex++
      this.spawnedInGroup = 0
      this.spawnTimer = 0
    } else {
      this.spawnTimer = group.intervalSeconds
    }
  }

  private trySpawn(group: WaveSpawnGroup, wave: WaveDefinition, playerPosition: THREE.Vector3): boolean {
    const range = wave.spawnRadiusMax - wave.spawnRadiusMin
    for (let attempt = 0; attempt < wave.spawnAttempts; attempt++) {
      const sample = (this.spawnSequence + attempt) % Math.max(1, wave.spawnAttempts)
      const radius = wave.spawnRadiusMin + range * sample / Math.max(1, wave.spawnAttempts - 1)
      const angle = (this.spawnSequence + attempt) * GOLDEN_ANGLE
      const position = new THREE.Vector3(
        playerPosition.x + Math.cos(angle) * radius,
        0,
        playerPosition.z + Math.sin(angle) * radius,
      )
      if (this.enemies.trySpawn(group.enemyId, position, 0, group.difficulty)) return true
    }
    return false
  }

  private getPendingSpawns(): number {
    const groups = this.waves.length > 0 ? this.currentWave.spawnGroups : []
    let remaining = 0
    for (let index = this.groupIndex; index < groups.length; index++) {
      remaining += groups[index].count - (index === this.groupIndex ? this.spawnedInGroup : 0)
    }
    return Math.max(0, remaining)
  }

  private beginWave(index: number): void {
    this.waveIndex = index
    this.groupIndex = 0
    this.spawnedInGroup = 0
    this.spawnTimer = 0
    this.spawnAttempts = 0
    this.stateValue = 'preparation'
    this.timeRemaining = this.currentWave.preparationSeconds
    this.events?.emit({ type: 'wave-preparing', waveNumber: index + 1 })
  }

  private get currentWave(): WaveDefinition {
    const base = this.infinite ? this.waves[this.waveIndex % this.waves.length] : this.waves[this.waveIndex]
    if (!base) throw new Error('Infinite mode requires at least one base wave')
    const waveNumber = this.waveIndex + 1
    const waveScaling = this.infinite ? 1 + Math.min(1.4, (waveNumber - 1) * 0.18) : 1
    return {
      ...base,
      id: this.infinite ? `infinite-wave-${waveNumber}` : base.id,
      preparationSeconds: this.infinite ? Math.max(0.7, base.preparationSeconds - Math.min(0.8, (waveNumber - 1) * 0.06)) : base.preparationSeconds,
      upgradesSeconds: THREE.MathUtils.clamp(base.upgradesSeconds * this.difficulty.resourceRecovery, 15, 45),
      spawnRadiusMin: this.infinite ? base.spawnRadiusMin + Math.min(5, (waveNumber - 1) * 0.15) : base.spawnRadiusMin,
      spawnRadiusMax: this.infinite ? base.spawnRadiusMax + Math.min(7, (waveNumber - 1) * 0.18) : base.spawnRadiusMax,
      spawnGroups: base.spawnGroups.map((group) => ({
        ...group,
        count: Math.ceil(group.count * waveScaling * this.difficulty.spawnBudget),
        intervalSeconds: Math.max(0.25, this.infinite ? group.intervalSeconds - Math.min(0.26, (waveNumber - 1) * 0.015) : group.intervalSeconds),
        difficulty: {
          healthMultiplier: (group.difficulty?.healthMultiplier ?? 1) * this.difficulty.enemyHealth,
          damageMultiplier: (group.difficulty?.damageMultiplier ?? 1) * this.difficulty.enemyDamage,
          speedMultiplier: group.difficulty?.speedMultiplier ?? 1,
          cooldownMultiplier: (group.difficulty?.cooldownMultiplier ?? 1) * this.difficulty.attackCooldown,
          projectileSpeedMultiplier: this.difficulty.projectileSpeed,
          telegraphMultiplier: this.difficulty.telegraphDuration,
        },
      })),
    }
  }

  private hasNextWave(): boolean {
    return this.infinite || this.waveIndex < this.waves.length - 1
  }

  private validateDefinitions(waves: readonly WaveDefinition[]): void {
    const ids = new Set<string>()
    for (const wave of waves) {
      if (!wave.id || ids.has(wave.id)) throw new Error(`Invalid or duplicate wave id: ${wave.id}`)
      ids.add(wave.id)
      for (const [label, value] of [
        ['preparationSeconds', wave.preparationSeconds],
        ['completionSeconds', wave.completionSeconds],
        ['upgradesSeconds', wave.upgradesSeconds],
        ['spawnRadiusMin', wave.spawnRadiusMin],
        ['spawnRadiusMax', wave.spawnRadiusMax],
      ] as const) {
        if (!Number.isFinite(value) || value < 0) throw new RangeError(`Wave ${label} must be non-negative and finite`)
      }
      if (wave.spawnRadiusMax < wave.spawnRadiusMin || !Number.isSafeInteger(wave.spawnAttempts) || wave.spawnAttempts < 1) {
        throw new RangeError(`Wave ${wave.id} spawn parameters are invalid`)
      }
      for (const group of wave.spawnGroups) {
        if (!group.enemyId || !Number.isSafeInteger(group.count) || group.count < 0 || !Number.isFinite(group.intervalSeconds) || group.intervalSeconds < 0) {
          throw new RangeError(`Wave ${wave.id} has an invalid spawn group`)
        }
      }
    }
  }
}