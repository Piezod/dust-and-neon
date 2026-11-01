import * as THREE from 'three'
import { CombatSystem } from '../combat/CombatSystem'
import { REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE } from '../config/combat.config'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { GameEventBus } from '../events/GameEventBus'
import { Player } from '../entities/Player'
import { EnemyManager } from '../enemies/EnemyManager'
import { GameDebugVisualization } from './GameDebugVisualization'
import { World } from '../world/World'

export function runGameDebugVisualizationChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const scene = new THREE.Scene()
  const world = new World('low')
  scene.add(world.root)
  const player = new Player()
  scene.add(player.root)
  const events = new GameEventBus()
  const combat = new CombatSystem(scene, world.obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE)
  combat.registerTarget(player)
  const enemies = new EnemyManager(scene, world.obstacles, combat, player, ENEMY_DEFINITIONS, events)
  enemies.spawn('alien-crawler', new THREE.Vector3(7, 0, 3), 0)
  const visualization = new GameDebugVisualization(scene, world, enemies, player, combat, events)
  try {
    visualization.setLayer('world-colliders', true)
    visualization.setLayer('enemy-colliders', true)
    visualization.setLayer('line-of-sight', true)
    visualization.setLayer('routes', true)
    visualization.update()
    check(scene.getObjectByName('DebugWorldColliders')?.visible === true, 'World collider overlay can be toggled')
    const enemyBounds = scene.getObjectByName('DebugEnemyColliders') as THREE.LineSegments | null
    check((enemyBounds?.geometry.drawRange.count ?? 0) > 0, 'Enemy collider overlay contains live bounds')
    const sightLines = scene.getObjectByName('DebugEnemyLineOfSight') as THREE.LineSegments | null
    check((sightLines?.geometry.drawRange.count ?? 0) === 2, 'Line-of-sight overlay renders one segment per enemy')

    visualization.setLayer('effect-origins', true)
    events.emit({ type: 'debug-effect-requested', position: [1, 1, 2] })
    visualization.update()
    const origins = scene.getObjectByName('DebugEffectOrigins') as THREE.Points | null
    check((origins?.geometry.drawRange.count ?? 0) === 1, 'Effect origin marker receives an event position')

    combat.spawnProjectile(REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, player.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(1, 0, 0))
    visualization.setLayer('projectile-trajectories', true)
    visualization.update()
    const paths = scene.getObjectByName('DebugProjectilePaths') as THREE.LineSegments | null
    check((paths?.geometry.drawRange.count ?? 0) === 2, 'Projectile overlay shows active trajectory segments')
    return `${checks} debug visualization checks passed`
  } finally {
    visualization.dispose()
    enemies.dispose()
    combat.dispose()
    player.dispose()
    world.dispose()
    events.clear()
    scene.clear()
  }
}
