import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { WSContext } from "hono/ws";
import { app, deviceForToken } from "./app.js";
import { db, sql } from "./db/index.js";
import { startHeartbeat, subscribe, unsubscribe } from "./live.js";

await migrate(db, { migrationsFolder: "./drizzle" });

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Browsers can't add headers to a WebSocket, so the token is the first message.
app.get(
  "/ws",
  upgradeWebSocket(() => {
    let householdId: string | undefined;
    let socket: WSContext | undefined;
    return {
      onOpen: (_evt, ws) => {
        socket = ws;
      },
      onMessage: async (evt, ws) => {
        if (householdId) return;
        // Not covered by Hono's error handling: an uncaught error here would crash the process.
        try {
          const device = await deviceForToken(String(evt.data));
          if (!device) return ws.close(4401, "unauthorized");
          householdId = device.householdId;
          subscribe(householdId, socket ?? ws);
        } catch (err) {
          console.error("ws auth failed", err);
          ws.close(1011, "server error"); // the app reconnects and tries again
        }
      },
      onClose: (_evt, ws) => {
        if (householdId) unsubscribe(householdId, socket ?? ws);
      },
    };
  }),
);

const port = Number(process.env.PORT ?? 3000);
const server = serve({ fetch: app.fetch, port }, () => console.log(`backend listening on :${port}`));
injectWebSocket(server);
const heartbeat = startHeartbeat();

process.on("SIGTERM", () => {
  clearInterval(heartbeat);
  server.close(() => sql.end().then(() => process.exit(0)));
});
