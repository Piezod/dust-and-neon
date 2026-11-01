import type { EnemyAttackPhase, EnemyDeathEvent } from '../enemies/Enemy.types'
import type { DamageStatusApplication, DamageType } from '../combat/Combat.types'
import type { LootReward } from '../loot/Loot.types'

export type GameEvent =
  | { readonly type: 'enemy-spawned'; readonly enemyId: string; readonly definitionId: string; readonly position: readonly [number, number, number]; readonly soundId?: string }
  | { readonly type: 'enemy-attacked'; readonly enemyId: string; readonly attackId: string; readonly position: readonly [number, number, number]; readonly soundId?: string }
  | { readonly type: 'enemy-attack-phase'; readonly enemyId: string; readonly attackId: string; readonly phase: EnemyAttackPhase | null; readonly progress: number; readonly position: readonly [number, number, number] }
  | { readonly type: 'enemy-damaged'; readonly enemyId: string; readonly amount: number; readonly damageType?: DamageType; readonly position: readonly [number, number, number]; readonly soundId?: string }
  | { readonly type: 'damage-status-applied'; readonly targetId: string; readonly status: DamageStatusApplication['type']; readonly durationSeconds: number }
  | { readonly type: 'enemy-killed'; readonly death: EnemyDeathEvent; readonly soundId?: string }
  | { readonly type: 'boss-started'; readonly bossId: string }
  | { readonly type: 'boss-damaged'; readonly bossId: string; readonly amount: number; readonly currentHealth: number; readonly maxHealth: number }
  | { readonly type: 'boss-phase-changed'; readonly bossId: string; readonly phaseId: string; readonly phaseIndex: number }
  | { readonly type: 'boss-phase-audio'; readonly soundId: string }
  | { readonly type: 'boss-attack-phase'; readonly bossId: string; readonly attackId: string; readonly phase: string | null; readonly progress: number; readonly position: readonly [number, number, number] }
  | { readonly type: 'boss-defeated'; readonly bossId: string }
  | { readonly type: 'wave-started'; readonly waveNumber: number }
  | { readonly type: 'wave-preparing'; readonly waveNumber: number }
  | { readonly type: 'wave-completed'; readonly waveNumber: number }
  | { readonly type: 'player-shot'; readonly attackId: string; readonly position: readonly [number, number, number]; readonly direction: readonly [number, number, number] }
  | { readonly type: 'projectile-spawned'; readonly projectileId: string; readonly position: readonly [number, number, number]; readonly direction: readonly [number, number, number]; readonly sourceFaction: string }
  | { readonly type: 'dash-activated'; readonly abilityId: string; readonly position: readonly [number, number, number] }
  | { readonly type: 'player-ability-used'; readonly abilityId: string; readonly position: readonly [number, number, number]; readonly targets: readonly (readonly [number, number, number])[]; readonly radius: number }
  | { readonly type: 'player-moved'; readonly position: readonly [number, number, number]; readonly speed: number }
  | { readonly type: 'player-damaged'; readonly amount: number; readonly position: readonly [number, number, number]; readonly sourcePosition?: readonly [number, number, number]; readonly lethal: boolean }
  | { readonly type: 'player-hit-source'; readonly position: readonly [number, number, number] }
  | { readonly type: 'loot-collected'; readonly reward: LootReward; readonly position: readonly [number, number, number]; readonly soundId: string }
  | { readonly type: 'projectile-impact'; readonly projectileId: string; readonly position: readonly [number, number, number]; readonly sourcePosition: readonly [number, number, number]; readonly sourceFaction: string; readonly targetFaction: string }
  | { readonly type: 'upgrade-purchased'; readonly upgradeId: string; readonly level: number }
  | { readonly type: 'perk-selected'; readonly perkId: string; readonly stacks: number; readonly soundId?: string }
  | { readonly type: 'menu-action'; readonly action: string }
  | { readonly type: 'debug-effect-requested'; readonly position: readonly [number, number, number] }
  | { readonly type: 'achievement-unlocked'; readonly achievementId: string }
  | { readonly type: 'game-over'; readonly waveNumber: number; readonly kills: number; readonly score: number }
  | { readonly type: 'run-completed'; readonly waveNumber: number; readonly kills: number; readonly score: number }

export type GameEventListener = (event: GameEvent) => void

export class GameEventBus {
  private readonly listeners = new Set<GameEventListener>()

  emit(event: GameEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.listeners.clear()
  }
}