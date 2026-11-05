// Fixed identities prevent an unrelated account with a matching address from
// becoming a demo account. Provisioning refuses collisions rather than adopting it.
export const demoAccounts = [
  { id: 'portfolio-demo-explorer', email: 'demo1@email.test' },
  { id: 'portfolio-demo-writer', email: 'demo2@email.test' },
] as const

export function isDemoAccount(user: { id: string, email: string }) {
  return demoAccounts.some(account => account.id === user.id && account.email === user.email)
}
