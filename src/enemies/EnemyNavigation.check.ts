import * as THREE from 'three'
import { CombatSystem } from '../combat/CombatSystem'
import { ENEMY_DEFINITIONS } from '../config/enemies.config'
import { PLAYER_COMBAT_SOURCE, REVOLVER_ATTACK } from '../config/combat.config'
import { Player } from '../entities/Player'
import { EnemyManager } from './EnemyManager'
import { findGridPath, hasClearMovementSegment, hasLineOfSight, isNavigationPointClear } from './EnemyNavigation'
import { World } from '../world/World'
import { GameEventBus } from '../events/GameEventBus'

export function runEnemyNavigationChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const wall = new THREE.Box2(new THREE.Vector2(3, -1), new THREE.Vector2(5, 1))
  const obstacles = [wall]
  const start = new THREE.Vector3(0, 0, 0)
  const goal = new THREE.Vector3(8, 0, 0)
  const radius = 0.55
  check(!hasLineOfSight(start, goal, obstacles), 'Wall blocks enemy line of sight')
  const path = findGridPath(start, goal, obstacles, radius)
  check(path !== null && path.length > 0, 'A* finds a route around an obstacle')
  const points = [start, ...path!]
  check(points.some((point) => Math.abs(point.z) > 1.55), 'Route detours beyond the inflated wall boundary')
  for (const point of path!) check(isNavigationPointClear(point, obstacles, radius), 'Every waypoint respects the enemy collision radius')
  for (let index = 1; index < points.length; index++) {
    check(hasClearMovementSegment(points[index - 1], points[index], obstacles, radius), 'Smoothed route segments remain collision-free')
  }
  const enclosed = [new THREE.Box2(new THREE.Vector2(2, -100), new THREE.Vector2(6, 100))]
  check(findGridPath(start, goal, enclosed, radius) === null, 'A* reports a fully blocked corridor instead of crossing it')

  const world = new World('low')
  check(world.root.getObjectByName('Rock:90') !== undefined && !world.obstacleDebugInfo.some((record) => record.id === 'Rock:90'), 'Central spawn-lane rock remains visual but is absent from navigation obstacles')
  world.dispose()

  const scene = new THREE.Scene()
  const player = new Player()
  player.root.position.set(8, 0, 0)
  scene.add(player.root)
  const combat = new CombatSystem(scene, obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => player.stats.isAlive)
  combat.registerTarget(player)
  const crawler = ENEMY_DEFINITIONS.find((definition) => definition.id === 'alien-crawler')!
  const enemies = new EnemyManager(scene, obstacles, combat, player, [crawler])
  const enemy = enemies.spawn(crawler.id, start, 0)
  const initialHealth = player.stats.currentHealth
  let maximumDetour = 0
  try {
    for (let frame = 0; frame < 600 && player.stats.currentHealth === initialHealth; frame++) {
      enemies.update(0.05)
      maximumDetour = Math.max(maximumDetour, Math.abs(enemy.root.position.z))
      const bounds = enemy.getCombatBounds()
      const closestX = THREE.MathUtils.clamp(bounds.x, wall.min.x, wall.max.x)
      const closestZ = THREE.MathUtils.clamp(bounds.z, wall.min.y, wall.max.y)
      check((bounds.x - closestX) ** 2 + (bounds.z - closestZ) ** 2 >= radius ** 2 - 1e-8, 'Enemy never enters the wall collider')
    }
    const finalDistance = Math.hypot(enemy.root.position.x - player.position.x, enemy.root.position.z - player.position.z)
    check(maximumDetour > 1.55, 'Enemy routes around the blocking wall rather than pushing through it')
    check(finalDistance <= 1.55, 'Melee enemy reaches an accessible attack position')
    check(player.stats.currentHealth < initialHealth && enemy.hasLineOfSightToTarget, 'Enemy attacks after reaching a clear line of sight')
    const requestedInsideWall = enemies.trySpawn(crawler.id, new THREE.Vector3(4, 0, 0), 0)
    check(requestedInsideWall !== null && isNavigationPointClear(requestedInsideWall.root.position, obstacles, crawler.collisionRadius), 'Spawn request inside a wall resolves to a clear position')
  } finally {
    enemies.dispose()
    combat.dispose()
    player.dispose()
  }

  const rangedScene = new THREE.Scene()
  const rangedPlayer = new Player()
  rangedPlayer.root.position.set(0, 0, 0)
  rangedScene.add(rangedPlayer.root)
  const rangedCombat = new CombatSystem(rangedScene, obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => rangedPlayer.stats.isAlive)
  rangedCombat.registerTarget(rangedPlayer)
  const outlaw = ENEMY_DEFINITIONS.find((definition) => definition.id === 'mechanical-outlaw')!
  const rangedEvents = new GameEventBus()
  const rangedPhases: string[] = []
  rangedEvents.subscribe((event) => {
    if (event.type === 'enemy-attack-phase') rangedPhases.push(`${event.phase ?? 'idle'}@${event.position[0].toFixed(1)},${event.position[2].toFixed(1)}`)
  })
  const rangedEnemies = new EnemyManager(rangedScene, obstacles, rangedCombat, rangedPlayer, [outlaw], rangedEvents)
  const shooter = rangedEnemies.spawn(outlaw.id, goal, 0)
  try {
    rangedEnemies.update(0)
    check(!shooter.hasLineOfSightToTarget && rangedCombat.projectileCount === 0, 'Ranged enemy holds fire through a blocking wall')
    for (let frame = 0; frame < 600 && rangedCombat.projectileCount === 0; frame++) rangedEnemies.update(0.05)
    check(shooter.hasLineOfSightToTarget, 'Ranged enemy repositions to a visible firing lane')
    check(
      rangedCombat.projectileCount > 0,
      `Ranged enemy fires after LoS becomes clear (los=${shooter.hasLineOfSightToTarget}, distance=${shooter.root.position.distanceTo(rangedPlayer.position).toFixed(2)}, phase=${shooter.attackController.getPhaseState()?.phase ?? 'none'}, position=${shooter.root.position.x.toFixed(2)},${shooter.root.position.z.toFixed(2)}, projectiles=${rangedCombat.projectileCount}, transitions=${rangedPhases.slice(-8).join('|')})`,
    )
  } finally {
    rangedEnemies.dispose()
    rangedCombat.dispose()
    rangedPlayer.dispose()
    rangedEvents.clear()
  }

  const actualWorld = new World('low')
  const actualRock = actualWorld.root.getObjectByName('Rock:90')
  if (!actualRock) throw new Error('Expected the deterministic central rock Rock:90')
  const rockCenterX = actualRock.position.x
  const rockCenterZ = actualRock.position.z
  const sceneRock = new THREE.Scene()
  const scenePlayer = new Player()
  scenePlayer.root.position.set(rockCenterX + 5, 0, rockCenterZ)
  sceneRock.add(scenePlayer.root)
  const sceneCombat = new CombatSystem(sceneRock, actualWorld.obstacles, REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => scenePlayer.stats.isAlive)
  sceneCombat.registerTarget(scenePlayer)
  const sceneEnemies = new EnemyManager(sceneRock, actualWorld.obstacles, sceneCombat, scenePlayer, [crawler])
  const sceneEnemy = sceneEnemies.spawn(crawler.id, new THREE.Vector3(rockCenterX - 5, 0, rockCenterZ), 0)
  const sceneInitialHealth = scenePlayer.stats.currentHealth
  let maximumRockDetour = 0
  try {
    const rockStart = new THREE.Vector3(rockCenterX - 5, 0, rockCenterZ)
    const rockEnd = new THREE.Vector3(rockCenterX + 5, 0, rockCenterZ)
    check(hasLineOfSight(rockStart, rockEnd, actualWorld.obstacles), 'Decorative rock does not block line of sight')
    check(hasClearMovementSegment(rockStart, rockEnd, actualWorld.obstacles, crawler.collisionRadius), 'Decorative rock does not block movement segments')
    const directRoute = findGridPath(rockStart, rockEnd, actualWorld.obstacles, crawler.collisionRadius)
    check(directRoute !== null && directRoute.length <= 2 && directRoute.every((point) => Math.abs(point.z - rockCenterZ) <= 0.51), 'A* crosses decoration with only normal grid rounding and no obstacle detour')
    sceneCombat.spawnProjectile(REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, new THREE.Vector3(rockCenterX - 2, 1, rockCenterZ), new THREE.Vector3(1, 0, 0))
    sceneCombat.update(4 / REVOLVER_ATTACK.projectileSpeed, false, rockStart, rockEnd)
    check(sceneCombat.projectileCount === 1, 'Projectile crosses the decorative rock without disappearing')
    scenePlayer.position.copy(rockStart)
    scenePlayer.update(new THREE.Vector3(1, 0, 0), 10 / scenePlayer.speed, actualWorld.obstacles)
    check(scenePlayer.position.distanceTo(rockEnd) < 0.01, 'Player crosses the actual rock with normal movement')
    let routeFrames = 0
    for (let frame = 0; frame < 600 && scenePlayer.stats.currentHealth === sceneInitialHealth; frame++) {
      sceneEnemies.update(0.05)
      if (sceneEnemy.navigationWaypoints.length > 0) routeFrames++
      maximumRockDetour = Math.max(maximumRockDetour, Math.abs(sceneEnemy.root.position.z - rockCenterZ))
      const bounds = sceneEnemy.getCombatBounds()
      for (const obstacle of actualWorld.obstacles) {
        const closestX = THREE.MathUtils.clamp(bounds.x, obstacle.min.x, obstacle.max.x)
        const closestZ = THREE.MathUtils.clamp(bounds.z, obstacle.min.y, obstacle.max.y)
        check((bounds.x - closestX) ** 2 + (bounds.z - closestZ) ** 2 >= crawler.collisionRadius ** 2 - 1e-8, 'Enemy remains outside every real World collider')
      }
    }
    check(
      maximumRockDetour < 0.01 && routeFrames === 0 && sceneEnemy.root.position.x > rockCenterX,
      'Enemy crosses Rock:90 directly without detour, jitter or unnecessary A* routes',
    )
    check(scenePlayer.stats.currentHealth < sceneInitialHealth && sceneEnemy.hasLineOfSightToTarget, 'Enemy attacks only after navigating to a clear lane in World')
  } finally {
    sceneEnemies.dispose()
    sceneCombat.dispose()
    scenePlayer.dispose()
    actualWorld.dispose()
  }

  const crowdScene = new THREE.Scene()
  const crowdPlayer = new Player()
  crowdPlayer.root.position.set(0, 0, 0)
  crowdScene.add(crowdPlayer.root)
  const crowdCombat = new CombatSystem(crowdScene, [], REVOLVER_ATTACK, PLAYER_COMBAT_SOURCE, () => crowdPlayer.stats.isAlive)
  crowdCombat.registerTarget(crowdPlayer)
  const outlawDefinition = ENEMY_DEFINITIONS.find((definition) => definition.id === 'mechanical-outlaw')!
  const crowd = new EnemyManager(crowdScene, [], crowdCombat, crowdPlayer, [outlawDefinition])
  const outlaws = [
    crowd.spawn(outlawDefinition.id, new THREE.Vector3(7, 0, 0), 0),
    crowd.spawn(outlawDefinition.id, new THREE.Vector3(7, 0, 0), 0),
    crowd.spawn(outlawDefinition.id, new THREE.Vector3(7, 0, 0), 0),
  ]
  const starts = outlaws.map((enemy) => enemy.root.position.clone())
  try {
    for (let frame = 0; frame < 160; frame++) crowd.update(0.05)
    let minimumGap = Infinity
    for (let first = 0; first < outlaws.length; first++) {
      for (let second = first + 1; second < outlaws.length; second++) {
        const distance = outlaws[first].root.position.distanceTo(outlaws[second].root.position)
        minimumGap = Math.min(minimumGap, distance)
        check(distance >= outlawDefinition.collisionRadius * 2 - 1e-6, 'Ranged enemies do not overlap during sustained orbiting')
      }
    }
    check(outlaws.some((enemy, index) => enemy.root.position.distanceTo(starts[index]) > 1), 'Ranged enemies make small lateral movements at preferred range')
    check(minimumGap >= outlawDefinition.collisionRadius * 2, 'Local separation maintains the hard collider gap')
  } finally {
    crowd.dispose()
    crowdCombat.dispose()
    crowdPlayer.dispose()
  }
  return `${checks} enemy navigation checks passed`
}
