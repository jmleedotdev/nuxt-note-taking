import type { H3Event } from 'h3'
import type { authService } from './service'
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

type Service = ReturnType<typeof authService>

export function authClientIP(event: H3Event, service: Service) {
  // Vercel overwrites this header at its edge; the Node socket only exposes its
  // loopback proxy. Trust it only under server-owned Production platform identity.
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
    const supplied = getHeader(event, 'x-vercel-forwarded-for')

    // Never parse visitor-supplied chains or fall back to a different header.
    return supplied && isIP(supplied)
      ? supplied.replace(/^::ffff:/, '')
      : 'unknown'
  }

  const peer = (event.node.req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')

  // Trust one overwriting proxy only; never trust a client-supplied forwarded chain.
  if (peer === service.config.APP_TRUSTED_PROXY_IP) {
    const supplied = getHeader(event, 'x-real-ip')

    if (supplied && isIP(supplied)) {
      return supplied
    }
  }

  return peer
}

export async function consumeAuthLimit(service: Service, ip: string, subject?: string, purpose: 'registration' | 'login' | 'forgot' | 'reset' | 'change' = 'registration') {
  const digest = (value: string) => createHmac('sha256', service.config.APP_AUTH_SECRET).update(value).digest('hex')
  // Public demo credentials are shared: successful visitors must not exhaust an
  // account-wide bucket. Every attempt still consumes the IP and global budgets.
  const sharedDemoLogin = service.config.APP_ENV === 'demo' && purpose === 'login'
  const rules = [
    { key: 'global', max: 500, seconds: 3600 },
    { key: `ip:${digest(ip)}`, max: 20, seconds: 3600 },
    ...(subject && !sharedDemoLogin
      ? [
          {
            key: `email:${digest(subject)}`,
            max: 5,
            seconds: purpose === 'login'
              ? 900
              : 3600,
          },
          ...(purpose === 'registration' || purpose === 'forgot'
            ? [
                { key: `cooldown:${digest(subject)}`, max: 1, seconds: 30 },
              ]
            : []),
        ]
      : []),
  ].map(rule => ({
    ...rule,
    key: purpose === 'registration'
      ? rule.key
      : `${purpose}:${rule.key}`,
  })).sort((a, b) => a.key.localeCompare(b.key))

  // Stable lock order avoids deadlocks. ON CONFLICT is atomic across workers/instances.
  // Commit denied attempts too, so blocked requests still consume the IP budget.
  return service.client.begin(async (sql) => {
    let retryAfter = 0

    for (const rule of rules) {
      const rows = await sql`
        INSERT INTO registration_limit (key, count, expires_at)
        VALUES (${rule.key}, 1, now() + ${rule.seconds} * interval '1 second')
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN registration_limit.expires_at <= now() THEN 1 ELSE registration_limit.count + 1 END,
          expires_at = CASE WHEN registration_limit.expires_at <= now() THEN now() + ${rule.seconds} * interval '1 second' ELSE registration_limit.expires_at END
        RETURNING count, greatest(1, ceil(extract(epoch FROM (expires_at - now()))))::int AS retry_after
      `

      if (rows[0]!.count > rule.max) {
        retryAfter = Math.max(retryAfter, rows[0]!.retry_after)
      }
    }

    return retryAfter
  })
}
