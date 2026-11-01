import * as THREE from 'three'
import type { GraphicsQuality } from '../core/GameSettings.types'
import { getGraphicsProfile, VISUAL_THEME } from '../config/visualTheme'

export function setupLighting(scene: THREE.Scene, quality: GraphicsQuality = 'high'): void {
  const { lighting } = VISUAL_THEME
  const profile = getGraphicsProfile(quality)
  scene.background = new THREE.Color(lighting.sky)
  scene.fog = new THREE.Fog(lighting.fog, lighting.fogNear, lighting.fogFar)
  scene.add(new THREE.HemisphereLight(lighting.hemisphereSky, lighting.hemisphereGround, lighting.hemisphereIntensity))
  const sun = new THREE.DirectionalLight(lighting.sun, lighting.sunIntensity)
  sun.position.set(...lighting.sunPosition)
  sun.castShadow = profile.shadows
  if (profile.shadowMapSize > 0) sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize)
  sun.shadow.radius = quality === 'high' ? 4 : 2
  sun.shadow.camera.left = -48
  sun.shadow.camera.right = 48
  sun.shadow.camera.top = 48
  sun.shadow.camera.bottom = -48
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 110
  sun.shadow.normalBias = 0.045
  sun.shadow.bias = -0.00015
  sun.shadow.blurSamples = quality === 'high' ? 8 : 0
  sun.shadow.camera.updateProjectionMatrix()
  scene.add(sun)
  const fill = new THREE.DirectionalLight(lighting.fill, lighting.fillIntensity)
  fill.position.set(...lighting.fillPosition)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(lighting.rim, lighting.rimIntensity)
  rim.position.set(...lighting.rimPosition)
  scene.add(rim)
}