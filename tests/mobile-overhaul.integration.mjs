import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, join, resolve } from 'node:path'

const binaryDirectory = process.env.PATH.split(delimiter).find((directory) => existsSync(join(directory, 'playwright.cmd')) || existsSync(join(directory, 'playwright')))
if (!binaryDirectory) throw new Error('Run with: npx --yes --package playwright -c "node tests/mobile-overhaul.integration.mjs"')
const { chromium } = createRequire(join(binaryDirectory, 'runner.cjs'))('playwright')
const output = resolve(process.argv[2] ?? 'docs/mobile-m1')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.M1_BROWSER_CHANNEL ?? 'msedge', headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] })
const results = { viewports: [], checks: [], interactions: [], errors: [] }
const baseURL = process.env.M1_URL ?? 'http://localhost:5174/'

async function prepareCombat(page) {
  return page.evaluate(async () => {
    window.__m1?.dispose()
    document.querySelector('#m1-harness')?.remove()
    const { Game } = await import('/src/core/Game.ts')
    const { DEFAULT_GAME_SETTINGS } = await import('/src/core/GameSettings.types.ts')
    const { BOSS_DEFINITIONS } = await import('/src/config/bosses.config.ts')
    const { ENEMY_DEFINITIONS } = await import('/src/config/enemies.config.ts')
    document.querySelector('.main-menu').hidden = true
    const host = document.createElement('div')
    host.className = 'game-stage'
    host.id = 'm1-harness'
    document.querySelector('#app').append(host)
    const game = new Game(host, { mode: 'campaign', settings: { ...DEFAULT_GAME_SETTINGS, graphicsQuality: 'low' } })
    window.__m1 = game
    window.__m1time = performance.now()
    game.previousTime = window.__m1time
    window.__m1tick = (count = 1) => {
      for (let index = 0; index < count; index++) {
        window.__m1time += 50
        game.tick(window.__m1time)
      }
    }
    game.player.position.set(3, -0.03, 7)
    game.target.copy(game.player.position)
    game.bossManager.start(BOSS_DEFINITIONS[0], game.player.position.clone().set(-3, 0, 1))
    game.campaign.stateValue = 'boss-intro'
    window.__m1tick(50)
    game.enemies.trySpawn(ENEMY_DEFINITIONS[0].id, game.player.position.clone().set(6, 0, 4), 2)
    window.__m1tick()
  })
}

try {
  for (const [width, height] of [[667, 375], [844, 390], [932, 430], [915, 412], [1280, 720]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    page.on('pageerror', (error) => results.errors.push(error.message))
    await page.goto(baseURL)
    await page.screenshot({ path: join(output, `menu-${width}x${height}.png`), animations: 'disabled' })
    if (width === 667) {
      await page.locator('[data-action="campaign"]').tap()
      assert.equal(await page.locator('.mission-row:not(:disabled)').count(), 1)
      await page.screenshot({ path: join(output, 'campaign-667x375.png'), animations: 'disabled' })
      await page.locator('[data-action="back"]').tap()
      await page.locator('[data-action="settings"]').tap()
      await page.locator('[data-setting="mobileZoom"]').evaluate((input) => { input.value = '1.1'; input.dispatchEvent(new Event('input', { bubbles: true })) })
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dust-and-neon.settings.v1')).mobileZoom), 1.1)
      await page.locator('[data-setting="mobileZoom"]').evaluate((input) => { input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })) })
      await page.screenshot({ path: join(output, 'settings-667x375.png'), animations: 'disabled' })
      await page.locator('[data-action="back"]').tap()
      await page.locator('[data-action="infinite"]').tap()
      await page.locator('.touch-pause').waitFor()
      await page.locator('.touch-pause').tap()
      await page.locator('.pause-overlay:not([hidden])').waitFor()
      await page.locator('[data-action="resume"]').tap()
      await page.locator('.touch-pause').tap()
      await page.locator('[data-action="exit"]').tap()
      await page.locator('[data-action="infinite"]').tap()
      await page.locator('.touch-pause').waitFor()
      assert.equal(await page.locator('.game-stage canvas').count(), 1)
      await page.locator('.touch-pause').tap()
      await page.locator('[data-action="exit"]').tap()
      results.interactions.push('Touch menus: campaign, settings, persisted zoom, infinite start, pause/resume, exit, fresh run')
    }
    await prepareCombat(page)
    const metrics = await page.evaluate(() => {
      const game = window.__m1
      game.renderer.render(game.scene, game.camera)
      const context = game.renderer.getContext()
      const colors = new Set()
      for (const horizontal of [0.2, 0.4, 0.6, 0.8]) for (const vertical of [0.2, 0.4, 0.6, 0.8]) {
        const pixel = new Uint8Array(4)
        context.readPixels(Math.floor(context.drawingBufferWidth * horizontal), Math.floor(context.drawingBufferHeight * vertical), 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel)
        colors.add(Array.from(pixel).join(','))
      }
      const rect = (selector) => {
        const bounds = document.querySelector(selector).getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      }
      return { viewport: [innerWidth, innerHeight], canvas: [game.renderer.domElement.width, game.renderer.domElement.height], dpr: game.renderer.getPixelRatio(), colors: colors.size, calls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles, move: rect('.touch-stick--move'), aim: rect('.touch-stick--aim'), dash: rect('.touch-ability'), hud: rect('.player-hud'), boss: rect('.campaign-hud__boss') }
    })
    assert.deepEqual(metrics.viewport, [width, height])
    assert.ok(metrics.colors > 4, 'WebGL is not blank')
    for (const region of [metrics.move, metrics.aim, metrics.dash, metrics.hud, metrics.boss]) {
      assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.width <= width + 1 && region.y + region.height <= height + 1, 'UI stays inside viewport')
    }
    assert.ok(metrics.dash.y + metrics.dash.height < metrics.aim.y, 'Dash does not overlap aim')
    assert.ok(metrics.hud.y + metrics.hud.height < metrics.move.y, 'HUD does not overlap movement')
    await page.screenshot({ path: join(output, `combat-${width}x${height}.png`), animations: 'disabled' })
    results.viewports.push(metrics)
    if (width === 667) {
      const session = await context.newCDPSession(page)
      const left = { id: 1, x: metrics.move.x + metrics.move.width / 2 + 25, y: metrics.move.y + metrics.move.height / 2 }
      const right = { id: 2, x: metrics.aim.x + metrics.aim.width / 2, y: metrics.aim.y + metrics.aim.height / 2 - 38 }
      const dash = { id: 3, x: metrics.dash.x + metrics.dash.width / 2, y: metrics.dash.y + metrics.dash.height / 2 }
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right, dash] })
      const triple = await page.evaluate(() => { window.__m1tick(); const game = window.__m1; return { move: game.input.movementHorizontal, fire: game.controller.isFiring, energy: game.player.stats.currentEnergy } })
      assert.ok(triple.move > 0 && triple.move < 1 && triple.fire && triple.energy === 80)
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [dash] })
      assert.ok(await page.evaluate(() => window.__m1.controller.isFiring && window.__m1.input.movementHorizontal > 0))
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      assert.ok(await page.evaluate(() => !window.__m1.controller.isFiring && window.__m1.input.movementHorizontal === 0))
      results.interactions.push('Native CDP contacts: analog move + fire + Dash; release only Dash; cancel all')
      await page.setViewportSize({ width: 375, height: 667 })
      await page.evaluate(() => window.__m1.resize())
      assert.equal(await page.evaluate(() => window.__m1.pauseReason), 'orientation')
      await page.screenshot({ path: join(output, 'portrait-375x667.png'), animations: 'disabled' })
      await page.setViewportSize({ width, height })
      await page.evaluate(() => window.__m1.resize())
      assert.equal(await page.evaluate(() => window.__m1.paused), false)
      await page.evaluate(() => window.__m1.pause('user'))
      await page.setViewportSize({ width: 375, height: 667 })
      await page.evaluate(() => window.__m1.resize())
      await page.setViewportSize({ width, height })
      await page.evaluate(() => window.__m1.resize())
      assert.equal(await page.evaluate(() => window.__m1.pauseReason), 'user')
      await page.screenshot({ path: join(output, 'pause-667x375.png'), animations: 'disabled' })
      await page.evaluate(() => { window.__m1.resume(); window.dispatchEvent(new Event('blur')) })
      assert.equal(await page.evaluate(() => window.__m1.pauseReason), 'hidden')
      results.interactions.push('Portrait pause, landscape resume, manual pause survives rotation, blur pauses')
      await page.evaluate(() => { window.__m1.dispose(); document.querySelector('#m1-harness').remove() })
      results.checks = await page.evaluate(async () => {
        const checks = []
        for (const [file, names] of [
          ['/src/ui/TouchControls.check.ts', ['runTouchControlsChecks']],
          ['/src/abilities/Ability.check.ts', ['runAbilityChecks']],
          ['/src/combat/Combat.check.ts', ['runCombatChecks']],
          ['/src/enemies/Enemy.check.ts', ['runEnemyChecks']],
          ['/src/enemies/EnemyNavigation.check.ts', ['runEnemyNavigationChecks']],
          ['/src/world/World.check.ts', ['runWorldVisualChecks']],
          ['/src/core/GameDebugVisualization.check.ts', ['runGameDebugVisualizationChecks']],
          ['/src/bosses/Boss.check.ts', ['runBossChecks']],
          ['/src/app/AppFeatures.check.ts', ['runAppFeatureChecks']],
          ['/src/game-modes/Campaign.check.ts', ['runCampaignChecks', 'runCampaignGameChecks']],
          ['/src/progression/progression.check.ts', ['runGameLifecycleChecks', 'runProgressionChecks', 'runGameProgressionChecks']],
          ['/src/core/PlayerDeath.check.ts', ['runPlayerDeathChecks']],
        ]) {
          const module = await import(file)
          for (const name of names) checks.push(module[name]())
        }
        return checks
      })
      await page.evaluate(async () => {
        const { ApplicationController } = await import('/src/app/ApplicationController.ts')
        const host = document.createElement('div')
        host.id = 'm1-flow'
        host.style.cssText = 'position:absolute;inset:0'
        document.querySelector('#app').append(host)
        const application = new ApplicationController(host)
        window.__m1app = application
        await application.startRun({ mode: 'infinite' })
        const game = application.game
        game.renderer.setAnimationLoop(null)
        game.waves.stateValue = 'upgrades'
        game.runState.wallet.add(1000)
        game.runState.beginIntermission(1)
        game.intermission.update()
      })
      await page.screenshot({ path: join(output, 'shop-667x375.png'), animations: 'disabled' })
      await page.locator('#m1-flow [data-action="upgrade"]:not(:disabled)').first().tap()
      assert.equal(await page.locator('#m1-flow [data-notice]').textContent(), 'MEJORA APLICADA')
      await page.locator('#m1-flow [data-action="perk"]:not(:disabled)').first().tap()
      assert.equal(await page.locator('#m1-flow [data-notice]').textContent(), 'PERK APLICADO')
      await page.locator('#m1-flow [data-action="continue"]').tap()
      await page.evaluate(() => {
        const game = window.__m1app.game
        game.player.stats.takeDamage(100000)
        game.tick(performance.now() + 50)
      })
      await page.screenshot({ path: join(output, 'game-over-667x375.png'), animations: 'disabled' })
      await page.locator('#m1-flow [data-action="retry"]').tap()
      await page.locator('#m1-flow .touch-pause').waitFor()
      assert.equal(await page.locator('#m1-flow .game-stage canvas').count(), 1)
      await page.evaluate(() => { window.__m1app.destroy(); document.querySelector('#m1-flow').remove() })
      results.interactions.push('Touch shop: purchase, perk, continue; actual Game Over, touch retry, one fresh game canvas')
    }
    if (width === 844) {
      results.bossCombat = await page.evaluate(() => {
        const game = window.__m1
        game.enemies.clear()
        const render = game.renderer.render.bind(game.renderer)
        game.renderer.render = () => undefined
        const movementPad = document.querySelector('.touch-stick--move')
        const aimPad = document.querySelector('.touch-stick--aim')
        const dashButton = document.querySelector('.touch-ability[data-ability-id="dash"]')
        const movementBounds = movementPad.getBoundingClientRect()
        const aimBounds = aimPad.getBoundingClientRect()
        const emit = (element, type, pointerId, horizontal = 0, vertical = 0, bounds = movementBounds) => element.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerType: 'touch', pointerId, button: 0,
          clientX: bounds.x + bounds.width / 2 + horizontal * bounds.width * 0.34,
          clientY: bounds.y + bounds.height / 2 - vertical * bounds.height * 0.34,
        }))
        emit(movementPad, 'pointerdown', 501)
        emit(aimPad, 'pointerdown', 502, 0, 0, aimBounds)
        let frames = 0
        let orbit = 1
        let dashCount = 0
        const initialHealth = game.bossManager.currentBoss.getSnapshot().currentHealth
        try {
          while (frames++ < 5000 && game.player.isAlive && !game.bossManager.isDefeated) {
            const boss = game.bossManager.currentBoss
            const offset = boss.root.position.clone().sub(game.player.position).setY(0)
            const distance = offset.length()
            offset.normalize()
            const movement = offset.clone().set(-offset.z * orbit, 0, offset.x * orbit)
            movement.addScaledVector(offset, Math.max(-1, Math.min(1, (distance - 8) * 0.5))).normalize()
            const next = game.player.position.clone().addScaledVector(movement, 0.8)
            const blocked = game.world.obstacles.some((wall) => {
              const horizontal = Math.max(wall.min.x, Math.min(wall.max.x, next.x))
              const vertical = Math.max(wall.min.y, Math.min(wall.max.y, next.z))
              return Math.hypot(next.x - horizontal, next.z - vertical) < game.player.radius + 0.2
            })
            if (blocked && frames % 12 === 0) orbit *= -1
            const forward = game.player.position.clone()
            game.camera.getWorldDirection(forward)
            forward.setY(0).normalize()
            const right = forward.clone().cross(game.camera.up).normalize()
            emit(movementPad, 'pointermove', 501, movement.dot(right), movement.dot(forward))
            const playerScreen = game.player.position.clone().project(game.camera)
            const bossScreen = boss.root.position.clone().project(game.camera).sub(playerScreen)
            const screenDistance = Math.hypot(bossScreen.x * innerWidth, bossScreen.y * innerHeight)
            emit(aimPad, 'pointermove', 502, bossScreen.x * innerWidth / screenDistance, bossScreen.y * innerHeight / screenDistance, aimBounds)
            if (frames % 65 === 0 && !dashButton.disabled) {
              emit(dashButton, 'pointerdown', 503)
              emit(dashButton, 'pointerup', 503)
              dashCount++
            }
            window.__m1tick()
          }
          return { defeated: game.bossManager.isDefeated, playerHealth: game.player.stats.currentHealth, initialBossHealth: initialHealth, remainingBossHealth: game.bossManager.getSnapshot()?.currentHealth ?? 0, shots: game.combat.shotsFired, simulatedSeconds: frames * 0.05, dashCount, assisted: false, note: 'Bot touch PointerEvents; normal player/weapon/boss stats; no direct damage or healing. Rendering skipped between deterministic simulation steps, not an FPS benchmark.' }
        } finally {
          emit(movementPad, 'pointerup', 501)
          emit(aimPad, 'pointerup', 502, 0, 0, aimBounds)
          game.renderer.render = render
          render(game.scene, game.camera)
        }
      })
      console.log('Touch boss combat:', results.bossCombat)
      assert.ok(results.bossCombat.defeated && results.bossCombat.playerHealth > 0 && results.bossCombat.shots > 0, 'Unmodified boss can be defeated through touch actions')
      await page.screenshot({ path: join(output, 'boss-combat-result-844x390.png'), animations: 'disabled' })
    }
    await context.close()
  }
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: false })
  const desktopPage = await desktopContext.newPage()
  desktopPage.on('pageerror', (error) => results.errors.push(error.message))
  await desktopPage.goto(baseURL)
  await prepareCombat(desktopPage)
  const start = await desktopPage.evaluate(() => window.__m1.player.position.toArray())
  await desktopPage.keyboard.down('w')
  await desktopPage.evaluate(() => window.__m1tick(10))
  await desktopPage.keyboard.up('w')
  await desktopPage.mouse.move(900, 400)
  await desktopPage.mouse.down()
  const desktop = await desktopPage.evaluate(() => {
    window.__m1tick(10)
    const game = window.__m1
    return { position: game.player.position.toArray(), firing: game.controller.isFiring, shots: game.combat.shotsFired, height: game.camera.top - game.camera.bottom, zoom: game.camera.zoom, controls: getComputedStyle(document.querySelector('.touch-controls')).display }
  })
  await desktopPage.mouse.up()
  assert.notDeepEqual(desktop.position, start)
  assert.ok(desktop.firing && desktop.shots > 0 && desktop.height === 34 && desktop.zoom === 1 && desktop.controls === 'none')
  assert.equal(await desktopPage.evaluate(() => window.__m1.controller.isFiring), false)
  await desktopPage.screenshot({ path: join(output, 'desktop-1280x720.png'), animations: 'disabled' })
  results.desktop = desktop
  await desktopContext.close()
  assert.deepEqual(results.errors, [])
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}