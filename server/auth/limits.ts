import type { H3Event } from 'h3'
import type { authService } from './service'
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

type Service = ReturnType<typeof authService>

export function authClientIP(event: H3Event, service: Service) {
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

export async function consumeAuthLimit(service: Service, ip: string, subject?: string, purpose: 'registration' | 'login' | 'forgot' | 'reset' = 'registration') {
  const digest = (value: string) => createHmac('sha256', service.config.APP_AUTH_SECRET).update(value).digest('hex')
  const rules = [
    { key: 'global', max: 500, seconds: 3600 },
    { key: `ip:${digest(ip)}`, max: 20, seconds: 3600 },
    ...(subject
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
