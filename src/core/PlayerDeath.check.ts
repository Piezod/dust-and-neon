import * as THREE from 'three'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { InputManager } from './InputManager'
import { PlayerController } from './PlayerController'
import { Player } from '../entities/Player'
import { CombatSystem } from '../combat/CombatSystem'

export function runPlayerDeathChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const scene = new THREE.Scene()
  const player = new Player()
  scene.add(player.root)
  const combat = new CombatSystem(scene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => player.stats.isAlive)
  const inputTarget = new EventTarget()
  const input = new InputManager(inputTarget)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 180)
  camera.position.copy(player.position).add(new THREE.Vector3(26, 34, 32))
  camera.lookAt(player.position)
  const controller = new PlayerController(input, camera, player, canvas, [])
  const key = (type: string, code: string): void => {
    inputTarget.dispatchEvent(new KeyboardEvent(type, { code }))
  }

  try {
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 620, clientY: 280 }))
    controller.updateAim()
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 3 }))
    check(player.isAlive && controller.isFiring, 'Living player can start a held attack')
    combat.update(0, controller.isFiring, player.getMuzzlePosition(new THREE.Vector3()), controller.getAimPoint(new THREE.Vector3()))
    check(combat.shotsFired === 1, 'Living player can fire the revolver')

    key('keydown', 'ShiftLeft')
    const dashResult = player.abilities.tryActivate('dash', { movementDirection: { x: 1, z: 0 } })
    key('keyup', 'ShiftLeft')
    check(dashResult.activated && player.abilities.getStates()[0]?.active, 'Living player can activate an ability')
    const energyAtDeath = player.stats.currentEnergy
    player.stats.takeDamage(1000)
    check(!player.isAlive && !player.stats.isAlive, 'Life state derives from zero health')
    controller.setGameplayEnabled(false)
    player.abilities.cancelAll()
    check(!controller.isFiring, 'Death cancels held firing input')
    check(player.abilities.getStates().every((ability) => !ability.active), 'Death cancels active abilities')

    const rejectedAbility = player.abilities.tryActivate('dash', { movementDirection: { x: 0, z: 1 } })
    check(!rejectedAbility.activated && rejectedAbility.reason === 'dead', 'AbilityManager rejects offensive activation while dead')
    check(!player.stats.spendEnergy(1) && player.stats.currentEnergy === energyAtDeath, 'Dead player cannot spend energy')
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 4 }))
    check(!controller.isFiring, 'A new mouse press remains blocked while dead')
    const positionAtDeath = player.position.clone()
    player.update(new THREE.Vector3(1, 0, 0), 0.1, [])
    check(player.position.distanceTo(positionAtDeath) === 0, 'Dead player update does not move the character')
    combat.update(0.5, true, player.getMuzzlePosition(new THREE.Vector3()), controller.getAimPoint(new THREE.Vector3()))
    check(combat.shotsFired === 1, 'Held/repeated attack cannot create new shots after death')
    const projectileCount = combat.projectileCount
    combat.spawnProjectile(REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, player.getMuzzlePosition(new THREE.Vector3()), new THREE.Vector3(1, 0, 0))
    check(combat.projectileCount === projectileCount, 'Direct player projectile requests are rejected while dead')
    canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, isPrimary: true, pointerId: 4 }))
  } finally {
    controller.dispose()
    input.dispose()
    combat.dispose()
    player.dispose()
  }
  return `${checks} player-death checks passed`
}