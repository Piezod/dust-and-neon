import * as THREE from 'three'
import { Game } from '../core/Game'
import { GameEventBus } from '../events/GameEventBus'
import { DEFAULT_GAME_SETTINGS, type GraphicsQuality } from '../core/GameSettings.types'

let activeGame: Game | null = null
let activeHost: HTMLDivElement | null = null

export function runGameplayEffectsVisualCheck(container: HTMLElement, quality: GraphicsQuality = 'high'): string {
  disposeGameplayEffectsVisualCheck()
  const host = document.createElement('div')
  host.className = 'game-stage visual-check-stage'
  host.style.cssText = 'position:fixed;inset:0;z-index:20;overflow:hidden;pointer-events:none;background:#171a20'
  container.append(host)
  activeHost = host
  const events = new GameEventBus()
  const shots: number[] = []
  const movement: number[] = []
  const dashes: number[] = []
  events.subscribe((event) => {
    if (event.type === 'player-shot') shots.push(performance.now())
    else if (event.type === 'player-moved') movement.push(performance.now())
    else if (event.type === 'dash-activated') dashes.push(performance.now())
  })
  activeGame = new Game(host, { mode: 'infinite', events, settings: { ...DEFAULT_GAME_SETTINGS,
    masterVolume: 0,
    musicVolume: 0,
    effectsVolume: 0,
    musicEnabled: false,
    graphicsQuality: quality,
    aimSensitivity: 1,
    showTouchControls: false,
  } })
  const game = activeGame as unknown as {
    tick(time: number): void
    readonly camera: THREE.Camera
    readonly renderer: THREE.WebGLRenderer
    readonly waves: { readonly state: string }
    readonly visualEffects: { readonly activeParticleCount: number; readonly flash: { readonly visible: boolean; readonly scale: { readonly x: number }; readonly position: THREE.Vector3 } }
    readonly combat: { readonly shotsFired: number }
    readonly player: { readonly stats: { readonly isAlive: boolean }; readonly position: { readonly x: number; readonly z: number } }
  }
  let time = 0
  for (let frame = 0; frame < 42; frame++) {
    time += 50
    game.tick(time)
  }
  if (game.waves.state !== 'combat') throw new Error(`Visual check did not reach combat: ${game.waves.state}`)

  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true, cancelable: true }))
  for (let frame = 0; frame < 8; frame++) {
    time += 50
    game.tick(time)
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true, cancelable: true }))
  time += 50
  game.tick(time)
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }))
  const bounds = game.renderer.domElement.getBoundingClientRect()
  const pointerId = 99
  const pointerPosition = { clientX: bounds.left + bounds.width * 0.76, clientY: bounds.top + bounds.height * 0.46 }
  game.renderer.domElement.dispatchEvent(new PointerEvent('pointermove', { ...pointerPosition, pointerId, pointerType: 'mouse', isPrimary: true, bubbles: true }))
  game.renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', { ...pointerPosition, pointerId, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true }))
  for (let frame = 0; frame < 12; frame++) {
    time += 50
    game.tick(time)
  }
  window.dispatchEvent(new PointerEvent('pointerup', { ...pointerPosition, pointerId, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true }))

  const particleCount = game.visualEffects.activeParticleCount
  const flashVisible = game.visualEffects.flash.visible
  if (shots.length < 2) throw new Error(`Expected repeated shots, got ${shots.length}`)
  if (!flashVisible || game.visualEffects.flash.scale.x < 1.2) throw new Error('Muzzle flash was not visible at the expected scale')
  if (particleCount < 8 || movement.length === 0 || dashes.length === 0) {
    throw new Error(`Expected dust/movement/Dash effects, got ${particleCount}/${movement.length}/${dashes.length}`)
  }
  if (!game.player.stats.isAlive) throw new Error('Player died before the controlled visual capture')
  time += 16
  game.tick(time)
  const flashScreenPosition = game.visualEffects.flash.position.clone().project(game.camera)
  const flashScreenX = Math.round((flashScreenPosition.x + 1) * window.innerWidth / 2)
  const flashScreenY = Math.round((1 - flashScreenPosition.y) * window.innerHeight / 2)
  const gl = game.renderer.getContext()
  const canvas = game.renderer.domElement
  const ratio = game.renderer.getPixelRatio()
  const centerX = Math.round((flashScreenPosition.x + 1) * 0.5 * canvas.width)
  const centerY = Math.round((1 - flashScreenPosition.y) * 0.5 * canvas.height)
  const pixel = new Uint8Array(4)
  let brightestFlashPixel = 0
  for (let offsetY = -8; offsetY <= 8; offsetY += 4) {
    for (let offsetX = -8; offsetX <= 8; offsetX += 4) {
      const x = THREE.MathUtils.clamp(centerX + Math.round(offsetX * ratio), 0, canvas.width - 1)
      const y = THREE.MathUtils.clamp(canvas.height - 1 - centerY - Math.round(offsetY * ratio), 0, canvas.height - 1)
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      brightestFlashPixel = Math.max(brightestFlashPixel, pixel[0], pixel[1], pixel[2])
    }
  }
  if (brightestFlashPixel < 180) throw new Error(`Flash object rendered without bright framebuffer pixels (${brightestFlashPixel} at ${flashScreenX},${flashScreenY})`)
  return `Controlled frame: ${shots.length} shots, bright flash pixel ${brightestFlashPixel} at ${flashScreenX},${flashScreenY}, ${particleCount} particles, ${movement.length} movement puffs, ${dashes.length} Dash effects`
}

export function disposeGameplayEffectsVisualCheck(): void {
  activeGame?.dispose()
  activeGame = null
  activeHost?.remove()
  activeHost = null
}
