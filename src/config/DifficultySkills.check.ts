import * as THREE from 'three'
import { resolveDifficulty, sanitizeCustomDifficulty } from './difficulty.config'
import { SettingsStore } from '../app/SettingsStore'
import { ENEMY_DEFINITIONS } from './enemies.config'
import { CombatSystem } from '../combat/CombatSystem'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from './combat.config'
import type { Damageable } from '../combat/Damageable'
import { EnemyManager } from '../enemies/EnemyManager'
import { WaveManager } from '../waves/WaveManager'
import type { WaveDefinition } from '../waves/Wave.types'
import { SkillProgressStore } from '../abilities/SkillProgressStore'
import { Game } from '../core/Game'
import { DEFAULT_GAME_SETTINGS } from '../core/GameSettings.types'
import type { Player } from '../entities/Player'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

class TestPlayer implements Damageable {
  readonly combatId = 'difficulty-player'
  readonly faction = 'player'
  getCombatBounds(): { readonly x: number; readonly z: number; readonly radius: number } { return { x: 0, z: 0, radius: 0.4 } }
  applyDamage(): void {}
}

export function runDifficultySkillsChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, label)
  }
  const explorer = resolveDifficulty('explorer', sanitizeCustomDifficulty(undefined))
  const normal = resolveDifficulty('normal', sanitizeCustomDifficulty(undefined))
  const nightmare = resolveDifficulty('nightmare', sanitizeCustomDifficulty(undefined))
  close(explorer.enemyHealth, 0.8, 'Explorer health multiplier matches configuration')
  close(normal.enemyDamage, 1, 'Normal is the neutral balance reference')
  close(nightmare.spawnBudget, 1.4, 'Nightmare spawn budget is bounded to configured ceiling')
  close(nightmare.partyScale, 1, 'Party scaling stays separate from difficulty')
  const custom = sanitizeCustomDifficulty({ enemyHealth: 99, enemyDamage: -4, spawnBudget: 1.17 })
  close(custom.enemyHealth, 1.5, 'Custom health slider clamps to its safe maximum')
  close(custom.enemyDamage, 0.6, 'Custom damage slider clamps to its safe minimum')
  close(custom.spawnBudget, 1.17, 'Custom spawn budget retains valid values')

  const storage = new MemoryStorage()
  storage.setItem('dust-and-neon.settings.v1', JSON.stringify({ masterVolume: 0.4, graphicsQuality: 'low', showTouchControls: true }))
  const settings = new SettingsStore(storage)
  check(settings.settings.difficulty === 'normal', 'Older Settings data migrates to neutral difficulty')
  close(settings.settings.customDifficulty.enemyHealth, 1, 'Older Settings data receives neutral custom values')
  settings.update({ difficulty: 'nightmare', customDifficulty: { ...settings.settings.customDifficulty, enemyDamage: 1.2 } })
  const reloadedSettings = new SettingsStore(storage)
  check(reloadedSettings.settings.difficulty === 'nightmare', 'Difficulty preference persists')
  close(reloadedSettings.settings.customDifficulty.enemyDamage, 1.2, 'Custom multipliers persist with other Settings')

  const scene = new THREE.Scene()
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const manager = new EnemyManager(scene, [], combat, new TestPlayer(), ENEMY_DEFINITIONS)
  const source = ENEMY_DEFINITIONS.find((enemy) => enemy.id === 'alien-crawler')!
  try {
    const scale = {
      healthMultiplier: veteran().enemyHealth,
      damageMultiplier: veteran().enemyDamage,
      speedMultiplier: 1,
      cooldownMultiplier: veteran().attackCooldown,
      projectileSpeedMultiplier: veteran().projectileSpeed,
      telegraphMultiplier: veteran().telegraphDuration,
    }
    const created = manager.trySpawn(source.id, new THREE.Vector3(8, 0, 0), 0, scale)!
    close(created.definition.maxHealth, Math.round(source.maxHealth * 1.2), 'A spawned enemy gets one instance-scoped health scale')
    close(created.definition.attacks[0].damage, Math.round(source.attacks[0].damage * 1.25), 'A spawned enemy gets one damage scale')
    check(created.definition.attacks[0].windupSeconds! >= 0.3, 'Difficulty never drops attack reaction below the minimum')
    close(source.maxHealth, ENEMY_DEFINITIONS.find((enemy) => enemy.id === source.id)!.maxHealth, 'Global enemy definition is not mutated')

    const wave: WaveDefinition = {
      id: 'difficulty-check-wave', preparationSeconds: 1, completionSeconds: 1, upgradesSeconds: 24,
      spawnRadiusMin: 5, spawnRadiusMax: 7, spawnAttempts: 8,
      spawnGroups: [{ enemyId: source.id, count: 5, intervalSeconds: 0.5 }],
    }
    const waves = new WaveManager([wave], manager, { difficulty: veteran() })
    const waveView = waves as unknown as { readonly currentWave: WaveDefinition }
    check(waveView.currentWave.spawnGroups[0].count === 6, 'Veteran spawn budget scales encounter counts once')
    check(waveView.currentWave.spawnGroups[0].count === 6 && wave.spawnGroups[0].count === 5, 'Reading/scaling a wave does not compound modifiers or mutate its definition')
    waves.dispose()
  } finally {
    manager.dispose()
    combat.dispose()
  }

  const skillStorage = new MemoryStorage()
  const migrated = new SkillProgressStore(skillStorage, ['ghost-town', 'crystal-canyon', 'red-foundry'])
  check(migrated.isUnlocked('arc-voltaic') && migrated.isUnlocked('auxiliary-reserve') && migrated.isUnlocked('frost-pulse'), 'Completed legacy chapters migrate corresponding skill unlocks once')
  check(!migrated.isUnlocked('emergency-shield'), 'Missing chapter evidence does not grant future skills')
  check(migrated.equip('active', 0, 'arc-voltaic'), 'Unlocked implemented active skill equips')
  check(migrated.equip('active', 1, 'frost-pulse'), 'Second active slot equips independently')
  check(migrated.equip('passive', 0, 'auxiliary-reserve'), 'Unlocked passive skill equips in passive slot')
  check(!migrated.equip('active', 1, 'plasma-core'), 'Future skill cannot be equipped before implementation')
  check(!migrated.equip('active', 0, 'auxiliary-reserve'), 'Passive cannot enter an active slot')
  const persisted = new SkillProgressStore(skillStorage)
  check(persisted.getSnapshot().loadout.active.join(',') === 'arc-voltaic,frost-pulse', 'Equipped slots persist')
  const unlockFirst = migrated.unlockForChapter('spore-swamp')
  const unlockAgain = migrated.unlockForChapter('spore-swamp')
  check(unlockFirst.includes('emergency-shield') && unlockAgain.length === 0, 'Chapter reward grants Shield once even across repeated callbacks')
  const corrupt = new MemoryStorage()
  corrupt.setItem('dust-and-neon.skills.v1', '{bad-json')
  const recovered = new SkillProgressStore(corrupt)
  check(recovered.getSnapshot().unlocked.length === 0 && recovered.getSnapshot().loadout.active.every((id) => !id), 'Corrupt skill save falls back to safe empty progress')

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px'
  document.body.append(host)
  const game = new Game(host, {
    mode: 'infinite',
    settings: { ...DEFAULT_GAME_SETTINGS, showTouchControls: false },
    skillLoadout: { active: ['arc-voltaic', 'frost-pulse'], passive: ['auxiliary-reserve'] },
  })
  const harness = game as unknown as { readonly player: Player; readonly enemies: EnemyManager }
  try {
    check(harness.player.stats.getStat('maxEnergy') === 124, 'Equipped passive increases maximum energy through a stat modifier')
    const first = harness.enemies.trySpawn('alien-crawler', new THREE.Vector3(4, 0, 0), 0)
    const second = harness.enemies.trySpawn('alien-crawler', new THREE.Vector3(7, 0, 0), 0)
    check(first !== null && second !== null, 'Skill integration fixture spawns reachable targets')
    const firstHealth = first!.currentHealth
    const secondHealth = second!.currentHealth
    check(harness.player.abilities.tryActivate('arc-voltaic').activated && first!.currentHealth < firstHealth && second!.currentHealth < secondHealth,
      'Arc Voltaic damages two distinct targets through the integrated ability manager')
    const frostTarget = harness.enemies.trySpawn('alien-crawler', new THREE.Vector3(2, 0, 2), 0)
    check(frostTarget !== null, 'Frost Pulse fixture spawns a nearby target')
    const frostHealth = frostTarget!.currentHealth
    check(harness.player.abilities.tryActivate('frost-pulse').activated && frostTarget!.currentHealth < frostHealth,
      'Frost Pulse deals cryogenic damage through the integrated ability manager')
  } finally {
    game.dispose()
    host.remove()
  }
  const shieldHost = document.createElement('div')
  shieldHost.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px'
  document.body.append(shieldHost)
  const shieldGame = new Game(shieldHost, {
    mode: 'infinite',
    settings: { ...DEFAULT_GAME_SETTINGS, showTouchControls: false },
    skillLoadout: { active: ['emergency-shield'], passive: ['auxiliary-reserve'] },
  })
  const shieldHarness = shieldGame as unknown as { readonly player: Player }
  try {
    const shield = shieldHarness.player.abilities.tryActivate('emergency-shield')
    check(shield.activated && shieldHarness.player.abilities.absorbDamage(50) === 42,
      'Emergency Shield activates and absorbs its bounded damage capacity')
  } finally {
    shieldGame.dispose()
    shieldHost.remove()
  }
  return `${checks} difficulty and skill progression checks passed`
}

function veteran() {
  return resolveDifficulty('veteran', sanitizeCustomDifficulty(undefined))
}
