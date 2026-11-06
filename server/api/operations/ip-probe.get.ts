import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { authConfig } from '../../auth/config'

// Temporary #50 ingress investigation. Remove before publication. No database access.
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  const secret = process.env.CRON_SECRET
  const supplied = Buffer.from(getHeader(event, 'authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret ?? ''}`)

  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    setResponseStatus(event, 401)

    return {
      error: { code: 'UNAUTHORIZED' },
    }
  }

  if (authConfig().APP_ENV !== 'demo') {
    setResponseStatus(event, 403)

    return {
      error: { code: 'DEMO_ONLY' },
    }
  }

  const nonce = getHeader(event, 'x-operator-probe-nonce') ?? ''

  if (!/^[a-f0-9]{32}$/.test(nonce)) {
    setResponseStatus(event, 422)

    return {
      error: { code: 'INVALID_PROBE_NONCE' },
    }
  }

  // A per-run nonce prevents linking fingerprints across investigations.
  const fingerprint = (value: string) => createHmac('sha256', secret)
    .update(`ip-probe:${nonce}:`)
    .update(value)
    .digest('hex')
  const values = {
    'peer': event.node.req.socket.remoteAddress?.replace(/^::ffff:/, ''),
    'x-forwarded-for': getHeader(event, 'x-forwarded-for'),
    'x-vercel-forwarded-for': getHeader(event, 'x-vercel-forwarded-for'),
    'x-real-ip': getHeader(event, 'x-real-ip'),
    'forwarded': getHeader(event, 'forwarded'),
  }

  return {
    runtime: {
      node: process.version,
      vercel: process.env.VERCEL === '1',
      environment: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    addresses: Object.fromEntries(Object.entries(values).map(([name, value]) => [
      name,
      {
        present: !!value,
        validIP: !!value && isIP(value) !== 0,
        fingerprint: fingerprint(value ?? ''),
      },
    ])),
  }
})
