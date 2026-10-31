import * as THREE from 'three'
import { AttackController } from './AttackController'
import type { AttackDefinition, CombatSource, DamageContext } from './Combat.types'
import type { Damageable } from './Damageable'
import { CombatSystem } from './CombatSystem'
import { Player } from '../entities/Player'
import { InputManager } from '../core/InputManager'
import { PlayerController } from '../core/PlayerController'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'

const ATTACK: AttackDefinition = {
  id: 'check.revolver',
  name: 'Test Revolver',
  damage: 15,
  shotsPerSecond: 2,
  projectileSpeed: 25,
  maxRange: 20,
  projectileRadius: 0.1,
  damageType: 'physical',
}
const SOURCE: CombatSource = { id: 'player.check', faction: 'player' }

function createTarget(id: string, faction: string, x: number, z: number, radius = 0.4): Damageable & { health: number; hits: DamageContext[] } {
  const target = {
    combatId: id,
    faction,
    health: 100,
    hits: [] as DamageContext[],
    getCombatBounds: () => ({ x, z, radius }),
    applyDamage(context: DamageContext): void {
      this.health -= context.amount
      this.hits.push(context)
    },
  }
  return target
}

export function runCombatChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const close = (actual: number, expected: number, label: string, tolerance = 1e-8): void => {
    check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label)
  }
  const origin = new THREE.Vector3(0, 1.5, 0)
  const aimPoint = new THREE.Vector3(10, 0, 0)
  const player = new Player()
  const muzzle = player.getMuzzlePosition(new THREE.Vector3())
  check(muzzle.distanceTo(player.position) > 0.5 && muzzle.y > player.position.y, 'Projectile origin is positioned at the raised revolver muzzle')
  player.dispose()

  const attack = new AttackController(ATTACK, SOURCE)
  const firstFrame = attack.advance(0, true, origin, aimPoint)
  check(firstFrame.length === 1 && firstFrame[0].offsetSeconds === 0, 'First shot fires immediately')
  close(firstFrame[0].direction.x, 1, 'Attack direction follows aim point on X')
  close(firstFrame[0].direction.z, 0, 'Attack direction remains on XZ plane')
  check(attack.advance(0.49, true, origin, aimPoint).length === 0, 'Cadence blocks a shot before 0.5 seconds')
  check(attack.advance(0.02, true, origin, aimPoint).length === 1, 'Cadence permits next shot immediately after 0.5 seconds')
  check(attack.advance(1, true, origin, aimPoint).length === 2, 'Long frame preserves shot cadence without losing shots')
  const split = new AttackController(ATTACK, SOURCE)
  let splitShots = 0
  for (let frame = 0; frame < 4; frame++) splitShots += split.advance(0.25, true, origin, aimPoint).length
  check(splitShots === 3, 'Split frames preserve the same inclusive 1-second cadence')
  const idleAttack = new AttackController(ATTACK, SOURCE)
  idleAttack.advance(0, true, origin, aimPoint)
  idleAttack.advance(0.5, false, origin, aimPoint)
  check(idleAttack.advance(0, true, origin, aimPoint).length === 1, 'Released trigger is ready to fire immediately again')

  const scene = new THREE.Scene()
  const hitSystem = new CombatSystem(scene, [], ATTACK, SOURCE)
  const target = createTarget('target.near', 'enemy', 8, 0)
  const farther = createTarget('target.far', 'enemy', 12, 0)
  hitSystem.registerTarget(farther)
  hitSystem.registerTarget(target)
  hitSystem.update(0, true, origin, aimPoint)
  check(hitSystem.projectileCount === 1, 'Shot creates one visual projectile')
  hitSystem.update(0.5, false, origin, aimPoint)
  check(target.health === 85 && target.hits.length === 1, 'Swept projectile applies 15 damage despite a long frame')
  check(farther.health === 100, 'Only the nearest target receives the hit')
  check(target.hits[0].sourceId === SOURCE.id && target.hits[0].sourceFaction === SOURCE.faction, 'Damage context preserves projectile source')
  check(hitSystem.projectileCount === 0, 'Projectile is removed immediately after impact')
  hitSystem.dispose()
  hitSystem.dispose()
  check(scene.children.length === 0, 'Disposal removes projectile meshes from scene')

  const blockedScene = new THREE.Scene()
  const wall = new THREE.Box2(new THREE.Vector2(4, -1), new THREE.Vector2(5, 1))
  const blockedSystem = new CombatSystem(blockedScene, [wall], ATTACK, SOURCE)
  const behindWall = createTarget('target.behind-wall', 'enemy', 8, 0)
  blockedSystem.registerTarget(behindWall)
  blockedSystem.update(0, true, origin, aimPoint)
  blockedSystem.update(0.5, false, origin, aimPoint)
  check(behindWall.health === 100, 'Obstacle blocks projectiles before targets behind it')
  check(blockedSystem.projectileCount === 0, 'Projectile is removed on obstacle impact')
  blockedSystem.dispose()

  const rangeScene = new THREE.Scene()
  const rangeSystem = new CombatSystem(rangeScene, [], ATTACK, SOURCE)
  rangeSystem.update(0, true, origin, aimPoint)
  rangeSystem.update(1, false, origin, aimPoint)
  check(rangeSystem.projectileCount === 0, 'Projectile is removed after 20-unit maximum range')
  check(rangeScene.children.length === 0, 'Range expiration removes projectile mesh')
  rangeSystem.dispose()

  const factionScene = new THREE.Scene()
  const factionSystem = new CombatSystem(factionScene, [], ATTACK, SOURCE)
  const friendly = createTarget('friendly', 'player', 8, 0)
  factionSystem.registerTarget(friendly)
  factionSystem.update(0, true, origin, aimPoint)
  factionSystem.update(0.5, false, origin, aimPoint)
  check(friendly.health === 100, 'Projectile cannot damage its own faction')
  factionSystem.dispose()

  const duplicateSystem = new CombatSystem(new THREE.Scene(), [], ATTACK, SOURCE)
  duplicateSystem.registerTarget(createTarget('duplicate', 'enemy', 3, 0))
  let duplicateRejected = false
  try {
    duplicateSystem.registerTarget(createTarget('duplicate', 'enemy', 4, 0))
  } catch {
    duplicateRejected = true
  }
  check(duplicateRejected, 'Combat target IDs must be unique')
  check(duplicateSystem.unregisterTarget('duplicate'), 'Targets can be unregistered')
  check(!duplicateSystem.unregisterTarget('duplicate'), 'Unknown target removal is harmless')
  duplicateSystem.dispose()

  const inputPlayer = new Player()
  const input = new InputManager()
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  const camera = new THREE.OrthographicCamera(-17, 17, 12.75, -12.75, 0.1, 180)
  camera.position.copy(inputPlayer.position).add(new THREE.Vector3(26, 34, 32))
  camera.lookAt(inputPlayer.position)
  const controller = new PlayerController(input, camera, inputPlayer, canvas, [])
  const integratedScene = new THREE.Scene()
  integratedScene.add(inputPlayer.root)
  const integratedSystem = new CombatSystem(integratedScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  const energyBeforeShot = inputPlayer.stats.currentEnergy
  try {
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 620, clientY: 280 }))
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 7 }))
    controller.updateAim()
    check(controller.isFiring, 'Left pointer input reaches the firing controller')
    const muzzle = inputPlayer.getMuzzlePosition(new THREE.Vector3())
    const aim = controller.getAimPoint(new THREE.Vector3())
    integratedSystem.update(0.016, controller.isFiring, muzzle, aim)
    check(integratedSystem.shotsFired === 1 && integratedSystem.projectileCount === 1, 'Mouse input creates a combat projectile')
    const projectile = integratedScene.getObjectByName('Projectile:player.revolver') as THREE.Mesh | null
    if (!projectile) throw new Error('Mouse input did not create a scene projectile')
    check(projectile.parent === integratedScene && projectile.visible, 'Projectile mesh is visible and attached to the Three.js scene')
    check(projectile.geometry.getAttribute('position').count > 0 && (projectile.material as THREE.Material).visible, 'Projectile has visible geometry and material')
    close(projectile.scale.x, REVOLVER_ATTACK.projectileRadius, 'Projectile uses its configured visible radius')
    const spawnedPosition = projectile.position.clone()
    integratedSystem.update(0.016, controller.isFiring, inputPlayer.getMuzzlePosition(new THREE.Vector3()), controller.getAimPoint(new THREE.Vector3()))
    check(projectile.position.distanceTo(spawnedPosition) > 0, 'Projectile updates its scene position on the next combat tick')
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0, isPrimary: true, pointerId: 7 }))
    check(!controller.isFiring, 'Left pointer release clears firing state')
    close(inputPlayer.stats.currentEnergy, energyBeforeShot, 'Firing consumes no energy')
  } finally {
    integratedSystem.dispose()
    controller.dispose()
    input.dispose()
    inputPlayer.dispose()
  }

  return `${checks} combat checks passed`
}