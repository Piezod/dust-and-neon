import assert from 'node:assert/strict'
import { test } from 'node:test'
import WebSocket from 'ws'

const workerUrl = process.env.MULTIPLAYER_WORKER_URL ?? 'http://127.0.0.1:8787'
const allowedOrigin = 'http://127.0.0.1:5173'

class RoomSocket {
  messages = []
  waiters = []
  socket

  constructor(url) {
    this.socket = new WebSocket(url, { origin: allowedOrigin })
    this.socket.on('message', (data) => {
      let message
      try { message = JSON.parse(data.toString()) } catch { return }
      this.messages.push(message)
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(message)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1)
          clearTimeout(waiter.timer)
          waiter.resolve(message)
        }
      }
    })
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
  }

  send(message) {
    this.socket.send(JSON.stringify(message))
  }

  waitFor(predicate, timeoutMs = 3_000, fromIndex = 0) {
    const existing = this.messages.slice(fromIndex).find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null }
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        reject(new Error('Timed out waiting for a room message'))
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  async expectNoMessage(predicate, timeoutMs = 180, fromIndex = this.messages.length) {
    if (this.messages.slice(fromIndex).some(predicate)) throw new Error('Unexpected duplicate message was delivered')
    await new Promise((resolve) => setTimeout(resolve, timeoutMs))
    assert.equal(this.messages.slice(fromIndex).some(predicate), false)
  }

  close() {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.socket.terminate()
        resolve()
      }, 1_000)
      this.socket.once('close', resolve)
      this.socket.once('close', () => clearTimeout(timeout))
      this.socket.close(1000, 'test cleanup')
    })
  }
}

async function post(path, body) {
  return fetch(`${workerUrl}${path}`, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function createRoom(name = 'Host Rider') {
  const response = await post('/api/rooms', { displayName: name })
  const data = await response.json()
  assert.equal(response.status, 200, data.message)
  assert.match(data.roomCode, /^[A-HJ-NP-Z2-9]{12}$/)
  assert.match(data.token, /^[a-f0-9]{64}$/)
  return data
}

async function joinRoom(code, name = 'Guest Rider') {
  const response = await post(`/api/rooms/${code}/join`, { displayName: name })
  const data = await response.json()
  return { response, data }
}

async function connect(credentials) {
  const socket = new RoomSocket(`${workerUrl.replace(/^http/, 'ws')}/api/rooms/${credentials.roomCode}/socket`)
  await socket.open()
  socket.send({ version: 1, type: 'auth', token: credentials.token })
  const ready = await socket.waitFor((message) => message.type === 'session.ready')
  assert.equal(ready.playerId, credentials.playerId)
  assert.equal(ready.role, credentials.role)
  return socket
}

function emptySnapshot(phase = 'combat') {
  return {
    phase, wave: 1, enemiesRemaining: 0, breakSeconds: 0, survivalSeconds: 1,
    players: [], enemies: [], projectiles: [], pickups: [], boss: null, confirmedEvents: [], result: null,
  }
}

test('real Durable Object room lifecycle, role checks, duplicate suppression and restart', async (context) => {
  const sockets = []
  context.after(async () => { await Promise.all(sockets.map((socket) => socket.close())) })
  const hostCredentials = await createRoom()
  const joined = await joinRoom(hostCredentials.roomCode)
  assert.equal(joined.response.status, 200)
  const guestCredentials = joined.data
  assert.equal(guestCredentials.role, 'guest')
  const third = await joinRoom(hostCredentials.roomCode, 'Third Rider')
  assert.equal(third.response.status, 409)
  assert.equal(third.data.code, 'ROOM_FULL')

  const host = await connect(hostCredentials)
  sockets.push(host)
  const guest = await connect(guestCredentials)
  sockets.push(guest)
  const roster = await host.waitFor((message) => message.type === 'room.state' && message.players.length === 2 && message.players.every((player) => player.connected))
  assert.equal(roster.players.filter((player) => player.connected).length, 2, JSON.stringify(roster.players))

  host.send({ version: 1, type: 'lobby.start', seq: 1 })
  await Promise.all([
    host.waitFor((message) => message.type === 'session.started'),
    guest.waitFor((message) => message.type === 'session.started'),
  ])
  const lateJoin = await joinRoom(hostCredentials.roomCode, 'Late Rider')
  assert.equal(lateJoin.response.status, 409)
  assert.equal(lateJoin.data.code, 'ROOM_STARTED')

  guest.send({ version: 1, type: 'input', seq: 1, clientTime: Date.now(), moveX: 1, moveZ: 0, aimX: 0, aimZ: 1, fire: true, dash: false })
  const forwarded = await host.waitFor((message) => message.type === 'input.forward')
  assert.equal(forwarded.playerId, guestCredentials.playerId)
  assert.equal(forwarded.input.seq, 1)
  const duplicateInputCursor = host.messages.length
  guest.send({ version: 1, type: 'input', seq: 1, clientTime: Date.now(), moveX: -1, moveZ: 0, aimX: 0, aimZ: 1, fire: false, dash: false })
  await host.expectNoMessage((message) => message.type === 'input.forward' && message.input.moveX === -1, 180, duplicateInputCursor)

  host.send({ version: 1, type: 'heartbeat', clientTime: 12345 })
  const heartbeat = await host.waitFor((message) => message.type === 'heartbeat.ack' && message.clientTime === 12345)
  assert.ok(heartbeat.serverTime >= 12345)

  const hostSnapshot = { version: 1, type: 'snapshot', seq: 0, hostTime: Date.now(), snapshot: emptySnapshot() }
  host.send(hostSnapshot)
  await guest.waitFor((message) => message.type === 'snapshot' && message.seq === 0)
  const duplicateSnapshotCursor = guest.messages.length
  host.send(hostSnapshot)
  await guest.expectNoMessage((message) => message.type === 'snapshot' && message.seq === 0, 180, duplicateSnapshotCursor)

  guest.send({ ...hostSnapshot, seq: 1 })
  const authorityError = await guest.waitFor((message) => message.type === 'server.error' && message.code === 'AUTHORITY_REQUIRED')
  assert.equal(authorityError.retryable, false)
  host.send({ version: 1, type: 'lobby.reset', seq: 2 })
  await host.waitFor((message) => message.type === 'server.error' && message.code === 'RESET_NOT_ALLOWED')

  const gameOverCursor = host.messages.length
  const guestGameOverCursor = guest.messages.length
  host.send({ version: 1, type: 'snapshot', seq: 1, hostTime: Date.now(), snapshot: emptySnapshot('game-over') })
  await Promise.all([
    host.waitFor((message) => message.type === 'room.state' && message.phase === 'ended', 3_000, gameOverCursor),
    guest.waitFor((message) => message.type === 'room.state' && message.phase === 'ended', 3_000, guestGameOverCursor),
  ])
  const resetCursor = host.messages.length
  const guestResetCursor = guest.messages.length
  host.send({ version: 1, type: 'lobby.reset', seq: 3 })
  await Promise.all([
    host.waitFor((message) => message.type === 'room.state' && message.phase === 'lobby', 3_000, resetCursor),
    guest.waitFor((message) => message.type === 'room.state' && message.phase === 'lobby', 3_000, guestResetCursor),
  ])
  const hostRestartCursor = host.messages.length
  const guestRestartCursor = guest.messages.length
  host.send({ version: 1, type: 'lobby.start', seq: 4 })
  await Promise.all([
    host.waitFor((message) => message.type === 'session.started', 3_000, hostRestartCursor),
    guest.waitFor((message) => message.type === 'session.started', 3_000, guestRestartCursor),
  ])
  const leaveCursor = host.messages.length
  guest.send({ version: 1, type: 'lobby.leave', seq: 2 })
  const soloRoster = await host.waitFor((message) => message.type === 'room.state' && message.players.some((player) => player.role === 'guest' && !player.connected), 3_000, leaveCursor)
  assert.equal(soloRoster.phase, 'playing')
})

test('host disconnect ends a separate session for the guest', async (context) => {
  const sockets = []
  context.after(async () => { await Promise.all(sockets.map((socket) => socket.close())) })
  const hostCredentials = await createRoom('Leaving Host')
  const joined = await joinRoom(hostCredentials.roomCode, 'Waiting Guest')
  assert.equal(joined.response.status, 200)
  const host = await connect(hostCredentials)
  const guest = await connect(joined.data)
  sockets.push(host, guest)
  host.send({ version: 1, type: 'lobby.start', seq: 1 })
  await guest.waitFor((message) => message.type === 'session.started')
  await host.close()
  const ended = await guest.waitFor((message) => message.type === 'session.ended')
  assert.equal(ended.reason, 'host-left')
  await guest.close()
})

test('HTTP endpoints enforce origin, display names and room-code shape', async () => {
  const wrongOrigin = await fetch(`${workerUrl}/api/rooms`, {
    method: 'POST', headers: { Origin: 'https://not-allowed.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Nope' }),
  })
  assert.equal(wrongOrigin.status, 403)
  const invalidName = await post('/api/rooms', { displayName: '<>\n' })
  assert.equal(invalidName.status, 400)
  const invalidCode = await post('/api/rooms/111111111111/join', { displayName: 'Rider' })
  assert.equal(invalidCode.status, 404)
})
