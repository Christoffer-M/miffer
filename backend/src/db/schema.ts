import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const households = pgTable("households", {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Codes for linking another phone. Each links one phone, and a household can have several
// out at once, so inviting someone new doesn't break the link sent to someone else.
export const linkCodes = pgTable("link_codes", {
  code: text().primaryKey(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const devices = pgTable("devices", {
  id: uuid().primaryKey().defaultRandom(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  tokenHash: text().notNull().unique(),
  name: text().notNull().default(""),
  // Where to send this phone notifications (a browser PushSubscription), or null when they're off.
  push: jsonb().$type<{ endpoint: string; keys: { p256dh: string; auth: string } }>(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable(
  "items",
  {
    // Made on the phone, so items added offline can be sent later without clashing.
    id: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    done: boolean().notNull().default(false),
    addedBy: uuid().references(() => devices.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.householdId)],
);

// Everything a household has added and how often, for suggestions. Unlike items it
// survives Clear, so the list of usual things builds up over time.
export const itemHistory = pgTable(
  "item_history",
  {
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // The name in lower case, so "Mælk" and "mælk" count as one thing.
    key: text().notNull(),
    // As it was last typed.
    name: text().notNull(),
    count: integer().notNull().default(1),
    lastAddedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.key] })],
);
