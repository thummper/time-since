# Time Since

**How long has it been since you last did that?**

Time Since keeps a count-up timer for each chore or habit: cleaning the aquarium, watering the plants, changing the bed sheets. When you do the chore, you tap Reset and the timer starts again from zero. Set a target, and the app alerts you when a timer is overdue.

**Try it at [time-since.app](https://time-since.app).** Start a demo with no sign-up, or create a free account.

<img width="597" height="686" alt="The Time Since timer list, with a card for each chore that shows the time since it was last done" src="https://github.com/user-attachments/assets/a86710de-9518-444d-9e8e-a94cfab3b4bc" />

## Features

- **Timers that count up.** Each card shows the time since the last reset. You can set a past start time for a chore you did before you started to use the app.
- **Targets and goal progress.** Give a timer a target, for example "every 7 days". The card shows how close the timer is to that target.
- **Push alerts.** The app sends a notification when a timer goes past its target.
- **History graph.** Each timer page shows a graph of the gaps between resets, so you can see if you do a chore more often or less often over time.
- **Sections.** Group timers into sections, for example "Home" or "Pets", and collapse the sections you do not need.
- **Installs like an app.** Time Since is a PWA (Progressive Web App). Add it to the home screen on Android or desktop, and it opens in its own window.
- **Light and dark themes.**

## Self-hosting

Time Since runs as one Node process with one SQLite database file. A small server or a home lab is enough. The steps are in [Deployment](#deployment).

Stack: [Hono](https://hono.dev) and better-sqlite3 on the server, Vue 3 with Vite on the client.

## Local development

Requires Node 24.

```bash
npm ci
cp .env.example .env   # optional, defaults work
npm run dev            # API server on :3456, Vite client on :5173
```

Set `PUBLIC_ORIGIN` to the URL you open in the browser (`http://localhost:5173` in dev). CSRF (cross-site request forgery) checks compare against it.

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

These steps use a Docker host (for example a Proxmox VM) managed with Portainer. One stack runs the app and a Cloudflare Tunnel, so you open no inbound ports. Run exactly one replica: SQLite has one writer.

The examples use the hostname `time.example.com`. Replace it with your own.

### 1. Generate VAPID keys (once)

Push alerts need VAPID (Voluntary Application Server Identification) keys.

```bash
npm run vapid:generate
```

Save the three printed values. Never rotate the keys: every existing push subscription breaks when they change. Set `VAPID_SUBJECT` to a `mailto:` address you own.

### 2. Create the Cloudflare Tunnel

The DNS for your domain must be on Cloudflare.

1. In Cloudflare Zero Trust, go to Networks, Tunnels, and create a Cloudflared tunnel.
2. Copy the tunnel token. It becomes `TUNNEL_TOKEN`.
3. Add a public hostname, for example `time.example.com`, with service type HTTP and URL `http://app:3000`.

### 3. Create the Portainer stack

1. On the Docker host, create the data folder. The app runs as uid 1000, so that user must own the folder. If Docker creates the folder, root owns it and the app cannot write:
   ```bash
   sudo mkdir -p /docker/time-since && sudo chown 1000:1000 /docker/time-since
   ```
2. In Portainer, go to Registries and add GitHub Container Registry (`ghcr.io`). Use your GitHub username and a personal access token with the `read:packages` scope. Skip this step if the `time-since` package on GitHub is public.
3. In Portainer, go to Stacks, Add stack, Repository. Use this repository and `docker-compose.yml`.
4. Add these environment variables:

| Variable            | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`     | `https://time.example.com` (the exact public origin, https)             |
| `TUNNEL_TOKEN`      | the tunnel token                                                        |
| `VAPID_PUBLIC_KEY`  | from step 1                                                             |
| `VAPID_PRIVATE_KEY` | from step 1                                                             |
| `VAPID_SUBJECT`     | `mailto:you@example.com`                                                |
| `ADMIN_EMAILS`      | optional, comma-separated emails of the accounts that may open `/admin` |
| `DATA_DIR`          | optional, host folder for the database (default `/docker/time-since`)   |
| `IMAGE_TAG`         | optional, image tag to run (default `latest`)                           |

5. Deploy the stack. Portainer pulls `ghcr.io/thummper/time-since`. The CI workflow must have run on `main` at least once, so the image exists.
6. Open the public hostname. Check that `https://<host>/api/health` returns `{"ok":true}`.
7. On an Android phone, open the site in Chrome, install it, and turn on alerts in Settings.

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
