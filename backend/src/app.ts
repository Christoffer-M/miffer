import { Hono } from "hono";
import { householdRoutes } from "./routes/households.js";
import { itemRoutes } from "./routes/items.js";
import { reminderRoutes } from "./routes/reminders.js";
import { watchRoutes } from "./routes/watch.js";

export const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.text("ok"))
  .route("/households", householdRoutes)
  .route("/items", itemRoutes)
  .route("/reminders", reminderRoutes)
  .route("/watch", watchRoutes);

export type AppType = typeof app;
