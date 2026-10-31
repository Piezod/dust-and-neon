import * as THREE from 'three'
import { Player } from '../entities/Player'
import { InputManager } from '../core/InputManager'
import { PlayerController } from '../core/PlayerController'
import { DASH_ABILITY_CONFIG } from '../config/abilities.config'

const DASH_ID = 'dash'
const DASH_DISTANCE = DASH_ABILITY_CONFIG.speed * DASH_ABILITY_CONFIG.durationSeconds

export function runAbilityChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string, tolerance = 1e-8): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label)
  }
  const direction = { x: 1, z: 0 }
  const createPlayer = (): Player => new Player()

  const player = createPlayer()
  try {
    const manager = player.abilities
    const start = player.position.clone()
    const activated = manager.tryActivate(DASH_ID, { movementDirection: direction })
    check(activated.activated, 'Dash activates when ready')
    close(player.stats.currentEnergy, 100 - DASH_ABILITY_CONFIG.energyCost, 'Dash consumes its configured energy cost')
    check(manager.getStates()[0]?.active, 'Dash state becomes active')
    const repeated = manager.tryActivate(DASH_ID, { movementDirection: direction })
    check(!repeated.activated && repeated.reason === 'already-active', 'Dash cannot activate while already running')
    close(player.stats.currentEnergy, 100 - DASH_ABILITY_CONFIG.energyCost, 'Rejected concurrent activation consumes no energy')

    const firstDashStep = DASH_ABILITY_CONFIG.durationSeconds / 2
    player.update(new THREE.Vector3(), firstDashStep, [])
    close(player.position.x - start.x, DASH_DISTANCE / 2, 'Dash uses captured direction when WASD is released')
    check(manager.getStates()[0]?.active, 'Dash remains active before its duration expires')
    player.update(new THREE.Vector3(), DASH_ABILITY_CONFIG.durationSeconds - firstDashStep, [])
    close(player.position.x - start.x, DASH_DISTANCE, 'Dash distance is configured speed times duration')
    check(!manager.getStates()[0]?.active, 'Dash ends after its configured duration')
    const cooldownReject = manager.tryActivate(DASH_ID, { movementDirection: direction })
    check(!cooldownReject.activated && cooldownReject.reason === 'cooldown', 'Dash rejects during cooldown')
    close(player.stats.currentEnergy, 100 - DASH_ABILITY_CONFIG.energyCost, 'Cooldown rejection consumes no energy')
    close(player.speed, 5.5, 'Dash does not modify base movement speed')
    const normalStart = player.position.clone()
    player.update(new THREE.Vector3(0, 0, 1), 0.5, [])
    close(player.position.distanceTo(normalStart), 2.75, 'Normal movement continues at base speed after Dash')
    manager.update(DASH_ABILITY_CONFIG.cooldownSeconds)
    check(manager.getStates()[0]?.available, 'Dash becomes available after cooldown')
    check(manager.tryActivate(DASH_ID, { movementDirection: direction }).activated, 'Dash can reactivate after cooldown')
  } finally {
    player.dispose()
  }

  const insufficient = createPlayer()
  try {
    check(insufficient.stats.spendEnergy(101 - DASH_ABILITY_CONFIG.energyCost), 'Prepare insufficient-energy case')
    const result = insufficient.abilities.tryActivate(DASH_ID, { movementDirection: direction })
    check(!result.activated && result.reason === 'insufficient-energy', 'Insufficient energy rejects activation')
    close(insufficient.stats.currentEnergy, DASH_ABILITY_CONFIG.energyCost - 1, 'Rejected activation leaves energy untouched')
    close(insufficient.abilities.getStates()[0]?.cooldownRemaining ?? -1, 0, 'Rejected activation does not start cooldown')
  } finally {
    insufficient.dispose()
  }

  const smallSteps = createPlayer()
  const largeSteps = createPlayer()
  try {
    smallSteps.abilities.tryActivate(DASH_ID, { movementDirection: direction })
    largeSteps.abilities.tryActivate(DASH_ID, { movementDirection: direction })
    const smallStart = smallSteps.position.clone()
    const largeStart = largeSteps.position.clone()
    for (let elapsed = 0; elapsed < DASH_ABILITY_CONFIG.durationSeconds;) {
      const step = Math.min(0.01, DASH_ABILITY_CONFIG.durationSeconds - elapsed)
      smallSteps.update(new THREE.Vector3(), step, [])
      elapsed += step
    }
    for (let elapsed = 0; elapsed < DASH_ABILITY_CONFIG.durationSeconds;) {
      const step = Math.min(0.06, DASH_ABILITY_CONFIG.durationSeconds - elapsed)
      largeSteps.update(new THREE.Vector3(), step, [])
      elapsed += step
    }
    close(smallSteps.position.distanceTo(smallStart), DASH_DISTANCE, 'Dash with 0.01-second frames')
    close(largeSteps.position.distanceTo(largeStart), DASH_DISTANCE, 'Dash with 0.06-second frames')
    close(smallSteps.position.distanceTo(largeSteps.position), 0, 'Dash distance is frame-rate independent')
  } finally {
    smallSteps.dispose()
    largeSteps.dispose()
  }

  const blocked = createPlayer()
  try {
    const startX = blocked.position.x
    const wall = new THREE.Box2(new THREE.Vector2(2, 2.5), new THREE.Vector2(3, 3.5))
    blocked.abilities.tryActivate(DASH_ID, { movementDirection: direction })
    blocked.update(new THREE.Vector3(), DASH_ABILITY_CONFIG.durationSeconds, [wall])
    check(blocked.position.x - startX < DASH_DISTANCE, 'Dash respects existing obstacle collision checks')
    check(blocked.position.x + blocked.radius <= wall.min.x + 1e-8, 'Dash does not penetrate the obstacle')
  } finally {
    blocked.dispose()
  }

  const controlled = createPlayer()
  const keyboardTarget = new EventTarget()
  const input = new InputManager(keyboardTarget)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100)
  camera.position.set(26, 34, 32)
  camera.lookAt(0, 0, 0)
  const controller = new PlayerController(input, camera, controlled, canvas, [])
  const key = (type: string, code: string, repeat = false): void => {
    keyboardTarget.dispatchEvent(new KeyboardEvent(type, { code, repeat }))
  }
  const tick = (deltaTime: number): void => {
    controlled.abilities.update(deltaTime)
    controller.updateMovement(deltaTime)
  }
  try {
    const start = controlled.position.clone()
    key('keydown', 'ShiftLeft')
    key('keyup', 'ShiftLeft')
    tick(0.05)
    close(controlled.position.distanceTo(start), DASH_ABILITY_CONFIG.speed * 0.05, 'A quick ShiftLeft tap triggers Dash through PlayerController')
    close(controlled.stats.currentEnergy, 100 - DASH_ABILITY_CONFIG.energyCost, 'ShiftLeft spends energy once')
    key('keydown', 'ShiftLeft')
    tick(0.05)
    key('keydown', 'ShiftLeft', true)
    tick(0.05)
    close(controlled.stats.currentEnergy, 100 - DASH_ABILITY_CONFIG.energyCost, 'Holding Shift does not retrigger Dash')
    key('keyup', 'ShiftLeft')
    for (let frame = 0; frame < 3; frame++) tick(0.05)
    key('keydown', 'KeyW')
    const normalStart = controlled.position.clone()
    tick(0.05)
    key('keyup', 'KeyW')
    check(controlled.position.distanceTo(normalStart) > 0, 'WASD movement works after Dash through PlayerController')
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, clientY: 300 }))
    const orientation = controlled.orientation
    controller.updateAim()
    check(Number.isFinite(controlled.orientation) && controlled.orientation !== orientation, 'Mouse aim remains active after Dash')
  } finally {
    for (const code of ['ShiftLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) key('keyup', code)
    controller.dispose()
    input.dispose()
    controlled.dispose()
  }

  return `${checks} ability checks passed`
}