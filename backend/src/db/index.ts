import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://miffer:miffer@localhost:5432/miffer";

export const sql = postgres(url, { onnotice: () => {} }); // skip "already exists" noise from migrations
export const db = drizzle(sql, { schema, casing: "snake_case" });
export { schema };
