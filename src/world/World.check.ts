import * as THREE from 'three'
import { World } from './World'

export function runWorldVisualChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const low = new World('low')
  const medium = new World('medium')
  const high = new World('high')
  const canyon = new World('medium', 'crystal-canyon')
  const foundry = new World('medium', 'red-foundry')
  const swamp = new World('medium', 'spore-swamp')
  const observatory = new World('medium', 'storm-observatory')
  const eclipse = new World('medium', 'eclipse-core')
  try {
    const dustCount = (world: World): number => {
      let count = -1
      world.root.traverse((object) => {
        if (object.name === 'AmbientDust' && object instanceof THREE.Points) {
          count = object.geometry.drawRange.count
        }
      })
      return count
    }
    const pointLightsVisible = (world: World): boolean[] => {
      const visible: boolean[] = []
      world.root.traverse((object) => {
        if (object.type === 'PointLight') visible.push(object.visible)
      })
      return visible
    }
    const terrainColor = (world: World): string | null => {
      let hex: string | null = null
      world.root.traverse((object) => {
        if (hex !== null || !(object instanceof THREE.Mesh)) return
        const colors = object.geometry.getAttribute('color')
        if (colors) hex = `#${new THREE.Color().fromBufferAttribute(colors, 0).getHexString()}`
      })
      return hex
    }
    check(dustCount(low) === 20 && dustCount(medium) === 56 && dustCount(high) === 150, 'Dust draw count follows quality profiles without vanishing in low quality')
    check(low.obstacles.length === medium.obstacles.length && medium.obstacles.length === high.obstacles.length, 'Graphics quality does not alter collision obstacles')
    const rockColliders = high.obstacleDebugInfo.filter((record) => record.kind === 'rock')
    check(rockColliders.length > 0 && rockColliders.every((record) => record.collisionScale === 0.82), 'Large decorative rocks use tightened 82% collider bounds')
    check(pointLightsVisible(low).every((visible) => !visible), 'Low quality disables local neon and crystal lights')
    check(pointLightsVisible(medium).some(Boolean) && pointLightsVisible(high).some(Boolean), 'Medium/high profiles keep local atmosphere lighting')
    check(canyon.obstacleDebugInfo.some((record) => record.kind === 'mesa') && canyon.obstacleDebugInfo.some((record) => record.kind === 'crystal-base'), 'Crystal Canyon builds its own mesa and crystal collision layout')
    check(foundry.obstacleDebugInfo.some((record) => record.kind === 'machinery') && foundry.root.getObjectByName('FoundryTank:-14') !== undefined, 'Red Foundry contains industrial landmarks and colliders')
    check(swamp.root.getObjectByName('SporeCap:spore-canopy-north') !== undefined && swamp.root.getObjectByName('Walkway:raised-crossing-west') !== undefined,
      'Spore Swamp builds a distinct canopy and raised crossings')
    check(observatory.root.getObjectByName('StormAntenna:north-antenna') !== undefined && observatory.root.getObjectByName('StormGenerator:west-generator') !== undefined,
      'Storm Observatory builds antenna and generator landmarks')
    check(eclipse.root.getObjectByName('EclipsePylon:north-eclipse-pylon') !== undefined && eclipse.root.getObjectByName('EclipseEnergyRing:outer-energy-ring') !== undefined,
      'Eclipse Core builds its pylons and energy rings')
    check(new Set([terrainColor(swamp), terrainColor(observatory), terrainColor(eclipse)]).size === 3,
      'New campaign scenarios use distinct ground palettes')
    const sharedObstacles = canyon.obstacles
    canyon.rebuildScenario('red-foundry')
    check(canyon.obstacles === sharedObstacles && canyon.obstacleDebugInfo.some((record) => record.kind === 'machinery'), 'Scenario rebuild preserves obstacle-array identity while replacing colliders')
    canyon.rebuildScenario('ghost-town')
    check(canyon.root.getObjectByName('Building:LAST LIGHT') !== undefined, 'Scenario rebuild can restore the Ghost Town structures')
    medium.update(0.5, 1 / 30)
    high.update(0.5, 1 / 120)
    return `${checks} world visual checks passed`
  } finally {
    low.dispose()
    medium.dispose()
    high.dispose()
    canyon.dispose()
    foundry.dispose()
    swamp.dispose()
    observatory.dispose()
    eclipse.dispose()
  }
}
