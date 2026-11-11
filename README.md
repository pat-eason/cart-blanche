# Cart Blanche

A weekly menu and grocery planner with a paper-craft feel. Plan the week's dinners, turn them into a
grocery list, check things off at the store, and look back at what you actually made.

<p align="center">
  <img src="docs/screenshots/plan.png" alt="Planning the week's menu, with suggestions and a running cost estimate" width="900">
</p>

**Stack:** React + TypeScript (Vite) · Go API (stdlib `net/http`) · SQLite (pure-Go driver, one file) · Docker Compose · pnpm workspace

```
apps/
  api/   Go API + SQLite (auth, household, recipes, menus, grocery, recommendations, stats)
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
Data lives in the `cartblanche-data` volume (SQLite at `/data/cartblanche.db`) and survives restarts.

## Develop locally

Needs Go ≥ 1.22, Node ≥ 24, pnpm.

```bash
pnpm install
pnpm dev:api    # API on :8787 (data in apps/api/data/)
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

## Deploy to a DigitalOcean droplet

1. Create a droplet with the **Docker** marketplace image (or install Docker + the compose plugin).
2. Copy the repo to the droplet and run, without a domain:
   ```bash
   WEB_PORT=80 docker compose up -d --build
   ```
3. With a domain pointing at the droplet (A record), get automatic HTTPS via Caddy:
   ```bash
   DOMAIN=menu.example.com COOKIE_SECURE=true docker compose --profile tls up -d --build
   ```
   (Leave `WEB_PORT` at its default so it doesn't collide with Caddy on 80.)
4. **Back up** the `cartblanche-data` volume (it's one SQLite file), e.g.
   `docker compose exec api sh -c 'cp /data/cartblanche.db /data/backup.db'` or snapshot the droplet.

Sessions are HttpOnly cookies stored server-side; passwords are bcrypt-hashed. Set `COOKIE_SECURE=true`
whenever you serve over HTTPS.

## API configuration

| Env | Default | |
|---|---|---|
| `ADDR` | `:8080` | listen address |
| `DB_PATH` | `./data/cartblanche.db` | SQLite file |
| `COOKIE_SECURE` | `false` | mark session cookie `Secure` |
