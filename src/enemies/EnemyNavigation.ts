import * as THREE from 'three'

interface HeapEntry {
  readonly index: number
  readonly priority: number
}

class MinHeap {
  private readonly entries: HeapEntry[] = []

  get size(): number {
    return this.entries.length
  }

  push(entry: HeapEntry): void {
    let index = this.entries.length
    this.entries.push(entry)
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.entries[parent].priority <= entry.priority) break
      this.entries[index] = this.entries[parent]
      index = parent
    }
    this.entries[index] = entry
  }

  pop(): HeapEntry | null {
    if (this.entries.length === 0) return null
    const first = this.entries[0]
    const last = this.entries.pop()!
    if (this.entries.length === 0) return first
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.entries.length) break
      const child = right < this.entries.length && this.entries[right].priority < this.entries[left].priority ? right : left
      if (this.entries[child].priority >= last.priority) break
      this.entries[index] = this.entries[child]
      index = child
    }
    this.entries[index] = last
    return first
  }
}

export function hasLineOfSight(start: THREE.Vector3, end: THREE.Vector3, obstacles: readonly THREE.Box2[]): boolean {
  for (const obstacle of obstacles) {
    if (segmentIntersectsBox(start.x, start.z, end.x, end.z, obstacle, 0.015)) return false
  }
  return true
}

export function hasClearMovementSegment(start: THREE.Vector3, end: THREE.Vector3, obstacles: readonly THREE.Box2[], radius: number): boolean {
  return obstacles.every((obstacle) => !segmentIntersectsBox(start.x, start.z, end.x, end.z, obstacle, radius + 0.06))
}

export function isNavigationPointClear(point: THREE.Vector3, obstacles: readonly THREE.Box2[], radius: number): boolean {
  const clearance = radius + 0.06
  for (const obstacle of obstacles) {
    const closestX = THREE.MathUtils.clamp(point.x, obstacle.min.x, obstacle.max.x)
    const closestZ = THREE.MathUtils.clamp(point.z, obstacle.min.y, obstacle.max.y)
    if ((point.x - closestX) ** 2 + (point.z - closestZ) ** 2 < clearance * clearance) return false
  }
  return true
}

export function findGridPath(
  start: THREE.Vector3,
  goal: THREE.Vector3,
  obstacles: readonly THREE.Box2[],
  radius: number,
  cellSize = 1,
  maxExpanded = 2400,
): THREE.Vector3[] | null {
  const startX = Math.round(start.x / cellSize)
  const startZ = Math.round(start.z / cellSize)
  const goalX = Math.round(goal.x / cellSize)
  const goalZ = Math.round(goal.z / cellSize)
  const margin = 6
  const minX = Math.min(startX, goalX) - margin
  const minZ = Math.min(startZ, goalZ) - margin
  const width = Math.max(startX, goalX) - minX + margin + 1
  const height = Math.max(startZ, goalZ) - minZ + margin + 1
  if (width > 64 || height > 64) return null
  const startIndex = (startZ - minZ) * width + startX - minX
  const goalIndex = (goalZ - minZ) * width + goalX - minX
  if (startIndex < 0 || goalIndex < 0 || goalIndex >= width * height) return null
  if (blocked(goalX * cellSize, goalZ * cellSize, obstacles, radius)) return null

  const total = width * height
  const costs = new Float32Array(total)
  costs.fill(Infinity)
  const parents = new Int32Array(total)
  parents.fill(-1)
  const closed = new Uint8Array(total)
  const open = new MinHeap()
  costs[startIndex] = 0
  open.push({ index: startIndex, priority: heuristic(startX, startZ, goalX, goalZ) })

  let expanded = 0
  let reached = false
  while (open.size > 0 && expanded < maxExpanded) {
    const current = open.pop()!
    if (closed[current.index]) continue
    closed[current.index] = 1
    expanded++
    if (current.index === goalIndex) {
      reached = true
      break
    }
    const currentX = current.index % width + minX
    const currentZ = Math.floor(current.index / width) + minZ
    for (const [stepX, stepZ] of NEIGHBORS) {
      const nextX = currentX + stepX
      const nextZ = currentZ + stepZ
      const nextLocalX = nextX - minX
      const nextLocalZ = nextZ - minZ
      if (nextLocalX < 0 || nextLocalZ < 0 || nextLocalX >= width || nextLocalZ >= height) continue
      const nextIndex = nextLocalZ * width + nextLocalX
      if (closed[nextIndex] || nextIndex !== startIndex && blocked(nextX * cellSize, nextZ * cellSize, obstacles, radius)) continue
      if (stepX !== 0 && stepZ !== 0
        && (blocked((currentX + stepX) * cellSize, currentZ * cellSize, obstacles, radius)
          || blocked(currentX * cellSize, (currentZ + stepZ) * cellSize, obstacles, radius))) continue
      const candidateCost = costs[current.index] + (stepX !== 0 && stepZ !== 0 ? Math.SQRT2 : 1)
      if (candidateCost >= costs[nextIndex]) continue
      costs[nextIndex] = candidateCost
      parents[nextIndex] = current.index
      open.push({ index: nextIndex, priority: candidateCost + heuristic(nextX, nextZ, goalX, goalZ) })
    }
  }
  if (!reached) return null

  const reversed: THREE.Vector3[] = []
  let cursor = goalIndex
  while (cursor !== startIndex && cursor >= 0) {
    reversed.push(new THREE.Vector3((cursor % width + minX) * cellSize, 0, (Math.floor(cursor / width) + minZ) * cellSize))
    cursor = parents[cursor]
  }
  if (cursor < 0) return null
  reversed.reverse()
  return smoothPath(start, goal, reversed, obstacles, radius)
}

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
]

function blocked(x: number, z: number, obstacles: readonly THREE.Box2[], radius: number): boolean {
  const clearance = radius + 0.06
  for (const obstacle of obstacles) {
    const closestX = THREE.MathUtils.clamp(x, obstacle.min.x, obstacle.max.x)
    const closestZ = THREE.MathUtils.clamp(z, obstacle.min.y, obstacle.max.y)
    if ((x - closestX) ** 2 + (z - closestZ) ** 2 < clearance * clearance) return true
  }
  return false
}

function heuristic(x: number, z: number, goalX: number, goalZ: number): number {
  const dx = Math.abs(goalX - x)
  const dz = Math.abs(goalZ - z)
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
}

function smoothPath(start: THREE.Vector3, goal: THREE.Vector3, points: THREE.Vector3[], obstacles: readonly THREE.Box2[], radius: number): THREE.Vector3[] {
  if (points.length <= 1) return [goal.clone()]
  const result: THREE.Vector3[] = []
  let current = start.clone()
  let index = 0
  while (index < points.length) {
    let furthest = index
    for (let candidate = index + 1; candidate < points.length; candidate++) {
      if (!segmentClear(current, points[candidate], obstacles, radius)) break
      furthest = candidate
    }
    current = points[furthest]
    result.push(current)
    index = furthest + 1
  }
  if (segmentClear(current, goal, obstacles, radius)) result.push(goal.clone())
  return result
}

function segmentClear(start: THREE.Vector3, end: THREE.Vector3, obstacles: readonly THREE.Box2[], radius: number): boolean {
  return obstacles.every((obstacle) => !segmentIntersectsBox(start.x, start.z, end.x, end.z, obstacle, radius + 0.06))
}

function segmentIntersectsBox(startX: number, startZ: number, endX: number, endZ: number, obstacle: THREE.Box2, padding: number): boolean {
  const minX = obstacle.min.x - padding
  const maxX = obstacle.max.x + padding
  const minZ = obstacle.min.y - padding
  const maxZ = obstacle.max.y + padding
  const dx = endX - startX
  const dz = endZ - startZ
  let enter = 0
  let exit = 1
  for (const [origin, delta, minimum, maximum] of [[startX, dx, minX, maxX], [startZ, dz, minZ, maxZ]]) {
    if (Math.abs(delta) < 1e-10) {
      if (origin < minimum || origin > maximum) return false
      continue
    }
    const first = (minimum - origin) / delta
    const second = (maximum - origin) / delta
    enter = Math.max(enter, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
    if (enter > exit) return false
  }
  return enter >= 0 && enter <= 1
}
