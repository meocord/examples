import { type DatabaseSync } from 'node:sqlite'
import { Inject, Service } from 'meocord/decorator'
import { DATABASE } from '@src/database/database.provider'

export type Action = 'warn' | 'timeout' | 'ban'
export type Status = 'pending' | 'done' | 'cancelled' | 'refused'

export interface Case {
  id: number
  guildId: string
  action: Action
  targetId: string
  moderatorId: string
  reason: string
  minutes: number | null
  status: Status
  createdAt: string
}

export type NewCase = Pick<Case, 'guildId' | 'action' | 'targetId' | 'moderatorId' | 'reason'> & { minutes?: number }

interface Row {
  id: number
  guild_id: string
  action: Action
  target_id: string
  moderator_id: string
  reason: string
  minutes: number | null
  status: Status
  created_at: string
}

const toCase = (row: Row): Case => ({
  id: row.id,
  guildId: row.guild_id,
  action: row.action,
  targetId: row.target_id,
  moderatorId: row.moderator_id,
  reason: row.reason,
  minutes: row.minutes,
  status: row.status,
  createdAt: row.created_at,
})

/** The case log: every value reaches SQLite as a parameter, and every query is scoped to one server. */
@Service()
export class CaseStore {
  constructor(@Inject(DATABASE) private readonly db: DatabaseSync) {}

  /** Opens a case in `status`: `done` for a warning, `pending` for an action that waits for its moderator. */
  open(entry: NewCase, status: 'pending' | 'done'): Case {
    const row = this.db
      .prepare(
        `INSERT INTO cases (guild_id, action, target_id, moderator_id, reason, minutes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(entry.guildId, entry.action, entry.targetId, entry.moderatorId, entry.reason, entry.minutes ?? null, status)
    return toCase(row as unknown as Row)
  }

  /**
   * Takes a pending case to `status`, once: two clicks, or a click after Cancel, find nothing to take the second
   * time. Undefined when the case isn't pending in this server.
   */
  take(guildId: string, id: number, status: Exclude<Status, 'pending'>): Case | undefined {
    const row = this.db
      .prepare(`UPDATE cases SET status = ? WHERE id = ? AND guild_id = ? AND status = 'pending' RETURNING *`)
      .get(status, id, guildId)
    return row && toCase(row as unknown as Row)
  }

  /** Records what became of an action once Discord answered. */
  settle(id: number, status: 'done' | 'refused'): void {
    this.db.prepare(`UPDATE cases SET status = ? WHERE id = ?`).run(status, id)
  }

  get(guildId: string, id: number): Case | undefined {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ? AND guild_id = ?`).get(id, guildId)
    return row && toCase(row as unknown as Row)
  }

  /** A member's cases in a server, newest first. */
  forMember(guildId: string, targetId: string, limit = 10): Case[] {
    const rows = this.db
      .prepare(`SELECT * FROM cases WHERE guild_id = ? AND target_id = ? ORDER BY id DESC LIMIT ?`)
      .all(guildId, targetId, limit)
    return (rows as unknown as Row[]).map(toCase)
  }

  /** Case numbers in a server that start with what was typed, newest first, at most 25, as Discord shows. */
  search(guildId: string, typed: string): Case[] {
    const rows = this.db
      .prepare(`SELECT * FROM cases WHERE guild_id = ? AND CAST(id AS TEXT) LIKE ? ORDER BY id DESC LIMIT 25`)
      .all(guildId, `${typed.replace(/\D/g, '')}%`)
    return (rows as unknown as Row[]).map(toCase)
  }
}
