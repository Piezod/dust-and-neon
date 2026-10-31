import type { WaveDefinition } from '../waves/Wave.types'

export const WAVE_DEFINITIONS: readonly WaveDefinition[] = Object.freeze([
  Object.freeze({
    id: 'wave-01',
    preparationSeconds: 2,
    completionSeconds: 1.2,
    upgradesSeconds: 3,
    spawnRadiusMin: 11,
    spawnRadiusMax: 16,
    spawnAttempts: 12,
    spawnGroups: Object.freeze([
      Object.freeze({ enemyId: 'alien-crawler', count: 3, intervalSeconds: 0.8 }),
      Object.freeze({ enemyId: 'mechanical-outlaw', count: 1, intervalSeconds: 1.2 }),
    ]),
  }),
  Object.freeze({
    id: 'wave-02',
    preparationSeconds: 2.5,
    completionSeconds: 1.2,
    upgradesSeconds: 3,
    spawnRadiusMin: 12,
    spawnRadiusMax: 17,
    spawnAttempts: 12,
    spawnGroups: Object.freeze([
      Object.freeze({ enemyId: 'alien-crawler', count: 4, intervalSeconds: 0.7 }),
      Object.freeze({ enemyId: 'mechanical-outlaw', count: 2, intervalSeconds: 1.1 }),
    ]),
  }),
])