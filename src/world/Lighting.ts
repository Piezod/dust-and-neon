import * as THREE from 'three'

export function setupLighting(scene: THREE.Scene): void {
  scene.background = new THREE.Color('#c68e73')
  scene.fog = new THREE.Fog('#c68e73', 52, 115)
  scene.add(new THREE.HemisphereLight('#b7e5df', '#8e4835', 2.1))
  const sun = new THREE.DirectionalLight('#ffd1a0', 3.2)
  sun.position.set(-24, 35, 18)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -48
  sun.shadow.camera.right = 48
  sun.shadow.camera.top = 48
  sun.shadow.camera.bottom = -48
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 110
  sun.shadow.normalBias = 0.045
  sun.shadow.bias = -0.00015
  sun.shadow.camera.updateProjectionMatrix()
  scene.add(sun)
  const rim = new THREE.DirectionalLight('#7cebdd', 0.65)
  rim.position.set(12, 16, -24)
  scene.add(rim)
}