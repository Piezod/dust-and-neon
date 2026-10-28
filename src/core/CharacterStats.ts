import type { CharacterStatValues, StatKey, StatModifier } from './CharacterStats.types'

export class CharacterStats {
  private readonly base: Readonly<CharacterStatValues>
  private effective: CharacterStatValues
  private readonly modifiers = new Map<string, Readonly<StatModifier>>()
  private health: number
  private energy: number

  constructor(base: Readonly<CharacterStatValues>) {
    this.base = Object.freeze({ ...base })
    this.effective = this.calculateStats([])
    this.health = this.effective.maxHealth
    this.energy = this.effective.maxEnergy
  }

  get currentHealth(): number {
    return this.health
  }

  get currentEnergy(): number {
    return this.energy
  }

  getStat(stat: StatKey): number {
    return this.effective[stat]
  }

  takeDamage(amount: number): void {
    this.validateAmount(amount)
    this.health = Math.max(0, this.health - amount)
  }

  heal(amount: number): void {
    this.validateAmount(amount)
    this.health = Math.min(this.effective.maxHealth, this.health + amount)
  }

  spendEnergy(amount: number): boolean {
    this.validateAmount(amount)
    if (amount > this.energy) return false
    this.energy -= amount
    return true
  }

  restoreEnergy(amount: number): void {
    this.validateAmount(amount)
    this.energy = Math.min(this.effective.maxEnergy, this.energy + amount)
  }

  addModifier(modifier: StatModifier): void {
    if (!modifier.id.trim()) throw new Error('Modifier id must not be empty')
    if (this.modifiers.has(modifier.id)) throw new Error(`Duplicate modifier id: ${modifier.id}`)
    if (!Object.hasOwn(this.base, modifier.stat)) throw new Error(`Unknown stat: ${modifier.stat}`)
    this.validateFinite(modifier.flat ?? 0)
    this.validateFinite(modifier.percentage ?? 0)
    const stored = Object.freeze({ ...modifier })
    const effective = this.calculateStats([...this.modifiers.values(), stored])
    this.modifiers.set(stored.id, stored)
    this.applyEffectiveStats(effective)
  }

  removeModifier(id: string): boolean {
    if (!this.modifiers.has(id)) return false
    const remaining = [...this.modifiers.values()].filter((modifier) => modifier.id !== id)
    const effective = this.calculateStats(remaining)
    this.modifiers.delete(id)
    this.applyEffectiveStats(effective)
    return true
  }

  private calculateStats(modifiers: readonly StatModifier[]): CharacterStatValues {
    const effective = { ...this.base }
    const ordered = [...modifiers].sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
    for (const stat of Object.keys(effective) as StatKey[]) {
      this.validateFinite(this.base[stat])
      let flat = 0
      let percentage = 0
      for (const modifier of ordered) {
        if (modifier.stat !== stat) continue
        flat += modifier.flat ?? 0
        percentage += modifier.percentage ?? 0
      }
      const value = (this.base[stat] + flat) * (1 + percentage)
      this.validateFinite(value)
      effective[stat] = Math.max(0, stat === 'criticalChance' ? Math.min(1, value) : value)
    }
    return effective
  }

  private applyEffectiveStats(effective: CharacterStatValues): void {
    this.effective = effective
    this.health = Math.min(this.health, effective.maxHealth)
    this.energy = Math.min(this.energy, effective.maxEnergy)
  }

  private validateAmount(amount: number): void {
    this.validateFinite(amount)
    if (amount < 0) throw new RangeError('Amount must be non-negative')
  }

  private validateFinite(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError('Stat values and amounts must be finite')
  }
}