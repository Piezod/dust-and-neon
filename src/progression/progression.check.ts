import * as THREE from 'three'
import { CharacterStats } from '../core/CharacterStats'
import { PLAYER_BASE_STATS } from '../config/player.config'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { CombatSystem } from '../combat/CombatSystem'
import { RunState } from './RunState'
import type { PerkDefinition } from './Progression.types'
import { PerkManager } from './PerkManager'
import { ProgressionEffectApplier } from './ProgressionEffectApplier'
import { UPGRADE_DEFINITIONS, PERK_DEFINITIONS, PERK_CHOICES_PER_INTERMISSION } from '../config/progression.config'
import { IntermissionPanel } from '../ui/IntermissionPanel'
import type { WaveManager } from '../waves/WaveManager'
import { Game } from '../core/Game'
import type { Player } from '../entities/Player'
import type { EnemyManager } from '../enemies/EnemyManager'

interface GameProgressionHarness {
  tick(time: number): void
  readonly renderer: THREE.WebGLRenderer
  readonly waves: WaveManager
  readonly player: Player
  readonly enemies: EnemyManager
  readonly runState: RunState
  readonly combat: CombatSystem
  readonly intermission: IntermissionPanel
}

export function runGameLifecycleChecks(): string {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px'
  document.body.append(host)
  const results: { kind: string; wave: number; kills: number; score: number }[] = []
  const game = new Game(host, { mode: 'infinite', onEnd: (result) => results.push(result) })
  const harness = game as unknown as GameProgressionHarness
  try {
    harness.tick(50)
    const canvas = harness.renderer.domElement
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context) throw new Error('Game renderer did not create a WebGL context')
    const pixel = new Uint8Array(4)
    let hasRenderedPixel = false
    for (let row = 1; row <= 5 && !hasRenderedPixel; row++) {
      for (let column = 1; column <= 5 && !hasRenderedPixel; column++) {
        context.readPixels(Math.floor(canvas.width * column / 6), Math.floor(canvas.height * row / 6), 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel)
        hasRenderedPixel = pixel[0] + pixel[1] + pixel[2] > 15
      }
    }
    if (!hasRenderedPixel) throw new Error('Game canvas contains no rendered scene pixels')
    harness.player.stats.takeDamage(harness.player.stats.currentHealth)
    harness.tick(100)
    if (results.length !== 1 || results[0].kind !== 'game-over' || results[0].wave !== 1) {
      throw new Error(`Game-over callback mismatch: ${JSON.stringify(results)}`)
    }
    return '1 Game lifecycle check passed'
  } finally {
    game.dispose()
    host.remove()
  }
}

export function runProgressionChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string, tolerance = 1e-8): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label)
  }
  const scene = new THREE.Scene()
  const firstStats = new CharacterStats(PLAYER_BASE_STATS)
  const secondStats = new CharacterStats(PLAYER_BASE_STATS)
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const run = new RunState(firstStats, combat, UPGRADE_DEFINITIONS, PERK_DEFINITIONS, PERK_CHOICES_PER_INTERMISSION)
  const secondCombat = new CombatSystem(new THREE.Scene(), [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const secondRun = new RunState(secondStats, secondCombat, UPGRADE_DEFINITIONS, PERK_DEFINITIONS, PERK_CHOICES_PER_INTERMISSION)
  try {
    const outsideIntermission = run.upgrades.purchase('revolver-damage')
    check(!outsideIntermission.purchased && outsideIntermission.reason === 'wrong-state', 'Upgrades are unavailable outside intermission')
    run.wallet.add(300)
    run.beginIntermission(1)
    const missingRequirement = run.upgrades.purchase('revolver-cadence')
    check(!missingRequirement.purchased && missingRequirement.reason === 'requirements', 'Upgrade requirements are enforced')
    check(run.upgrades.purchase('revolver-damage').purchased, 'Upgrade purchases with enough gold')
    close(combat.effectiveAttackStats.damage, 20, 'Damage upgrade changes this weapon instance')
    close(secondCombat.effectiveAttackStats.damage, 15, 'Weapon upgrade does not leak to another run instance')
    close(REVOLVER_ATTACK.damage, 15, 'Weapon definition remains immutable')
    check(run.upgrades.purchase('revolver-cadence').purchased, 'Cadence upgrade unlocks after prerequisite')
    close(combat.effectiveAttackStats.shotsPerSecond, 2.2, 'Cadence upgrade changes weapon fire rate')
    check(run.upgrades.purchase('max-health').purchased, 'Health upgrade can be purchased')
    close(firstStats.getStat('maxHealth'), 120, 'Health upgrade uses CharacterStats modifier')
    close(secondStats.getStat('maxHealth'), 100, 'Health upgrade is scoped to one character instance')
    check(run.upgrades.purchase('revolver-damage').purchased && run.upgrades.purchase('revolver-damage').purchased, 'Damage upgrade can reach configured max level')
    const maxDamage = run.upgrades.purchase('revolver-damage')
    check(!maxDamage.purchased && maxDamage.reason === 'max-level', 'Upgrade maximum level is enforced')
    check(run.upgrades.purchase('max-health').purchased, 'Second health upgrade level can be purchased')
    const maxHealth = run.upgrades.purchase('max-health')
    check(!maxHealth.purchased && maxHealth.reason === 'max-level', 'Health upgrade maximum level is enforced')
    run.wallet.spend(run.wallet.balance)
    const insufficientGold = run.upgrades.purchase('revolver-cadence')
    check(!insufficientGold.purchased && insufficientGold.reason === 'insufficient-gold', 'Upgrade purchase rejects insufficient gold')

    run.perks.beginIntermission('wave:1')
    check(run.perks.select('iron-heart').selected, 'Perk can be chosen during intermission')
    close(firstStats.getStat('maxHealth'), 155, 'Perk applies to current character instance')
    const choiceLimit = run.perks.select('quickdraw')
    check(!choiceLimit.selected && choiceLimit.reason === 'choice-limit', 'Intermission enforces perk choice limit')
    run.endIntermission()
    const closedChoice = run.perks.select('quickdraw')
    check(!closedChoice.selected && closedChoice.reason === 'intermission-closed', 'Perks cannot be selected outside intermission')
    run.beginIntermission(2)
    const duplicatePerk = run.perks.select('iron-heart')
    check(!duplicatePerk.selected && duplicatePerk.reason === 'already-selected', 'Unique perk cannot stack across waves')
    check(run.perks.select('quickdraw').selected, 'Different unique perk can be selected in a later intermission')
    close(combat.effectiveAttackStats.shotsPerSecond, 2.4, 'Perk cadence effect stacks with purchased upgrade')
    run.endIntermission()

    const stackable: PerkDefinition = {
      id: 'check.stackable',
      name: 'Stack test',
      description: 'test',
      stackingRule: 'stackable',
      maxStacks: 2,
      effects: [{ target: 'character', stat: 'defense', flat: 1 }],
    }
    const stackEffects = new ProgressionEffectApplier(secondStats, secondCombat)
    const stackManager = new PerkManager(stackEffects, [stackable], 2)
    stackManager.beginIntermission('stack-wave-1')
    check(stackManager.select('check.stackable').selected, 'Stackable perk accepts first stack')
    check(stackManager.select('check.stackable').selected, 'Stackable perk accepts second stack when choices allow')
    close(secondStats.getStat('defense'), 2, 'Stackable effects apply independently')
    const maxPerkStacks = stackManager.select('check.stackable')
    check(!maxPerkStacks.selected && maxPerkStacks.reason === 'max-stacks', 'Perk max stack count is enforced')
    stackManager.reset()
    close(secondStats.getStat('defense'), 0, 'Perk reset removes its modifiers')

    const uiRun = new RunState(new CharacterStats(PLAYER_BASE_STATS), new CombatSystem(new THREE.Scene(), [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE), UPGRADE_DEFINITIONS, PERK_DEFINITIONS)
    uiRun.wallet.add(30)
    uiRun.beginIntermission(1)
    let uiWaveState: 'upgrades' | 'preparation' = 'upgrades'
    const waveController = {
      get state() { return uiWaveState },
      getSnapshot: () => ({ state: uiWaveState, waveNumber: 1, totalWaves: 2, enemiesRemaining: 0 }),
      completeIntermission: (): boolean => {
        uiWaveState = 'preparation'
        return true
      },
    } as unknown as WaveManager
    const container = document.createElement('div')
    document.body.append(container)
    const panel = new IntermissionPanel(container, waveController, uiRun)
    try {
      panel.update()
      check(!container.querySelector<HTMLElement>('.intermission')!.hidden, 'Intermission panel opens in upgrades state')
      container.querySelector<HTMLButtonElement>('[data-action="upgrade"][data-id="revolver-damage"]')!.click()
      close(uiRun.wallet.balance, 5, 'Intermission UI delegates purchase to RunState')
      container.querySelector<HTMLButtonElement>('[data-action="perk"][data-id="quickdraw"]')!.click()
      check(uiRun.perks.getStates().some((perk) => perk.id === 'quickdraw' && perk.stacks === 1), 'Intermission UI delegates perk selection')
      container.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click()
      check(container.querySelector<HTMLElement>('.intermission')!.hidden, 'Continue closes the intermission panel')
    } finally {
      panel.destroy()
      uiRun.reset()
      container.remove()
    }

    run.reset()
    close(run.wallet.balance, 0, 'Run reset clears wallet')
    close(firstStats.getStat('maxHealth'), 100, 'Run reset removes character upgrade and perk modifiers')
    close(combat.effectiveAttackStats.damage, 15, 'Run reset restores weapon damage')
    close(combat.effectiveAttackStats.shotsPerSecond, 2, 'Run reset restores weapon cadence')
    const resetPurchase = run.upgrades.purchase('revolver-damage')
    check(!resetPurchase.purchased && resetPurchase.reason === 'wrong-state', 'Reset disables upgrade purchasing')
  } finally {
    run.reset()
    secondRun.reset()
    combat.dispose()
    secondCombat.dispose()
  }
  return `${checks} progression checks passed`
}

export function runGameProgressionChecks(): string {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px'
  document.body.append(host)
  const game = new Game(host, { mode: 'infinite' })
  const harness = game as unknown as GameProgressionHarness
  const currentWaveState = (): string => harness.waves.state
  let time = 1000
  const tick = (frames: number): void => {
    for (let frame = 0; frame < frames; frame++) {
      time += 50
      harness.tick(time)
    }
  }
  try {
    tick(40)
    if (currentWaveState() !== 'combat') throw new Error('Wave did not leave preparation')
    tick(100)
    for (const enemy of harness.enemies.getAlive()) {
      enemy.applyDamage({ sourceId: harness.player.combatId, sourceFaction: harness.player.faction, amount: 1000, type: 'physical' })
    }
    tick(1)
    if (currentWaveState() !== 'completed') throw new Error('Cleared wave did not complete')
    tick(24)
    if (currentWaveState() !== 'upgrades') throw new Error('Wave completion did not open intermission')
    harness.intermission.update()
    if (host.querySelector<HTMLElement>('.intermission')?.hidden) throw new Error('Intermission UI did not open')
    harness.runState.wallet.add(100)
    harness.intermission.update()
    host.querySelector<HTMLButtonElement>('[data-action="upgrade"][data-id="revolver-damage"]')?.click()
    host.querySelector<HTMLButtonElement>('[data-action="perk"][data-id="iron-heart"]')?.click()
    const weaponDamage = harness.combat.effectiveAttackStats.damage
    const maxHealth = harness.player.stats.getStat('maxHealth')
    host.querySelector<HTMLButtonElement>('[data-action="continue"]')?.click()
    harness.intermission.update()
    if (weaponDamage !== 20 || maxHealth !== 115 || harness.runState.wallet.balance !== 75) {
      throw new Error(`Progression effects or wallet mismatch: ${weaponDamage}/${maxHealth}/${harness.runState.wallet.balance}`)
    }
    if (currentWaveState() !== 'preparation' || !host.querySelector<HTMLElement>('.intermission')?.hidden) {
      throw new Error('Continue did not resume the next wave')
    }
    return '1 Game progression integration check passed'
  } finally {
    game.dispose()
    host.remove()
  }
}