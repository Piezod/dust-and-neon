export type WaveState = 'preparation' | 'combat' | 'completed' | 'upgrades' | 'game-over'

export interface WaveSpawnGroup {
  readonly enemyId: string
  readonly count: number
  readonly intervalSeconds: number
}

export interface WaveDefinition {
  readonly id: string
  readonly preparationSeconds: number
  readonly completionSeconds: number
  readonly upgradesSeconds: number
  readonly spawnRadiusMin: number
  readonly spawnRadiusMax: number
  readonly spawnAttempts: number
  readonly spawnGroups: readonly WaveSpawnGroup[]
}

export interface WaveSnapshot {
  readonly state: WaveState
  readonly waveNumber: number
  readonly totalWaves: number
  readonly enemiesAlive: number
  readonly spawnsPending: number
  readonly enemiesRemaining: number
  readonly timeRemaining: number
  readonly skippedSpawns: number
  readonly runComplete: boolean
}