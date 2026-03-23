import type { Context, Next } from 'hono'

export async function authMiddleware(c: Context, next: Next) {
  // Skip auth for UI route and public chart endpoint
  if (c.req.path === '/' || c.req.path === '/chart' || c.req.path === '/favicon.ico') {
    return next()
  }

  // 1. API key check
  const key = c.req.header('X-API-Key') ?? c.req.query('key')
  const secret = c.env.API_SECRET as string

  if (!secret || key !== secret) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // 2. Origin restriction — allow lumenastral.com + localhost for dev
  const origin = c.req.header('Origin') ?? ''
  const referer = c.req.header('Referer') ?? ''
  const allowed = [
    'https://lumenastral.com',
    'https://www.lumenastral.com',
    'http://localhost',
    'http://localhost:5173',
    'http://localhost:8787',
  ]
  const isAllowed = allowed.some(o => origin.startsWith(o) || referer.startsWith(o))

  // In production, enforce origin. In dev (no origin header), allow through.
  if (origin && !isAllowed) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await next()
}
