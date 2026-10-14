# Time Since

A small web app that shows how long it has been since each chore was last done. You create a timer, tap Reset when you do the chore, and optionally set a target so the app sends a push alert when the timer is overdue. It installs as a PWA (Progressive Web App) and runs as one Node process with a SQLite file.

Stack: Hono and better-sqlite3 on the server, Vue 3 with Vite on the client.

## Local development

Requires Node 24.

```bash
npm ci
cp .env.example .env   # optional, defaults work
npm run dev            # server on :3000, Vite client on :5173
```

Set `PUBLIC_ORIGIN` to the URL you open in the browser (`http://localhost:5173` in dev). CSRF checks compare against it.

## Tests

```bash
npm test               # unit and API tests (Vitest)
npm run typecheck
npm run lint
npm run build
npx playwright install chromium   # once
npm run test:e2e       # builds, starts a server on port 4173 with a temp database, runs the smoke flow
```

## Deployment

The target is a Docker host (for example a Proxmox VM) managed with Portainer. One stack runs the app and a Cloudflare Tunnel, so you open no inbound ports. Run exactly one replica: SQLite has one writer.

### 1. Generate VAPID keys (once)

```bash
npm run vapid:generate
```

Save the three printed values. Never rotate the keys: every existing push subscription breaks when they change. Set `VAPID_SUBJECT` to a `mailto:` address you own.

### 2. Create the Cloudflare Tunnel

The DNS for `thummper.net` must be on Cloudflare.

1. In Cloudflare Zero Trust, go to Networks, Tunnels, and create a Cloudflared tunnel.
2. Copy the tunnel token. It becomes `TUNNEL_TOKEN`.
3. Add a public hostname, for example `time.thummper.net`, with service type HTTP and URL `http://app:3000`.

### 3. Create the Portainer stack

1. In Portainer, go to Stacks, Add stack, Repository. Use this repository and `docker-compose.yml`.
2. Add these environment variables:

| Variable            | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| `PUBLIC_ORIGIN`     | `https://time.thummper.net` (the exact public origin, https) |
| `TUNNEL_TOKEN`      | the tunnel token                                             |
| `VAPID_PUBLIC_KEY`  | from step 1                                                  |
| `VAPID_PRIVATE_KEY` | from step 1                                                  |
| `VAPID_SUBJECT`     | `mailto:you@example.com`                                     |

3. Deploy the stack. Portainer builds the image from the Dockerfile.
4. Open the public hostname. Check `https://<host>/api/health` returns `{"ok":true}`.
5. On the Android phone, open the site in Chrome, install it, and enable alerts in Settings.

For a LAN test without the tunnel, uncomment `ports` in `docker-compose.yml` and set `PUBLIC_ORIGIN` to the LAN URL. Push needs https, so alerts only work through the tunnel.

### Update

Pull the latest code and redeploy: in Portainer, open the stack, enable "Re-pull image and redeploy" or use the repository "Pull and redeploy" option, with rebuild on. Migrations run at start.

### Backups and restore

The app writes a consistent copy of the database (`VACUUM INTO`) every night at 02:30 server time into `/data/backups/` (the `BACKUP_DIR` variable). It keeps the newest 14 files, named `time-since-YYYYMMDD-HHMMSS.db`.

The `data` volume holds both the live database and the backups. If the disk dies, both go. Put `BACKUP_DIR` on different storage (mount a host path or NFS share over `/data/backups`, see the comment in `docker-compose.yml`), or make sure the Proxmox host's backup job covers the VM disk.

To restore:

1. In Portainer, stop the `app` container.
2. Copy the chosen backup over `/data/time-since.db` in the volume, and delete `/data/time-since.db-wal` and `/data/time-since.db-shm` if they exist. For example, with a temporary container:
   ```bash
   docker run --rm -v <stack>_data:/data alpine sh -c \
     "cp /data/backups/time-since-YYYYMMDD-HHMMSS.db /data/time-since.db && rm -f /data/time-since.db-wal /data/time-since.db-shm && chown 1000:1000 /data/time-since.db"
   ```
3. Start the `app` container and check `/api/health`.
