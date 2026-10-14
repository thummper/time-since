import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// All times are UTC epoch milliseconds (KTD3).

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  /** Null for demo users, who cannot log in with a password. */
  passwordHash: text('password_hash'),
  isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
})

export const timers = sqliteTable('timers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetMs: integer('target_ms'),
  /** ID of the last reset an alert went out for (KTD5). */
  alertedForResetId: integer('alerted_for_reset_id'),
  createdAt: integer('created_at').notNull(),
})

export const resets = sqliteTable(
  'resets',
  {
    // AUTOINCREMENT: a deleted ID is never reused (KTD5 depends on this).
    id: integer('id').primaryKey({ autoIncrement: true }),
    timerId: integer('timer_id')
      .notNull()
      .references(() => timers.id, { onDelete: 'cascade' }),
    at: integer('at').notNull(),
    note: text('note'),
    isOrigin: integer('is_origin', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('resets_timer_id_at_idx').on(table.timerId, table.at)],
)

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: integer('created_at').notNull(),
})

export type User = typeof users.$inferSelect
export type Timer = typeof timers.$inferSelect
export type Reset = typeof resets.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect

