import * as THREE from 'three'
import { CharacterStats } from './CharacterStats'
import { PLAYER_BASE_STATS } from '../config/player.config'
import { Player } from '../entities/Player'
import { InputManager } from './InputManager'
import { PlayerController } from './PlayerController'
import { PlayerHUD } from '../ui/PlayerHUD'
import { runAbilityChecks } from '../abilities/Ability.check'
import { runCombatChecks } from '../combat/Combat.check'
import { runEnemyChecks } from '../enemies/Enemy.check'
import { runLootChecks } from '../loot/Loot.check'
import { runPlayerDeathChecks } from './PlayerDeath.check'
import { runWaveChecks } from '../waves/Wave.check'
import { DASH_ABILITY_CONFIG } from '../config/abilities.config'

export function runCharacterStatsChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9, label)
  }
  const rejects = (action: () => void, label: string): void => {
    let rejected = false
    try { action() } catch { rejected = true }
    check(rejected, label)
  }

  const base = { ...PLAYER_BASE_STATS }
  const stats = new CharacterStats(base)
  base.moveSpeed = 999
  close(stats.getStat('moveSpeed'), 5.5, 'Base values must be copied')
  close(stats.getBaseStat('moveSpeed'), 5.5, 'Base getter must expose original value')
  stats.takeDamage(30)
  stats.heal(10)
  close(stats.currentHealth, 80, 'Damage 30 and heal 10')
  stats.takeDamage(1000)
  close(stats.currentHealth, 0, 'Health lower bound')
  stats.heal(1000)
  close(stats.currentHealth, 100, 'Health upper bound')
  check(!stats.spendEnergy(101), 'Insufficient energy must reject spending')
  close(stats.currentEnergy, 100, 'Failed spending must be atomic')
  check(stats.spendEnergy(30), 'Enough energy must allow spending')
  stats.restoreEnergy(10)
  close(stats.currentEnergy, 80, 'Energy restore')
  stats.restoreEnergy(1000)
  close(stats.currentEnergy, 100, 'Energy upper bound')
  check(stats.spendEnergy(100), 'Spend all energy')
  close(stats.currentEnergy, 0, 'Energy lower bound')

  for (const [stat, resource] of [['maxHealth', 'currentHealth'], ['maxEnergy', 'currentEnergy']] as const) {
    const resources = new CharacterStats(PLAYER_BASE_STATS)
    resources.addModifier({ id: 'increase', stat, flat: 50 })
    close(resources.getStat(stat), 150, `${stat}: increased maximum`)
    close(resources[resource], 100, `${stat}: increase must not refill`)
    resources.addModifier({ id: 'decrease', stat, flat: -100 })
    close(resources[resource], 50, `${stat}: decrease must clamp`)
    resources.removeModifier('decrease')
    close(resources[resource], 50, `${stat}: removal must not refill`)
    resources.removeModifier('increase')
    close(resources.getStat(stat), 100, `${stat}: restored maximum`)
    close(resources[resource], 50, `${stat}: resource stays independent`)
  }

  const modifiers = [
    { id: 'flat', stat: 'moveSpeed' as const, flat: 2 },
    { id: 'percent-a', stat: 'moveSpeed' as const, percentage: 0.2 },
    { id: 'percent-b', stat: 'moveSpeed' as const, percentage: 0.3 },
  ]
  const ordered = new CharacterStats(PLAYER_BASE_STATS)
  const reversed = new CharacterStats(PLAYER_BASE_STATS)
  for (const modifier of modifiers) ordered.addModifier(modifier)
  for (const modifier of [...modifiers].reverse()) reversed.addModifier(modifier)
  close(ordered.getStat('moveSpeed'), 11.25, '(5.5 + 2) * (1 + 0.2 + 0.3)')
  check(ordered.getStat('moveSpeed') === reversed.getStat('moveSpeed'), 'Insertion order must not affect results')
  for (const modifier of modifiers) ordered.removeModifier(modifier.id)
  close(ordered.getStat('moveSpeed'), 5.5, 'Modifiers must be reversible')
  check(!ordered.removeModifier('missing'), 'Unknown removal must be harmless')
  const boost = { id: 'boost', stat: 'moveSpeed' as const, percentage: 0.2 }
  ordered.addModifier(boost)
  const snapshot = ordered.getModifiers()
  check(Object.isFrozen(snapshot) && Object.isFrozen(snapshot[0]), 'Modifier snapshots must be immutable')
  boost.percentage = 9
  close(ordered.getStat('moveSpeed'), 6.6, 'Modifiers must be copied')
  rejects(() => ordered.addModifier(boost), 'Duplicate ids must be rejected')
  ordered.removeModifier('boost')
  check(snapshot.length === 1 && ordered.getModifiers().length === 0, 'Modifier snapshots must not expose the live collection')

  const limits = new CharacterStats({ ...PLAYER_BASE_STATS, defense: -10, criticalChance: 2 })
  close(limits.getStat('defense'), 0, 'Defense lower bound')
  close(limits.getStat('criticalChance'), 1, 'Critical chance upper bound')
  limits.addModifier({ id: 'critical', stat: 'criticalChance', flat: -10 })
  close(limits.getStat('criticalChance'), 0, 'Critical chance lower bound')
  limits.addModifier({ id: 'stop', stat: 'moveSpeed', percentage: -2 })
  close(limits.getStat('moveSpeed'), 0, 'Speed lower bound')
  for (const amount of [-1, NaN, Infinity]) {
    rejects(() => stats.takeDamage(amount), 'Invalid damage')
    rejects(() => stats.heal(amount), 'Invalid healing')
    rejects(() => stats.spendEnergy(amount), 'Invalid energy spending')
    rejects(() => stats.restoreEnergy(amount), 'Invalid energy restoration')
  }
  rejects(() => stats.addModifier({ id: '', stat: 'defense', flat: 1 }), 'Empty modifier id')
  rejects(() => stats.addModifier({ id: 'invalid', stat: 'defense', percentage: NaN }), 'Non-finite modifier')
  rejects(() => new CharacterStats({ ...PLAYER_BASE_STATS, maxHealth: Infinity }), 'Non-finite base')
  stats.addModifier({ id: 'armor', stat: 'defense', flat: 20 })
  stats.takeDamage(30)
  close(stats.currentHealth, 70, 'Damage remains direct; combat mitigation is not implemented')

  const player = new Player()
  const keyboardTarget = new EventTarget()
  const input = new InputManager(keyboardTarget)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100)
  camera.position.set(26, 34, 32)
  camera.lookAt(0, 0, 0)
  const controller = new PlayerController(input, camera, player, canvas, [])
  const key = (type: string, code: string): void => {
    keyboardTarget.dispatchEvent(new KeyboardEvent(type, { code }))
  }
  try {
    const direction = new THREE.Vector3(1, 0, 0)
    let start = player.position.clone()
    player.update(direction, 1, [])
    close(player.position.distanceTo(start), 5.5, 'Original movement speed')
    player.stats.addModifier({ id: 'speed-20', stat: 'moveSpeed', percentage: 0.2 })
    start = player.position.clone()
    player.update(direction, 1, [])
    close(player.position.distanceTo(start), 6.6, 'Effective movement speed +20%')
    player.stats.removeModifier('speed-20')
    close(player.speed, 5.5, 'Player speed getter remains compatible')
    player.stats.addModifier({ id: 'stop', stat: 'moveSpeed', percentage: -1 })
    start = player.position.clone()
    player.update(direction, 1, [])
    close(player.position.distanceTo(start), 0, 'Zero speed must stop movement')
    check(player.velocity.toArray().every(Number.isFinite), 'Zero speed must keep velocity finite')
    player.root.traverse((object) => {
      check(object.matrix.elements.every(Number.isFinite), 'Visual transform must remain finite')
    })
    player.stats.removeModifier('stop')
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      start = player.position.clone()
      key('keydown', code)
      controller.updateMovement(1)
      key('keyup', code)
      close(player.position.distanceTo(start), 5.5, `${code} movement`)
    }
    start = player.position.clone()
    key('keydown', 'KeyW')
    key('keydown', 'KeyD')
    controller.updateMovement(1)
    key('keyup', 'KeyW')
    key('keyup', 'KeyD')
    close(player.position.distanceTo(start), 5.5, 'Diagonal WASD remains normalized')
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 300 }))
    controller.updateAim()
    close(player.orientation, Math.atan2(-player.position.x, -player.position.z), 'Mouse aiming at ground origin')
  } finally {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) key('keyup', code)
    controller.dispose()
    input.dispose()
    player.dispose()
  }
  return `${checks} checks passed`
}

export function runPlayerHUDChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;height:800px'
  document.body.append(container)
  const player = new Player()
  const input = new InputManager(container)
  const hud = new PlayerHUD(container, player.stats, player.abilities)
  const panel = container.querySelector<HTMLElement>('.hud-debug')!
  const bar = container.querySelector<HTMLElement>('[data-bar="health"]')!
  const fill = bar.firstElementChild as HTMLElement
  const button = (action: string): HTMLButtonElement => container.querySelector(`[data-action="${action}"]`)!
  const value = (key: string): string | null => container.querySelector(`[data-value="${key}"]`)!.textContent
  const f3 = (repeat = false): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F3', repeat, cancelable: true }))
  }
  const events = new AbortController()
  let escapedPointerEvents = 0
  window.addEventListener('pointerdown', () => escapedPointerEvents++, { signal: events.signal })
  try {
    check(panel.hidden, 'Debug starts closed')
    const abilityStatus = container.querySelector<HTMLElement>('.hud-ability[data-ability-id="dash"]')!
    check(abilityStatus.dataset.status === 'ready', 'HUD shows Dash as available')
    player.stats.spendEnergy(100)
    hud.update()
    check(abilityStatus.dataset.status === 'insufficient-energy', 'HUD indicates insufficient ability energy')
    player.stats.restoreEnergy(100)
    hud.update()
    check(abilityStatus.dataset.status === 'ready', 'HUD returns Dash to available when energy is restored')
    check(player.abilities.tryActivate('dash', { movementDirection: { x: 1, z: 0 } }).activated, 'HUD test starts Dash')
    hud.update()
    check(abilityStatus.dataset.status === 'active', 'HUD shows Dash while active')
    player.update(new THREE.Vector3(), 0.18, [])
    hud.update()
    check(abilityStatus.dataset.status === 'cooldown' && (abilityStatus.textContent ?? '').includes(String(DASH_ABILITY_CONFIG.cooldownSeconds)), 'HUD shows remaining Dash cooldown')
    player.stats.restoreEnergy(DASH_ABILITY_CONFIG.energyCost)
    player.stats.spendEnergy(101 - DASH_ABILITY_CONFIG.energyCost)
    hud.update()
    check(abilityStatus.dataset.status === 'insufficient-energy' && (abilityStatus.textContent ?? '').includes(String(DASH_ABILITY_CONFIG.cooldownSeconds)), 'HUD indicates insufficient energy and preserves cooldown status')
    player.stats.restoreEnergy(100)
    hud.update()
    f3()
    check(!panel.hidden, 'F3 opens debug')
    f3(true)
    check(!panel.hidden, 'Holding F3 must not toggle again')
    f3()
    check(panel.hidden, 'F3 closes debug')
    button('damage').click()
    check(player.stats.currentHealth === 80 && value('health') === '80 / 100', 'Damage updates domain and DOM immediately')
    check(fill.style.width === '80%', 'Health fill matches current resource')
    button('heal').click()
    check(player.stats.currentHealth === 100, 'Healing uses domain API')
    button('spend').click()
    check(player.stats.currentEnergy === 75 && value('energy') === '75 / 100', 'Energy spending updates immediately')
    button('restore').click()
    check(player.stats.currentEnergy === 100, 'Energy recovery uses domain API')
    for (const [key, stat, expected] of [['speed', 'moveSpeed', 6.6], ['damage', 'attackDamage', 22.5]] as const) {
      const toggle = container.querySelector<HTMLInputElement>(`[data-modifier="${key}"]`)!
      toggle.click()
      check(Math.abs(player.stats.getStat(stat) - expected) < 1e-9, `${key}: toggle changes effective stat`)
      toggle.dispatchEvent(new Event('change', { bubbles: true }))
      check(player.stats.getModifiers().filter((modifier) => modifier.stat === stat).length === 1, `${key}: repeated activation must not stack`)
      if (key === 'speed') {
        const start = player.position.clone()
        player.update(new THREE.Vector3(1, 0, 0), 1, [])
        check(Math.abs(player.position.distanceTo(start) - 6.6) < 1e-9, 'HUD speed boost changes real Player movement')
      }
      toggle.click()
      check(player.stats.getStat(stat) === player.stats.getBaseStat(stat), `${key}: removing boost restores original stat`)
    }
    check(value('base-moveSpeed') === '5,5' && value('criticalChance') === '5%', 'Base and critical percentage formatting')
    button('damage').click()
    button('spend').click()
    button('refill').click()
    check(player.stats.currentHealth === 100 && player.stats.currentEnergy === 100, 'Refill restores both resources through public APIs')
    player.stats.addModifier({ id: 'check.zero-health', stat: 'maxHealth', percentage: -1 })
    hud.update()
    check(fill.style.width === '0%' && bar.getAttribute('aria-valuemax') === '0', 'Zero maximum must produce an empty finite bar')
    player.stats.removeModifier('check.zero-health')
    player.stats.heal(1000)
    player.stats.restoreEnergy(1000)
    hud.update()
    check(fill.style.width === '100%', 'Resource bars must not exceed 100%')
    check(container.querySelector('[data-bar="health"]') === bar, 'Updates must reuse DOM nodes')
    button('damage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    check(escapedPointerEvents === 0, 'Panel pointer events must not reach scene listeners')
    button('damage').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    check(!input.isPressed('KeyW'), 'Panel keyboard events must not activate movement')
    container.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    button('damage').dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }))
    check(!input.isPressed('KeyW'), 'Key releases must still clear previously pressed keys')
    container.querySelector<HTMLInputElement>('[data-modifier="speed"]')!.click()
    hud.destroy()
    check(container.children.length === 0 && player.stats.getModifiers().length === 0, 'Destroy removes DOM and HUD-owned modifiers')
    const health = player.stats.currentHealth
    hud.update()
    const hidden = panel.hidden
    f3()
    check(panel.hidden === hidden, 'Destroy removes F3 listener')
    f3()
    hud.destroy()
    check(player.stats.currentHealth === health, 'Cleanup is idempotent and does not change resources')
  } finally {
    hud.destroy()
    events.abort()
    input.dispose()
    player.dispose()
    container.remove()
  }
  return `${checks} HUD checks passed`
}

export { runAbilityChecks }
export { runCombatChecks }
export { runEnemyChecks }
export { runLootChecks }
export { runPlayerDeathChecks }
export { runWaveChecks }
