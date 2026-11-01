import type { BossManager } from '../bosses/BossManager'
import { BOSS_DEFINITIONS } from '../config/bosses.config'
import { CAMPAIGN_CHAPTERS } from '../config/campaignChapters.config'
import type { EnemyManager } from '../enemies/EnemyManager'
import type { WaveManager } from '../waves/WaveManager'
import type { World } from '../world/World'
import { CampaignManager } from './CampaignManager'
import { Game } from '../core/Game'
import type { CampaignState } from './CampaignManager'
import type { CampaignChapterContent } from './CampaignChapter.types'
import type { Player } from '../entities/Player'
import type { RunState } from '../progression/RunState'
import type { CombatSystem } from '../combat/CombatSystem'

interface CampaignGameHarness {
  tick(time: number): void
  readonly campaign: CampaignManager
  readonly player: Player
  readonly waves: WaveManager
  readonly enemies: EnemyManager
  readonly bossManager: BossManager
  readonly runState: RunState
  readonly combat: CombatSystem
  readonly world: World
}

export function runCampaignChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  check(CAMPAIGN_CHAPTERS.length === 6 && CAMPAIGN_CHAPTERS.reduce((total, chapter) => total + chapter.waves.length, 0) === 15,
    'Campaign content contains six chapters and fifteen configured waves')
  let wavesComplete = false
  let waveReplacements = 0
  let worldRebuilds = 0
  let enemyClears = 0
  let bossReady = false
  let bossDefeated = false
  let currentBoss: object | null = null
  let bossStarts = 0
  const completed: string[] = []
  const waves = {
    getSnapshot: () => ({ runComplete: wavesComplete }),
    replaceWaves: () => { waveReplacements++; wavesComplete = false },
    setDifficultyContext: () => undefined,
  } as unknown as WaveManager
  const world = { rebuildScenario: () => { worldRebuilds++ } } as unknown as World
  const enemies = { clear: () => { enemyClears++ } } as unknown as EnemyManager
  const bossManager = {
    get isCombatReady() { return bossReady },
    get isDefeated() { return bossDefeated },
    get currentBoss() { return currentBoss },
    start: () => {
      bossStarts++
      bossReady = false
      bossDefeated = false
      currentBoss = {}
      return true
    },
    update: () => undefined,
  } as unknown as BossManager
  const campaign = new CampaignManager(CAMPAIGN_CHAPTERS.slice(0, 2), BOSS_DEFINITIONS, world, waves, bossManager, enemies, (id) => completed.push(id))
  campaign.update(2.8, true)
  check(campaign.state === 'battle' && waveReplacements === 1, 'Chapter intro installs that chapter wave definitions')
  wavesComplete = true
  campaign.update(0, true)
  check(campaign.state === 'boss-intro' && bossStarts === 1, 'Final encounter starts its configured boss')
  bossReady = true
  campaign.update(0.1, true)
  check(campaign.state === 'boss', 'Boss intro transitions into combat when the boss is ready')
  bossDefeated = true
  currentBoss = null
  campaign.update(0.1, true)
  check(campaign.state === 'chapter-complete', 'Boss defeat enters the chapter completion state')
  campaign.update(2.2, true)
  check(campaign.state === 'chapter-intro' && worldRebuilds === 1 && enemyClears === 1, 'Next chapter rebuilds its world and clears prior summons')
  check(completed[0] === CAMPAIGN_CHAPTERS[0].id, 'Completed chapter is persisted once before transition')
  campaign.update(2.8, true)
  wavesComplete = true
  campaign.update(0, true)
  bossReady = true
  campaign.update(0.1, true)
  bossDefeated = true
  currentBoss = null
  campaign.update(0.1, true)
  campaign.update(2.2, true)
  check(campaign.state === 'victory' && completed.length === 2, 'Last boss ends the campaign after persisting the final chapter')

  const failedCampaign = new CampaignManager(CAMPAIGN_CHAPTERS.slice(0, 1), BOSS_DEFINITIONS, world, waves, bossManager, enemies)
  failedCampaign.update(0, false)
  check(failedCampaign.state === 'game-over', 'Player death terminates the campaign state')
  campaign.dispose()
  failedCampaign.dispose()
  return `${checks} campaign checks passed`
}

export function runCampaignGameChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const chapters: CampaignChapterContent[] = CAMPAIGN_CHAPTERS.map((chapter) => ({
    ...chapter,
    waves: [{
      ...chapter.waves[0],
      preparationSeconds: 0,
      completionSeconds: 0,
      upgradesSeconds: 0,
      spawnGroups: [{ enemyId: 'alien-crawler', count: 1, intervalSeconds: 0 }],
    }],
  }))
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px'
  document.body.append(host)
  const completed: string[] = []
  const results: { kind: string; wave: number; kills: number; score: number }[] = []
  const game = new Game(host, {
    mode: 'campaign', campaignChapters: chapters,
    onChapterComplete: (chapterId) => completed.push(chapterId),
    onEnd: (result) => results.push(result),
  })
  const harness = game as unknown as CampaignGameHarness
  let time = performance.now()
  const tick = (): void => {
    time += 50
    harness.tick(time)
  }
  const advanceTo = (state: CampaignState, maximumTicks: number): void => {
    for (let count = 0; count < maximumTicks && harness.campaign.state !== state; count++) tick()
    check(harness.campaign.state === state, `Campaign reaches ${state}; got ${harness.campaign.state} at chapter ${harness.campaign.getSnapshot().chapterIndex + 1}`)
  }
  try {
    harness.player.stats.addModifier({ id: 'campaign-check-health', stat: 'maxHealth', flat: 100000 })
    harness.player.stats.heal(100000)
    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
      advanceTo('battle', 80)
      const expectedLandmarks = [
        'Building:LAST LIGHT', 'CrystalBase:-10:-5', 'FoundryTank:-14',
        'SporeCap:spore-canopy-north', 'StormAntenna:north-antenna', 'EclipsePylon:north-eclipse-pylon',
      ]
      check(harness.world.root.getObjectByName(expectedLandmarks[chapterIndex]) !== undefined, `Chapter ${chapterIndex + 1} loads its own world landmarks`)
      let ticks = 0
      while (harness.campaign.state === 'battle' && ticks++ < 160) {
        tick()
        for (const enemy of harness.enemies.getAlive()) enemy.applyDamage({ sourceId: 'campaign-test', sourceFaction: 'player', amount: 100000, type: 'physical' })
      }
      advanceTo('boss', 80)
      const boss = harness.bossManager.currentBoss
      check(boss !== null, 'Chapter boss is registered as a combat target')
      boss!.applyDamage({ sourceId: 'campaign-test', sourceFaction: 'player', amount: boss!.definition.maxHealth, type: 'physical' })
      advanceTo('chapter-complete', 30)
      if (chapterIndex === 0) {
        const healthAfterRecovery = harness.player.stats.currentHealth
        harness.runState.beginIntermission(100 + chapterIndex)
        check(harness.runState.upgrades.purchase('revolver-damage').purchased, 'Boss gold can fund a real weapon upgrade')
        harness.runState.endIntermission()
        const damageAfterUpgrade = harness.combat.effectiveAttackStats.damage
        advanceTo('chapter-intro', 60)
        check(harness.player.stats.currentHealth === healthAfterRecovery, 'Chapter transition preserves recovered player health')
        check(harness.combat.effectiveAttackStats.damage === damageAfterUpgrade, 'Chapter transition preserves purchased upgrades')
        check(harness.world.root.getObjectByName('CrystalBase:-10:-5') !== undefined, 'Second chapter replaces the world with Crystal Canyon')
      } else if (chapterIndex === 1) {
        advanceTo('chapter-intro', 60)
        check(harness.world.root.getObjectByName('FoundryTank:-14') !== undefined, 'Third chapter replaces the world with Red Foundry')
      } else if (chapterIndex === chapters.length - 1) {
        advanceTo('victory', 60)
      } else {
        advanceTo('chapter-intro', 60)
      }
    }
    check(completed.length === 6 && results.length === 1 && results[0].kind === 'mission-complete', 'Full campaign persists all six chapters and emits one victory result')
    check(results[0].wave === chapters.length, 'Campaign integration reports one simulated test wave per chapter')
    return `${checks} full campaign game checks passed`
  } finally {
    game.dispose()
    host.remove()
  }
}
