import { AchievementManager } from '../achievements/AchievementManager'
import { CAMPAIGN_DEFINITION } from '../config/campaign.config'
import { GameEventBus } from '../events/GameEventBus'
import type { CampaignDefinition } from '../game-modes/GameMode.types'
import { CampaignProgress } from '../game-modes/CampaignProgress'
import { InfiniteRunRecordStore } from '../game-modes/InfiniteRunRecord'
import { SettingsStore } from './SettingsStore'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, String(value)) }
}

export function runAppFeatureChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const storage = new MemoryStorage()
  const settings = new SettingsStore(storage)
  const updatedSettings = settings.update({ masterVolume: 1.5, aimSensitivity: 0.1, graphicsQuality: 'ultra' as 'high' })
  check(updatedSettings.masterVolume === 1 && updatedSettings.aimSensitivity === 0.25, 'Settings clamp numeric ranges')
  check(updatedSettings.graphicsQuality === 'high', 'Unknown graphics quality falls back to the current setting')
  check(new SettingsStore(storage).settings.masterVolume === 1, 'Settings persist across store instances')

  const campaign: CampaignDefinition = {
    ...CAMPAIGN_DEFINITION,
    chapters: [{
      id: 'check-chapter',
      title: 'Check',
      missions: [
        { id: 'mission-one', title: 'First', provisional: true },
        { id: 'mission-two', title: 'Second', provisional: true },
      ],
    }],
  }
  const progress = new CampaignProgress(campaign, storage)
  check(progress.isUnlocked('mission-one') && !progress.isUnlocked('mission-two'), 'Campaign unlocks only its first mission initially')
  check(progress.completeMission('mission-one') && progress.isUnlocked('mission-two'), 'Completing a mission unlocks the next one')
  check(new CampaignProgress(campaign, storage).isCompleted('mission-one'), 'Campaign progress persists')

  const record = new InfiniteRunRecordStore(storage)
  record.update(4, 800)
  record.update(3, 1200)
  const reloadedRecord = new InfiniteRunRecordStore(storage).record
  check(reloadedRecord.bestWave === 4 && reloadedRecord.bestScore === 1200, 'Infinite record keeps independent bests and persists them')

  const events = new GameEventBus()
  const achievements = new AchievementManager(events, undefined, storage)
  const unlocked: string[] = []
  achievements.subscribe((achievement) => unlocked.push(achievement.id))
  for (let count = 0; count < 10; count++) {
    events.emit({
      type: 'enemy-killed',
      death: { enemyId: `enemy-${count}`, definitionId: 'alien-crawler', position: [0, 0, 0] },
    })
  }
  check(unlocked.includes('first-kill') && unlocked.includes('ten-kills'), 'Kill events unlock achievements at their thresholds')
  check(new AchievementManager(events, undefined, storage).getStates().filter((achievement) => achievement.unlocked).length === 2, 'Achievement unlocks persist')
  achievements.dispose()
  events.clear()
  return `${checks} app feature checks passed`
}
