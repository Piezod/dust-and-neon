import * as THREE from 'three'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { WaveDefinition, WaveSnapshot, WaveState, WaveSpawnGroup } from './Wave.types'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export class WaveManager {
  private readonly waves: readonly WaveDefinition[]
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

  constructor(waves: readonly WaveDefinition[], enemies: EnemyManager) {
    this.enemies = enemies
    this.validateDefinitions(waves)
    this.waves = waves
    this.stateValue = waves.length > 0 ? 'preparation' : 'completed'
    this.timeRemaining = waves[0]?.preparationSeconds ?? 0
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

  getSnapshot(): WaveSnapshot {
    const alive = this.enemies.aliveCount
    const pending = this.getPendingSpawns()
    return {
      state: this.stateValue,
      waveNumber: this.waves.length === 0 ? 0 : this.waveIndex + 1,
      totalWaves: this.waves.length,
      enemiesAlive: alive,
      spawnsPending: pending,
      enemiesRemaining: alive + pending,
      timeRemaining: this.timeRemaining,
      skippedSpawns: this.skippedSpawnCount,
      runComplete: this.stateValue === 'completed' && this.waveIndex >= this.waves.length - 1,
    }
  }

  update(deltaTime: number, playerAlive: boolean, playerPosition: THREE.Vector3): void {
    if (this.disposed) return
    if (!playerAlive) {
      this.stateValue = 'game-over'
      this.timeRemaining = 0
      return
    }
    if (this.stateValue === 'game-over' || this.stateValue === 'completed' && this.waveIndex >= this.waves.length - 1) return
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
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
          this.timeRemaining = this.waves[this.waveIndex].completionSeconds
        }
        break
      case 'completed':
        this.timeRemaining = Math.max(0, this.timeRemaining - elapsed)
        if (this.timeRemaining === 0 && this.waveIndex < this.waves.length - 1) {
          this.stateValue = 'upgrades'
          this.timeRemaining = this.waves[this.waveIndex].upgradesSeconds
        }
        break
      case 'upgrades':
        this.timeRemaining = Math.max(0, this.timeRemaining - elapsed)
        if (this.timeRemaining === 0) this.beginWave(this.waveIndex + 1)
        break
    }
  }

  dispose(): void {
    this.disposed = true
    this.stateValue = 'completed'
    this.timeRemaining = 0
  }

  private updateSpawning(deltaTime: number, playerPosition: THREE.Vector3): void {
    const wave = this.waves[this.waveIndex]
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
      if (this.enemies.trySpawn(group.enemyId, position, 0)) return true
    }
    return false
  }

  private getPendingSpawns(): number {
    const groups = this.waves[this.waveIndex]?.spawnGroups ?? []
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
    this.timeRemaining = this.waves[index].preparationSeconds
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