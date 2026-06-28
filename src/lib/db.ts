import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    // Pooler-friendly settings: the Supabase pooler (port 6543) kills idle
    // connections aggressively. The defaults (5s connect, no statement
    // timeout) caused the dashboard to hang for 75s when the pooler reset
    // a connection. These settings make failures fast and let the caller
    // retry or fall back.
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

// Apply Postgres-level timeouts on every connection. statement_timeout makes
// long queries fail fast (instead of hanging the whole request), while
// idle_in_transaction_session_timeout closes zombie connections left behind
// by the pooler. These are no-ops if the DB user lacks the privilege to set
// them.
db.$connect()
  .then(() =>
    Promise.all([
      db.$executeRawUnsafe(`SET statement_timeout = '8s'`).catch(() => {}),
      db.$executeRawUnsafe(`SET idle_in_transaction_session_timeout = '10s'`).catch(() => {}),
    ])
  )
  .catch(() => {
    // First connect can fail if the pooler is down — the next request will retry.
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db