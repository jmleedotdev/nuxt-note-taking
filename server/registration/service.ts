import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createDatabase } from '../db/client'
import * as schema from '../db/schema/auth'
import { registrationConfig } from './config'
import { createMailSender, verificationMessage } from './mail'
import { hashPassword, verifyPassword } from './password'

function createRegistrationService() {
  const config = registrationConfig()
  const { client, db } = createDatabase()
  const sender = createMailSender(config)
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
    async login(email: string, password: string, headers: Headers) {
      return auth.api.signInEmail({
        body: { email, password },
        headers,
        asResponse: true,
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
      return auth.api.signOut({ headers, asResponse: true })
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

let instance: ReturnType<typeof createRegistrationService> | undefined

export function registrationService() {
  return instance ??= createRegistrationService()
}
