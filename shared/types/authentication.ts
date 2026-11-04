export interface AuthenticatedSession {
  user: { id: string, email: string }
  expiresAt: string
}
