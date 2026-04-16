import { definePlugin } from 'nitro'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from '../../src/db'

export default definePlugin(async () => {
  if (process.env.SKIP_MIGRATIONS === 'true') {
    console.log('[migrate] SKIP_MIGRATIONS set, skipping.')
    return
  }
  console.log('[migrate] Running Drizzle migrations...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('[migrate] Done.')
})
