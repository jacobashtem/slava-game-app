/**
 * Auth utilities — session management via KV.
 * Phase 1: simple display-name login (no password).
 * Phase 2: Steam ticket verification.
 */
import type { H3Event } from 'h3'

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days in seconds

export interface Session {
  playerId: string
  displayName: string
  createdAt: number
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

function generatePlayerId(): string {
  return crypto.randomUUID()
}

/**
 * Create a new session, store in KV, return token.
 */
export async function createSession(
  event: H3Event,
  playerId: string,
  displayName: string,
): Promise<string> {
  const token = generateToken()
  const session: Session = {
    playerId,
    displayName,
    createdAt: Date.now(),
  }

  const kv = hubKV()
  await kv.set(`session:${token}`, JSON.stringify(session), { ttl: SESSION_TTL })
  return token
}

/**
 * Get session from KV by token. Returns null if expired/missing.
 */
export async function getSlavaSession(event: H3Event, token: string): Promise<Session | null> {
  const kv = hubKV()
  const raw = await kv.get<string>(`session:${token}`)
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as Session
}

/**
 * Middleware: extract session from Authorization header.
 * Sets event.context.session and event.context.playerId.
 */
export async function verifySession(event: H3Event): Promise<Session> {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Brak tokenu sesji.' })
  }

  const token = authHeader.slice(7)
  const session = await getSlavaSession(event, token)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Sesja wygasła lub nieprawidłowa.' })
  }

  event.context.session = session
  event.context.playerId = session.playerId
  return session
}

export { generatePlayerId }
