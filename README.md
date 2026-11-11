# Cart Blanche

A weekly menu and grocery planner with a paper-craft feel. Plan the week's dinners, turn them into a
grocery list, check things off at the store, and look back at what you actually made.

<p align="center">
  <img src="docs/screenshots/plan.png" alt="Planning the week's menu, with suggestions and a running cost estimate" width="900">
</p>

**Stack:** React + TypeScript (Vite) · Go API (stdlib `net/http`) · PostgreSQL · Docker Compose · pnpm workspace

```
apps/
  api/   Go API + PostgreSQL (auth, household, recipes, menus, grocery, recommendations, stats)
  web/   React/TypeScript UI (desktop planning, mobile shopping)
```

## Screenshots

| Dashboard | Shopping list (phone) |
|---|---|
| <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="560"> | <img src="docs/screenshots/shop-mobile.png" alt="Notepad-style grocery list on a phone" width="240"> |

| Recipe box | History |
|---|---|
| <img src="docs/screenshots/recipes.png" alt="Recipe box" width="420"> | <img src="docs/screenshots/history.png" alt="History of past menus" width="420"> |

<img src="docs/screenshots/trends.png" alt="Trends: weekly spend, planned vs cooked, grocery makeup" width="900">

*(Screenshots use demo data.)*

## Run it with Docker (recommended)

```bash
docker compose up -d --build
```

Open <http://localhost:8080>, create an account, then **Recipes → Load starter recipes** to try it out.
Change the port with `WEB_PORT=3000 docker compose up -d --build` (or copy `.env.example` to `.env`).
(`docker-compose.prod.yml` is only for the droplet; locally you just use `docker-compose.yml`.)
Data lives in PostgreSQL, in the `pgdata` Docker volume, and survives restarts and rebuilds (not `docker compose down -v`).

## Develop locally

Needs Go ≥ 1.22, Node ≥ 24, pnpm.

```bash
pnpm install
pnpm dev:db     # Postgres in Docker, on 127.0.0.1:5433
pnpm dev:api    # API on :8787
pnpm dev:web    # UI on :5173, proxies /api to :8787
```

## How it works

1. **Plan** – pick 5–6 meals for the week, from your recipe box or from suggestions. Filter suggestions by meal
   type, tags to want/avoid, and max time. Set an optional budget; the estimate comes from per-ingredient prices.
2. **List** – "Build grocery list" aggregates every recipe's ingredients. Add off-menu items (laundry soap, chips)
   with optional prices. "Sync menu" re-syncs after menu edits and keeps checkmarks and extras.
3. **Shop** – tap items to check them off. The list polls every few seconds so the household sees each other's
   progress. Built for phones.
4. **Look back** – mark meals cooked/skipped, retire recipes ("never again"), re-use a past menu.

**Suggestions** rank recipes by habits: favorites rise, things not planned in a while (or never) rise, things you
planned recently sink, meals you skipped last time get a nudge, and "never again" recipes never appear. A variety
penalty keeps picks from sharing the same tags.

**Households** – each account belongs to one household. Share the invite code or link (Household page) so
others can sign up into it; everything (recipes, ingredients, menus, lists) is shared within it.

**Trends** – weekly spend vs. budget, planned vs. cooked, grocery makeup by aisle over time, top recipes, tags,
meal types.

## Deploy to a DigitalOcean droplet (GitHub Actions)

Cart Blanche shares a droplet with other apps. The server-level pieces (Docker, the `deploy` user, the firewall,
the HTTPS reverse proxy and its certificates) live in a separate repo,
`droplet-infra`. This repo only deploys its own containers and
publishes its own hostname to that proxy.

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml): typecheck and build →
build the API and web images and push them to GitHub Container Registry → SSH to the droplet, pull the images,
restart with `docker compose`, then register this app's domain with the shared proxy. Pull requests only run the
first step. The droplet never builds anything, so a small one is fine.

**Prerequisites (once)**

1. Set up the droplet and proxy from `droplet-infra` (its README walks through it).
2. As root on the droplet, give the deploy user this app's folder: `sudo install -d -o deploy -g deploy /opt/cart-blanche`.
3. Make an SSH key pair for this repo (`ssh-keygen -t ed25519 -f deploy_key -N ""`) and append the public key to
   `/home/deploy/.ssh/authorized_keys` on the droplet.
4. In this repo's Settings → Secrets and variables → Actions:

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `DROPLET_HOST` | droplet IP or hostname |
   | Secret | `DROPLET_USER` | `deploy` |
   | Secret | `DROPLET_SSH_KEY` | contents of the private `deploy_key` |
   | Secret | `DROPLET_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <droplet-ip>` |
   | Secret | `DROPLET_SSH_PORT` | optional, defaults to 22 |
   | Variable | `DOMAIN` | the hostname for this app, e.g. `menu.example.com` |

5. Point that hostname's DNS A record at the droplet.

Then push to `main` (or run the workflow from the Actions tab). The first deploy creates
`/opt/cart-blanche/.env` with a random Postgres password. The deploy waits for the API's health check and fails
with logs if it doesn't come up. Images are tagged with the commit SHA, so rolling back is re-running an older
workflow run. Use the `production` environment's required reviewers if you want a manual approval gate.

**How it plugs into the proxy** — [docker-compose.prod.yml](docker-compose.prod.yml) is layered over the
normal compose file on the droplet: the web container joins the shared `proxy` network under the alias
`cart-blanche-web`, nothing publishes host ports, and `COOKIE_SECURE` defaults to true. The hostname is published
from [deploy/cart-blanche.caddy](deploy/cart-blanche.caddy) with `proxy-site install cart-blanche`, which validates
the Caddy config and rolls back if it's invalid.

**Data & backups** — Postgres lives in the `pgdata` volume on the droplet, so deploys don't touch it. Back it up
with `pg_dump`, ideally from cron and copied off the droplet (and/or enable DigitalOcean droplet backups):

```bash
cd /opt/cart-blanche && COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml \
  docker compose exec -T db pg_dump -U cartblanche cartblanche | gzip > cartblanche-$(date +%F).sql.gz
```

Sessions are HttpOnly cookies stored server-side; passwords are bcrypt-hashed.

## API configuration

| Env | Default | |
|---|---|---|
| `ADDR` | `:8080` | listen address |
| `DATABASE_URL` | `postgres://cartblanche:cartblanche@localhost:5433/cartblanche?sslmode=disable` | Postgres connection string (compose sets this for you) |
| `COOKIE_SECURE` | `false` | mark session cookie `Secure` |
