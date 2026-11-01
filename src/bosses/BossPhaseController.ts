import type { BossPhaseDefinition } from './Boss.types'

export class BossPhaseController {
  private readonly phases: readonly BossPhaseDefinition[]
  private activeIndex = 0

  constructor(phases: readonly BossPhaseDefinition[]) {
    if (phases.length === 0) throw new RangeError('Boss must define at least one phase')
    const ids = new Set<string>()
    for (let index = 0; index < phases.length; index++) {
      const phase = phases[index]
      if (!phase.id || ids.has(phase.id)) throw new Error(`Invalid or duplicate boss phase id: ${phase.id}`)
      if (!Number.isFinite(phase.healthBelow) || phase.healthBelow < 0 || phase.healthBelow > 1) {
        throw new RangeError(`Boss phase ${phase.id} health threshold must be in [0, 1]`)
      }
      if (!Number.isFinite(phase.moveSpeedMultiplier) || phase.moveSpeedMultiplier <= 0) {
        throw new RangeError(`Boss phase ${phase.id} move speed multiplier must be positive`)
      }
      if (index > 0 && phases[index - 1].healthBelow <= phase.healthBelow) {
        throw new Error('Boss phase thresholds must be strictly descending')
      }
      ids.add(phase.id)
    }
    if (phases[0].healthBelow !== 1) throw new Error('The first boss phase must start at 100% health')
    this.phases = phases
  }

  get current(): BossPhaseDefinition {
    return this.phases[this.activeIndex]
  }

  get index(): number {
    return this.activeIndex
  }

  advance(healthRatio: number): readonly BossPhaseDefinition[] {
    const ratio = Math.max(0, Math.min(1, Number.isFinite(healthRatio) ? healthRatio : 0))
    const entered: BossPhaseDefinition[] = []
    while (this.activeIndex + 1 < this.phases.length && ratio <= this.phases[this.activeIndex + 1].healthBelow) {
      this.activeIndex++
      entered.push(this.current)
    }
    return entered
  }

  getPhases(): readonly BossPhaseDefinition[] {
    return this.phases
  }
}
