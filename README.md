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

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, tests and build, then
it builds the two images, pushes them to `ghcr.io/christoffer-m/miffer-*`, and on the
server pulls them and runs `docker compose up -d`. Pull requests only run the checks.

The server is any VPS with Docker where nginx-proxy and acme-companion already run, on the
Docker network `proxy`. nginx-proxy sends `/api/` to `backend` and everything else to
`frontend`, and acme-companion gets the certificate.

### One-time setup

**On the server**, clone the repo and add a `.env` next to `docker-compose.yml`:

```bash
git clone https://github.com/Christoffer-M/miffer.git ~/miffer
```

| Variable | Example | What it is |
|---|---|---|
| `DB_PASSWORD` | a long random string | Postgres password. Keep it: changing it later locks the app out of the existing database |
| `DOMAIN` | `miffer.example.com` | Domain pointing at the server |
| `PROXY_NETWORK` | `proxy` | Only if nginx-proxy's network isn't called `proxy` |

**In GitHub** (miffer repo → Settings → Environments → `production`), add these secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | the server's address |
| `VPS_USER` | the SSH user |
| `VPS_SSH_KEY` | the private key for that user |
| `VPS_DEPLOY_PATH` | where you cloned miffer, e.g. `/home/<user>/miffer` |

The first push to `main` after that deploys.

### By hand on the server

```bash
docker compose up -d                    # run what's there (TAG defaults to latest)
TAG=<commit sha> docker compose up -d   # roll back to an earlier build
```

**Back up the database.** For example, a nightly cron job on the server:

```bash
docker compose exec -T db pg_dump -U miffer miffer | gzip > miffer-$(date +%F).sql.gz
```

Then copy the file somewhere off the server.
