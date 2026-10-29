# Time Since

A small web app that shows how long it has been since each chore was last done. You create a timer, tap Reset when you do the chore, and optionally set a target so the app sends a push alert when the timer is overdue. It installs as a PWA (Progressive Web App) and runs as one Node process with a SQLite file.

Stack: Hono and better-sqlite3 on the server, Vue 3 with Vite on the client.

<img width="597" height="686" alt="image" src="https://github.com/user-attachments/assets/a86710de-9518-444d-9e8e-a94cfab3b4bc" />




## Local development

Requires Node 24.

```bash
npm ci
cp .env.example .env   # optional, defaults work
npm run dev            # API server on :3456, Vite client on :5173
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

1. On the Docker host, create the data folder. The app runs as uid 1000, so that user must own the folder. If Docker creates the folder, root owns it and the app cannot write:
   ```bash
   sudo mkdir -p /docker/time-since && sudo chown 1000:1000 /docker/time-since
   ```
2. In Portainer, go to Registries and add GitHub Container Registry (`ghcr.io`). Use your GitHub username and a personal access token with the `read:packages` scope. Skip this step if the `time-since` package on GitHub is public.
3. In Portainer, go to Stacks, Add stack, Repository. Use this repository and `docker-compose.yml`.
4. Add these environment variables:

| Variable            | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| `PUBLIC_ORIGIN`     | `https://time.thummper.net` (the exact public origin, https) |
| `TUNNEL_TOKEN`      | the tunnel token                                             |
| `VAPID_PUBLIC_KEY`  | from step 1                                                  |
| `VAPID_PRIVATE_KEY` | from step 1                                                  |
| `VAPID_SUBJECT`     | `mailto:you@example.com`                                     |
| `DATA_DIR`          | optional, host folder for the database (default `/docker/time-since`) |
| `IMAGE_TAG`         | optional, image tag to run (default `latest`)                |

5. Deploy the stack. Portainer pulls `ghcr.io/thummper/time-since`. The CI workflow must have run on `main` at least once, so the image exists.
6. Open the public hostname. Check `https://<host>/api/health` returns `{"ok":true}`.
7. On the Android phone, open the site in Chrome, install it, and enable alerts in Settings.

For a LAN test without the tunnel, uncomment `ports` in `docker-compose.yml` and set `PUBLIC_ORIGIN` to the LAN URL. Push needs https, so alerts only work through the tunnel.

### Update

The CI workflow (`.github/workflows/ci.yml`) runs lint, typecheck, and tests on every push and pull request. On `main`, it then pushes the image to GHCR with the tags `latest` and `sha-<commit>`. Migrations run at start.

Pick one way for Portainer to deploy the new image:

- **Webhook:** in the stack settings, turn on the webhook and copy its URL. In GitHub, add it as the repository secret `PORTAINER_WEBHOOK`. CI calls it after the push. GitHub must reach the URL, so Portainer must be public (for example through a second tunnel hostname).
- **Polling:** in the stack settings, turn on GitOps updates with polling and "Re-pull image". Portainer then redeploys when `main` changes. It needs no public URL, but it can pull before CI finishes. In that case, the next poll or a manual "Pull and redeploy" picks up the new image.

To roll back, set `IMAGE_TAG` to an older `sha-<commit>` tag and redeploy.

### Backups and restore

The app writes a consistent copy of the database (`VACUUM INTO`) every night at 02:30 server time into `/data/backups/` (the `BACKUP_DIR` variable). It keeps the newest 14 files, named `time-since-YYYYMMDD-HHMMSS.db`.

The host folder `/docker/time-since` (the `DATA_DIR` variable) holds both the live database and the backups. If the disk dies, both go. Put `BACKUP_DIR` on different storage (mount a host path or NFS share over `/data/backups`, see the comment in `docker-compose.yml`), or make sure the Proxmox host's backup job covers the VM disk.

To restore:

1. In Portainer, stop the `app` container.
2. Copy the chosen backup over `/data/time-since.db` in the data folder, and delete `/data/time-since.db-wal` and `/data/time-since.db-shm` if they exist. On the Docker host:
   ```bash
   cd /docker/time-since && sudo cp backups/time-since-YYYYMMDD-HHMMSS.db time-since.db && sudo rm -f time-since.db-wal time-since.db-shm && sudo chown 1000:1000 time-since.db
   ```
3. Start the `app` container and check `/api/health`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). You can use, change, and share this code for any noncommercial purpose. Commercial use is not allowed.
