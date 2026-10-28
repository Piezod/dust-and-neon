export interface CharacterStatValues {
  maxHealth: number
  moveSpeed: number
  attackDamage: number
  maxEnergy: number
  defense: number
  criticalChance: number
}

export type StatKey = keyof CharacterStatValues

export interface StatModifier {
  readonly id: string
  readonly stat: StatKey
  readonly flat?: number
  readonly percentage?: number
}