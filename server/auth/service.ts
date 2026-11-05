import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getCookies } from 'better-auth/cookies'
import { betterAuth } from 'better-auth/minimal'
import postgres from 'postgres'
import { createDatabase } from '../db/client'
import * as schema from '../db/schema/auth'
import { isDemoAccount } from '../demo/accounts'
import { authConfig } from './config'
import { createMailSender, verificationMessage } from './mail'
import { hashPassword, verifyPassword } from './password'
import { createPasswordRecovery, credentialLockKey, replaceCredential } from './password-recovery'

function createAuthService() {
  const config = authConfig()
  const { client, db } = createDatabase()
  const sender = createMailSender(config)
  // All credential-lock waiters use this separate pool. They must never exhaust
  // the adapter pool needed by the login lock holder to finish creating a session.
  const credentialTransactions = postgres(config.DATABASE_URL, { max: 5 })
  const auth = betterAuth({
    baseURL: config.APP_URL,
    secret: config.APP_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      transaction: true,
    }),
    trustedOrigins: [config.APP_URL],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      async sendVerificationEmail({ user, token }) {
        const link = new URL('/api/registration/verify', config.APP_URL)

        link.searchParams.set('token', token)

        try {
          await sender.send(verificationMessage(user.email, link.href))
        } catch {
          console.warn('Verification mail submission failed')
        }
      },
    },
    session: {
      expiresIn: 604800,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: config.APP_URL.startsWith('https:'),
    },
  })

  return {
    client,
    sender,
    config,
    recovery: createPasswordRecovery({ client: credentialTransactions, config, sender }),
    cookies: getCookies(auth.options),
    async login(email: string, password: string, headers: Headers) {
      if (config.APP_ENV === 'demo') {
        const [user] = await client`SELECT id, email FROM "user" WHERE email = ${email}`

        if (!user || !isDemoAccount({ id: user.id, email: user.email }))
          return Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 })
      }

      return credentialTransactions.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${credentialLockKey(email)}, 0))`

        return auth.api.signInEmail({
          body: { email, password },
          headers,
          asResponse: true,
        })
      })
    },
    async changePassword(email: string, currentPassword: string, newPassword: string, headers: Headers) {
      return credentialTransactions.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${credentialLockKey(email)}, 0))`

        const response = await auth.api.getSession({
          headers,
          query: { disableCookieCache: true, disableRefresh: true },
          asResponse: true,
        })

        if (!response.ok)
          throw new Error('Session unavailable')

        const session = await response.json()

        if (!session || session.user.email !== email)
          return 'UNAUTHENTICATED' as const

        // Reauthorize after waiting for the credential lock. A preceding change,
        // reset, logout, or expiry must not leave an admitted request authorized.
        const rows = await sql`
          SELECT u.id, u.email_verified, a.password FROM "user" u
          JOIN session s ON s.user_id = u.id
          LEFT JOIN account a ON a.user_id = u.id AND a.provider_id = 'credential'
          WHERE s.id = ${session.session.id} AND u.email = ${email}
          AND s.expires_at > clock_timestamp()
          AND s.created_at > clock_timestamp() - interval '7 days'
        `
        const credential = rows[0]

        if (!credential)
          return 'UNAUTHENTICATED' as const

        if (!credential.email_verified)
          return 'EMAIL_NOT_VERIFIED' as const

        if (!credential.password || !await verifyPassword({ hash: credential.password, password: currentPassword }))
          return 'INVALID_CURRENT_PASSWORD' as const

        await replaceCredential(sql, credential.id, await hashPassword(newPassword))

        return 'password-changed' as const
      })
    },
    async session(headers: Headers) {
      return auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
        asResponse: true,
      })
    },
    async logout(headers: Headers) {
      const response = await auth.api.signOut({ headers, asResponse: true })
      // Better Auth suppresses deletion errors in signOut. Confirm revocation from
      // the database with the original cookie before releasing its clearing headers.
      const remaining = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
        asResponse: true,
      })

      if (!response.ok || !remaining.ok || await remaining.json() !== null) {
        throw new Error('Session revocation could not be confirmed')
      }

      return response
    },
    async resend(email: string, headers: Headers) {
      await auth.api.sendVerificationEmail({
        body: { email },
        headers,
      })
    },
    async verify(token: string, headers: Headers) {
      await auth.api.verifyEmail({
        query: { token },
        headers,
      })
    },
    async register(email: string, password: string, headers: Headers) {
      // Await the complete auth/mail lifecycle; never expose the library result.
      await auth.api.signUpEmail({
        body: { email, password, name: 'Note user' },
        headers,
      })
    },
  }
}

let instance: ReturnType<typeof createAuthService> | undefined

export function authService() {
  return instance ??= createAuthService()
}
