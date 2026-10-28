import * as THREE from 'three'
import { CharacterStats } from './CharacterStats'
import { PLAYER_BASE_STATS } from '../config/player.config'
import { Player } from '../entities/Player'
import { InputManager } from './InputManager'
import { PlayerController } from './PlayerController'

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
  boost.percentage = 9
  close(ordered.getStat('moveSpeed'), 6.6, 'Modifiers must be copied')
  rejects(() => ordered.addModifier(boost), 'Duplicate ids must be rejected')
  ordered.removeModifier('boost')

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
  const input = new InputManager()
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100)
  camera.position.set(26, 34, 32)
  camera.lookAt(0, 0, 0)
  const controller = new PlayerController(input, camera, player, canvas, [])
  const key = (type: string, code: string): void => {
    window.dispatchEvent(new KeyboardEvent(type, { code }))
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