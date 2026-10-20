# miffer

A shared grocery list for two phones, kept in sync live.

- `frontend/`: React + Vite + TanStack Router + TanStack Query. Installable as a PWA; Tauri comes later.
- `backend/`: Hono on Node, Drizzle + Postgres, plus a WebSocket that tells phones when their list changed.

## Develop

Needs Node 22+, pnpm and Docker.

```bash
pnpm install
pnpm db      # Postgres on localhost:5432
pnpm dev     # backend on :3000, frontend on http://localhost:5173
```

```bash
pnpm typecheck
pnpm test    # backend tests, against the dev database
```

After changing `backend/src/db/schema.ts`, run `pnpm --filter backend db:generate` and commit the new file in `backend/drizzle/`. Migrations run when the backend starts.

## Deploy (Docker + nginx-proxy)

The server already runs nginx-proxy and acme-companion. Put a `.env` next to `docker-compose.yml`:

| Variable | Example | What it is |
|---|---|---|
| `DB_PASSWORD` | a long random string | Postgres password |
| `DOMAIN` | `miffer.example.com` | Domain pointing at the server |
| `PROXY_NETWORK` | `nginx-proxy` | Docker network nginx-proxy is on (`docker network ls`) |

```bash
docker compose up -d --build            # everything
docker compose up -d --build frontend   # or just one side
```

nginx-proxy sends `/api/` to `backend` and everything else to `frontend`; acme-companion gets the certificate. Path routing (`VIRTUAL_PATH`) needs nginx-proxy 1.x or newer.

**Back up the database.** For example, a nightly cron job on the server:

```bash
docker compose exec -T db pg_dump -U miffer miffer | gzip > miffer-$(date +%F).sql.gz
```

Then copy the file somewhere off the server.
