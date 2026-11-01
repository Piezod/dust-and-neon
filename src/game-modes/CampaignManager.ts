import * as THREE from 'three'
import type { BossManager } from '../bosses/BossManager'
import type { CampaignChapterContent } from './CampaignChapter.types'
import type { BossSnapshot } from '../bosses/Boss.types'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { WaveManager } from '../waves/WaveManager'
import type { World } from '../world/World'
import type { BossDefinition } from '../bosses/Boss.types'
import type { DifficultyMultipliers } from '../config/difficulty.config'
import { NORMAL_DIFFICULTY } from '../config/difficulty.config'

export type CampaignState = 'chapter-intro' | 'battle' | 'boss-intro' | 'boss' | 'chapter-complete' | 'victory' | 'game-over'

export interface CampaignSnapshot {
  readonly state: CampaignState
  readonly chapterIndex: number
  readonly chapterCount: number
  readonly chapterId: string
  readonly chapterTitle: string
  readonly intro: string
  readonly timeRemaining: number
  readonly waveNumber: number
  readonly boss: BossSnapshot | null
}

export class CampaignManager {
  private readonly chapters: readonly CampaignChapterContent[]
  private readonly bosses: ReadonlyMap<string, BossDefinition>
  private readonly world: World
  private readonly waves: WaveManager
  private readonly bossManager: BossManager
  private readonly enemies: EnemyManager
  private readonly onChapterComplete: (chapterId: string) => void
  private readonly getDifficulty: () => DifficultyMultipliers
  private chapterIndex = 0
  private stateValue: CampaignState = 'chapter-intro'
  private timeRemaining = 2.8
  private disposed = false

  constructor(
    chapters: readonly CampaignChapterContent[],
    bosses: readonly BossDefinition[],
    world: World,
    waves: WaveManager,
    bossManager: BossManager,
    enemies: EnemyManager,
    onChapterComplete: (chapterId: string) => void = () => undefined,
    getDifficulty: () => DifficultyMultipliers = () => NORMAL_DIFFICULTY,
  ) {
    if (chapters.length === 0) throw new RangeError('Campaign requires at least one chapter')
    this.chapters = chapters
    this.bosses = new Map(bosses.map((boss) => [boss.id, boss]))
    this.world = world
    this.waves = waves
    this.bossManager = bossManager
    this.enemies = enemies
    this.onChapterComplete = onChapterComplete
    this.getDifficulty = getDifficulty
    for (const chapter of chapters) {
      if (!this.bosses.has(chapter.bossId)) throw new Error(`Unknown boss ${chapter.bossId} in chapter ${chapter.id}`)
    }
  }

  get state(): CampaignState {
    return this.stateValue
  }

  get acceptsPlayerInput(): boolean {
    return this.stateValue === 'battle' || this.stateValue === 'boss'
  }

  get runsWaves(): boolean {
    return this.stateValue === 'battle'
  }

  get runsBoss(): boolean {
    return this.stateValue === 'boss-intro' || this.stateValue === 'boss'
  }

  getSnapshot(): CampaignSnapshot {
    const chapter = this.currentChapter
    return {
      state: this.stateValue,
      chapterIndex: this.chapterIndex,
      chapterCount: this.chapters.length,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      intro: chapter.intro,
      timeRemaining: this.timeRemaining,
      waveNumber: this.chapters.slice(0, this.chapterIndex).reduce((total, entry) => total + entry.waves.length, this.stateValue === 'chapter-intro' ? 0 : this.waves.getSnapshot().waveNumber),
      boss: this.bossManager.getSnapshot(),
    }
  }

  update(deltaTime: number, playerAlive: boolean): void {
    if (this.disposed || this.stateValue === 'victory' || this.stateValue === 'game-over') return
    if (!playerAlive) {
      this.stateValue = 'game-over'
      return
    }
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0)
    this.timeRemaining = Math.max(0, this.timeRemaining - elapsed)

    if (this.stateValue === 'chapter-intro') {
      if (this.timeRemaining === 0) {
        this.waves.setDifficultyContext(this.getDifficulty())
        this.waves.replaceWaves(this.currentChapter.waves)
        this.stateValue = 'battle'
      }
      return
    }
    if (this.stateValue === 'battle') {
      if (!this.waves.getSnapshot().runComplete) return
      const definition = this.bosses.get(this.currentChapter.bossId)!
      const position = new THREE.Vector3(...this.currentChapter.bossPosition)
      if (!this.bossManager.start(definition, position, this.getDifficulty())) return
      this.stateValue = 'boss-intro'
      this.timeRemaining = 1.8
      return
    }
    if (this.stateValue === 'boss-intro' || this.stateValue === 'boss') {
      this.bossManager.update(elapsed)
      if (this.stateValue === 'boss-intro' && this.bossManager.isCombatReady) this.stateValue = 'boss'
      if (this.bossManager.isDefeated && this.bossManager.currentBoss === null) {
        this.stateValue = 'chapter-complete'
        this.timeRemaining = 2.2
      }
      return
    }
    if (this.stateValue === 'chapter-complete' && this.timeRemaining === 0) {
      this.onChapterComplete(this.currentChapter.id)
      if (this.chapterIndex + 1 >= this.chapters.length) {
        this.stateValue = 'victory'
        return
      }
      this.enemies.clear()
      this.chapterIndex++
      this.world.rebuildScenario(this.currentChapter.worldScenario)
      this.stateValue = 'chapter-intro'
      this.timeRemaining = 2.8
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
  }

  private get currentChapter(): CampaignChapterContent {
    return this.chapters[this.chapterIndex]
  }
}
