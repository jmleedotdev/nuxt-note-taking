import postgres from 'postgres'

// Each warm Node instance has separate adapter, credential, and lifecycle pools:
// one connection each, so a lock waiter cannot starve its holder's auth work.
export function databaseConnection(url: string) {
  const host = new URL(url).hostname
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host)

  return postgres(url, {
    max: 1,
    prepare: false,
    max_pipeline: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Remote database connections must encrypt AND verify the server certificate.
    ssl: local
      ? undefined
      : { rejectUnauthorized: true },
  })
}
