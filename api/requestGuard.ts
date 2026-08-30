type RateLimitEntry = { count: number; resetAt: number }

export type RateLimitDecision = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

const clients = new Map<string, RateLimitEntry>()

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 60) : fallback
}

export function requestClientId(headers: Record<string, string | string[] | undefined> = {}) {
  const forwarded = headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  const direct = headers['x-real-ip']
  return String(first || (Array.isArray(direct) ? direct[0] : direct) || 'anonymous').trim().slice(0, 120)
}

/**
 * A small per-instance safety net for the paid endpoint. Production can layer a
 * durable Vercel Firewall/KV limit over this without changing the handler.
 */
export function consumeRateLimit(clientId: string, now = Date.now()): RateLimitDecision {
  const limit = positiveInteger(process.env.ANALYSIS_RATE_LIMIT_PER_MINUTE, 6)
  const windowMs = 60_000
  const existing = clients.get(clientId)
  const entry = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing

  entry.count += 1
  clients.set(clientId, entry)

  // Keep a warm serverless instance bounded even when it sees many addresses.
  if (clients.size > 2_000) {
    for (const [key, value] of clients) {
      if (value.resetAt <= now) clients.delete(key)
    }
    while (clients.size > 2_000) {
      const oldest = clients.keys().next().value
      if (oldest === undefined) break
      clients.delete(oldest)
    }
  }

  return {
    allowed: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  }
}

export function resetRateLimitsForTests() {
  clients.clear()
}
