import { DatabaseSync } from 'node:sqlite'
import { createToken } from 'meocord/common'
import { type OnShutdown, type Provider } from 'meocord/interface'

/** The bot's SQLite database, one connection for the whole bot, typed by its token. */
export const DATABASE = createToken<DatabaseSync>('Database')

/** The schema, created on first use: a case per action a moderator takes or proposes. */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('warn', 'timeout', 'ban')),
    target_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    minutes INTEGER,
    status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'cancelled', 'refused')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS cases_by_target ON cases (guild_id, target_id);
`

/** Opens the database at `path`, creating its tables, and closes it as the bot stops. */
export function openDatabase(path: string): DatabaseSync & OnShutdown {
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)
  // A provided value's onShutdown runs as the bot stops, after every class that injects it
  return Object.assign(db, { onShutdown: () => db.close() } satisfies OnShutdown)
}

export const databaseProvider: Provider = {
  provide: DATABASE,
  // Made before login, so a database that can't be opened stops the bot with the reason
  useFactory: () => openDatabase(process.env.MODERATION_DB || 'moderation.db'),
}
