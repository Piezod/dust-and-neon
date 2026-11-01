import {
  generateRoomCode,
  isValidRoomCode,
  sanitizeDisplayName,
} from '../../src/multiplayer/protocol'
import { MultiplayerRoom } from './Room'

export { MultiplayerRoom }

const ROOM_PATH = /^\/api\/rooms\/([A-Z2-9]{12})(?:\/(join|socket))?$/
const MAX_CREATE_BODY_BYTES = 2_048

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ status: 'ok', service: 'dust-and-neon-multiplayer' })
    const origin = request.headers.get('Origin')
    if (request.method === 'OPTIONS') return preflight(origin, env)
    if (!origin || !isAllowedOrigin(origin, env)) return json({ code: 'ORIGIN_NOT_ALLOWED', message: 'El origen de esta pagina no esta permitido.' }, 403)

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await readRequestJson(request)
      const displayName = sanitizeDisplayName(body?.displayName)
      if (!displayName) return withCors(json({ code: 'INVALID_NAME', message: 'El nombre debe tener entre 2 y 20 caracteres.' }, 400), origin)
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = generateRoomCode()
        const stub = env.ROOMS.getByName(code)
        const response = await stub.fetch('https://room.internal/internal/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, displayName }),
        })
        if (response.status === 409) continue
        return withCors(response, origin)
      }
      return withCors(json({ code: 'ROOM_CREATE_FAILED', message: 'No se pudo reservar una sala. Intentalo de nuevo.' }, 503), origin)
    }

    const roomMatch = ROOM_PATH.exec(url.pathname)
    if (roomMatch) {
      const roomCode = roomMatch[1]
      if (!isValidRoomCode(roomCode)) return withCors(json({ code: 'INVALID_ROOM', message: 'El codigo de sala no es valido.' }, 400), origin)
      const stub = env.ROOMS.getByName(roomCode)
      const action = roomMatch[2]
      if (action === 'join' && request.method === 'POST') {
        const body = await readRequestJson(request)
        const displayName = sanitizeDisplayName(body?.displayName)
        if (!displayName) return withCors(json({ code: 'INVALID_NAME', message: 'El nombre debe tener entre 2 y 20 caracteres.' }, 400), origin)
        const response = await stub.fetch('https://room.internal/internal/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName }),
        })
        return withCors(response, origin)
      }
      if (action === 'socket' && request.method === 'GET') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          return withCors(json({ code: 'UPGRADE_REQUIRED', message: 'Este endpoint requiere WebSocket.' }, 426), origin)
        }
        const socketRequest = new Request('https://room.internal/socket', request)
        return stub.fetch(socketRequest)
      }
      return withCors(json({ code: 'NOT_FOUND', message: 'No existe este endpoint de sala.' }, 404), origin)
    }
    return withCors(json({ code: 'NOT_FOUND', message: 'No existe este endpoint.' }, 404), origin)
  },
} satisfies ExportedHandler<Env>

function isAllowedOrigin(origin: string, env: Env): boolean {
  const normalized = origin.replace(/\/$/, '')
  const allowList = (env.ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim().replace(/\/$/, '')).filter(Boolean)
  if (allowList.includes(normalized)) return true
  if (env.ALLOW_LAN_ORIGINS !== 'true') return false
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' || parsed.port !== '5173') return false
    const host = parsed.hostname
    return /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  } catch {
    return false
  }
}

async function readRequestJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > MAX_CREATE_BODY_BYTES) return null
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_CREATE_BODY_BYTES) return null
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function preflight(origin: string | null, env: Env): Response {
  if (!origin || !isAllowedOrigin(origin, env)) return json({ code: 'ORIGIN_NOT_ALLOWED', message: 'El origen de esta pagina no esta permitido.' }, 403)
  return withCors(new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } }), origin)
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
