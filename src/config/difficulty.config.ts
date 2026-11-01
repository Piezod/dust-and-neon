export type DifficultyProfileId = 'explorer' | 'normal' | 'veteran' | 'nightmare' | 'custom'

export interface DifficultyMultipliers {
  readonly enemyHealth: number
  readonly enemyDamage: number
  readonly spawnBudget: number
  readonly attackCooldown: number
  readonly projectileSpeed: number
  readonly telegraphDuration: number
  readonly resourceRecovery: number
  readonly bossHealth: number
  readonly bossDamage: number
  readonly bossSummons: number
  readonly partyScale: number
}

export interface CustomDifficultySettings {
  readonly enemyHealth: number
  readonly enemyDamage: number
  readonly spawnBudget: number
  readonly attackCooldown: number
  readonly projectileSpeed: number
  readonly telegraphDuration: number
  readonly resourceRecovery: number
}

export interface DifficultyProfile {
  readonly id: Exclude<DifficultyProfileId, 'custom'>
  readonly label: string
  readonly description: string
  readonly multipliers: DifficultyMultipliers
}

const profile = (id: DifficultyProfile['id'], label: string, description: string, values: Omit<DifficultyMultipliers, 'bossHealth' | 'bossDamage' | 'bossSummons' | 'partyScale'>): DifficultyProfile => ({
  id,
  label,
  description,
  multipliers: { ...values, bossHealth: values.enemyHealth, bossDamage: values.enemyDamage, bossSummons: values.spawnBudget, partyScale: 1 },
})

export const DIFFICULTY_PROFILES: readonly DifficultyProfile[] = Object.freeze([
  profile('explorer', 'Explorador', 'Experiencia accesible: menos presión, avisos largos y más recursos recuperables.', {
    enemyHealth: 0.8, enemyDamage: 0.65, spawnBudget: 0.8, attackCooldown: 1.2, projectileSpeed: 0.85, telegraphDuration: 1.25, resourceRecovery: 1.25,
  }),
  profile('normal', 'Normal', 'Referencia de balance para el juego individual.', {
    enemyHealth: 1, enemyDamage: 1, spawnBudget: 1, attackCooldown: 1, projectileSpeed: 1, telegraphDuration: 1, resourceRecovery: 1,
  }),
  profile('veteran', 'Veterano', 'Exige dominar movimiento, cobertura y habilidades.', {
    enemyHealth: 1.2, enemyDamage: 1.25, spawnBudget: 1.2, attackCooldown: 0.9, projectileSpeed: 1.1, telegraphDuration: 0.95, resourceRecovery: 0.9,
  }),
  profile('nightmare', 'Pesadilla', 'Desafio alto con avisos legibles y límites de reacción conservados.', {
    enemyHealth: 1.4, enemyDamage: 1.5, spawnBudget: 1.4, attackCooldown: 0.8, projectileSpeed: 1.15, telegraphDuration: 0.9, resourceRecovery: 0.8,
  }),
])

export const NORMAL_DIFFICULTY = DIFFICULTY_PROFILES[1].multipliers

export const DEFAULT_CUSTOM_DIFFICULTY: CustomDifficultySettings = Object.freeze({
  enemyHealth: 1,
  enemyDamage: 1,
  spawnBudget: 1,
  attackCooldown: 1,
  projectileSpeed: 1,
  telegraphDuration: 1,
  resourceRecovery: 1,
})

export const CUSTOM_DIFFICULTY_RANGES: Readonly<Record<keyof CustomDifficultySettings, readonly [number, number]>> = Object.freeze({
  enemyHealth: [0.7, 1.5],
  enemyDamage: [0.6, 1.5],
  spawnBudget: [0.7, 1.4],
  attackCooldown: [0.75, 1.25],
  projectileSpeed: [0.8, 1.2],
  telegraphDuration: [0.9, 1.3],
  resourceRecovery: [0.75, 1.3],
})

export const MINIMUM_ATTACK_REACTION_SECONDS = 0.3
export const MAX_ACTIVE_ENEMIES = 14
export const MAX_SPAWN_BUDGET_MULTIPLIER = 1.4

export function resolveDifficulty(
  id: DifficultyProfileId,
  custom: CustomDifficultySettings,
  partyScale = 1,
): DifficultyMultipliers {
  const base = id === 'custom'
    ? { ...custom, bossHealth: custom.enemyHealth, bossDamage: custom.enemyDamage, bossSummons: custom.spawnBudget }
    : DIFFICULTY_PROFILES.find((entry) => entry.id === id)?.multipliers ?? DIFFICULTY_PROFILES[1].multipliers
  return {
    ...base,
    partyScale: clamp(partyScale, 1, 1.5),
    spawnBudget: Math.min(MAX_SPAWN_BUDGET_MULTIPLIER, base.spawnBudget),
  }
}

export function sanitizeDifficultyProfile(value: unknown): DifficultyProfileId {
  return value === 'explorer' || value === 'normal' || value === 'veteran' || value === 'nightmare' || value === 'custom' ? value : 'normal'
}

export function sanitizeCustomDifficulty(value: Partial<CustomDifficultySettings> | undefined): CustomDifficultySettings {
  const result = {} as Record<keyof CustomDifficultySettings, number>
  for (const key of Object.keys(DEFAULT_CUSTOM_DIFFICULTY) as (keyof CustomDifficultySettings)[]) {
    const [minimum, maximum] = CUSTOM_DIFFICULTY_RANGES[key]
    const candidate = value?.[key]
    result[key] = typeof candidate === 'number' && Number.isFinite(candidate)
      ? clamp(candidate, minimum, maximum)
      : DEFAULT_CUSTOM_DIFFICULTY[key]
  }
  return Object.freeze(result)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
