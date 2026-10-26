# miffer

A shared grocery list and reminders for two phones, kept in sync live.

- `frontend/`: React + Vite + TanStack Router + TanStack Query. Installable as a PWA; Tauri comes later.
- `backend/`: Hono on Node, Drizzle + Postgres, plus a WebSocket that tells phones when their list changed.

## Develop

Needs Node 22+, pnpm and Docker.

```bash
pnpm install
pnpm db      # Postgres on localhost:5432
pnpm dev     # backend on :3000, frontend on http://localhost:5173
```

The Us screen only offers notifications when the backend has `VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY` set (`npx web-push generate-vapid-keys` makes a pair).

```bash
pnpm typecheck
pnpm test    # backend tests, against the dev database
```

After changing `backend/src/db/schema.ts`, run `pnpm --filter backend db:generate` and commit the new file in `backend/drizzle/`. Migrations run when the backend starts.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, tests and build, then
it builds the two images, pushes them to `ghcr.io/christoffer-m/miffer-*`, copies
`docker-compose.yml` to the server, pulls the images there and runs `docker compose up -d`.
Pull requests only run the checks. The server never needs the repo: just one folder with
`docker-compose.yml` and `.env`.

The server is any VPS with Docker where nginx-proxy and acme-companion already run, on the
Docker network `proxy`. nginx-proxy sends `/api/` to `miffer-backend` and everything else to
`miffer-frontend` (prefixed, because service names are DNS names on that shared network), and acme-companion gets the certificate.

### One-time setup

**On the server**, make a folder with a `.env` in it. The first deploy puts
`docker-compose.yml` next to it. Paste this as the deploy user (`VPS_USER`) after
changing `DOMAIN` (and `DIR` if you like). It generates the database password and
refuses to overwrite an existing `.env`:

```bash
(
  set -euo pipefail
  DIR=/srv/miffer               # the folder VPS_DEPLOY_PATH points at
  DOMAIN=miffer.example.com     # the domain pointing at this server

  mkdir -p "$DIR"
  if [ -e "$DIR/.env" ]; then
    echo "$DIR/.env already exists, not touching it (Postgres keeps the password it started with)." >&2
    exit 1
  fi
  umask 077   # only the owner can read it
  cat > "$DIR/.env" <<EOF
# miffer settings, read by docker-compose.yml in this folder
DB_PASSWORD=$(openssl rand -hex 32)
DOMAIN=$DOMAIN
PROXY_NETWORK=proxy
EOF
  echo "Wrote $DIR/.env"
)
```

If `/srv` needs root: `sudo mkdir -p /srv/miffer && sudo chown $USER /srv/miffer` first.

| Variable | Example | What it is |
|---|---|---|
| `DB_PASSWORD` | a long random string | Postgres password. Keep it: changing it later locks the app out of the existing database |
| `DOMAIN` | `miffer.example.com` | Domain pointing at the server |
| `PROXY_NETWORK` | `proxy` | Only if nginx-proxy's network isn't called `proxy` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from `npx web-push generate-vapid-keys` | Optional: turns on notifications when someone adds something. Keep them: new keys mean everyone has to turn notifications on again |

On iPhones notifications need iOS 16.4+ and miffer added to the Home Screen; the Us screen says so.

**In GitHub** (miffer repo → Settings → Environments → `production`), add these secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | the server's address |
| `VPS_USER` | the SSH user |
| `VPS_SSH_KEY` | the private key for that user |
| `VPS_DEPLOY_PATH` | that folder, as an absolute path, e.g. `/srv/miffer` |

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
