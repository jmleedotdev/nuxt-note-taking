import postgres from 'postgres'

// Demo instances retain independent one-connection pools for the adapter,
// credential locks, and lifecycle. Preserve normal-mode concurrency budgets.
export function databaseConnection(url: string, normalMax = 10) {
  const target = new URL(url)

  // postgres.js lets ?host= override the URL authority. Never classify TLS
  // against one hostname and then connect to a different effective target.
  if (!target.hostname || target.searchParams.has('host'))
    throw new Error('Database URLs must use an explicit authority host without a host query override')

  const host = target.hostname
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host)

  return postgres(url, {
    max: process.env.APP_ENV === 'demo'
      ? 1
      : normalMax,
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
