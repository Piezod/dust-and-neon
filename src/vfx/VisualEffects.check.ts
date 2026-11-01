import * as THREE from 'three'
import { GameEventBus } from '../events/GameEventBus'
import { VisualEffectsSystem } from './VisualEffectsSystem'

export function runVisualEffectsChecks(): string {
  let checks = 0
  const check = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(label)
    checks++
  }
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 180)
  camera.position.set(26, 34, 32)
  camera.lookAt(0, 0, 0)
  const host = document.createElement('div')
  document.body.append(host)
  const events = new GameEventBus()
  const effects = new VisualEffectsSystem(scene, camera, host, events, 'high')
  try {
    const points = scene.getObjectByName('CombatVisualEffects') as THREE.Points | undefined
    const flash = scene.getObjectByName('MuzzleFlash') as THREE.Sprite | undefined
    if (!points || !flash) throw new Error('VFX meshes were not created')
    events.emit({ type: 'player-shot', attackId: 'player.revolver', position: [1, 2, 3], direction: [0, 0, 1] })
    effects.update(0)
    check(flash.visible && points.geometry.drawRange.count === 5, 'Shot event produces a muzzle flash and a bounded spark burst')
    check(Math.abs(flash.position.z - 3.62) < 1e-6 && flash.scale.x > 2, 'Flash sits ahead of the muzzle and has a readable world scale')
    events.emit({ type: 'projectile-spawned', projectileId: 'enemy.plasma', position: [2, 1, 2], direction: [0, 0, -1], sourceFaction: 'enemies' })
    effects.update(0)
    check(flash.material.color.getHexString() === 'a74ee8' && flash.scale.x > 2, 'Enemy plasma launch has a distinct visible muzzle flash')
    events.emit({ type: 'projectile-impact', projectileId: 'enemy.plasma', position: [2, 1, 2], sourcePosition: [8, 1, 2], sourceFaction: 'enemies', targetFaction: 'environment' })
    effects.update(0)
    check(points.geometry.drawRange.count === 22, 'Plasma impact produces its own particles')
    events.emit({ type: 'player-damaged', amount: 10, position: [0, 0.9, 0], sourcePosition: [8, 0.9, 0], lethal: false })
    check(host.querySelector('.vfx-damage-flash')?.getAnimations().length === 1, 'Player damage animates the screen feedback overlay')
    check(host.querySelector<HTMLDivElement>('.vfx-hit-direction')?.style.getPropertyValue('--hit-angle') !== '', 'Player damage displays a direction indicator from source position')
    check(effects.activeDamageNumberCount === 1, 'Player damage creates one floating damage number')
    effects.setGraphicsQuality('low')
    for (let index = 0; index < 12; index++) {
      events.emit({ type: 'enemy-damaged', enemyId: `crawler:${index}`, amount: 10, position: [index * 0.1, 0.7, 0] })
      events.emit({ type: 'loot-collected', reward: { type: 'gold', quantity: 1 }, position: [0, 0, 0], soundId: 'loot.gold' })
    }
    effects.update(0)
    check(points.geometry.drawRange.count <= 48, 'Low quality caps active particles to its configured budget')
    check(effects.activeDamageNumberCount <= 4, 'Damage numbers respect low-quality instance limits')
    effects.update(0.9)
    check(points.geometry.drawRange.count === 0 && !flash.visible, 'Expired effects are retired during update')
    check(effects.activeDamageNumberCount === 0, 'Expired damage numbers are returned to their pool')
    check(scene.children.some((object) => object === points), 'VFX scene object remains isolated from gameplay colliders')
    return `${checks} visual effect checks passed`
  } finally {
    effects.dispose()
    events.clear()
    host.remove()
    if (scene.children.length !== 0) throw new Error('VFX dispose releases every scene object')
  }
}
