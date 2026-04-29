# Shadow Garden — WhatsApp Bot

Pre-bundled WhatsApp bot built on Baileys 7.0.0-rc.9 + Mongoose 9. Ships with a
single `dist/index.mjs` entry — no TypeScript compile step needed at deploy time.

This build includes a **24/7 keep-alive wrapper** (`keepalive.mjs`) that:

- Starts a tiny Express HTTP server on `process.env.PORT`
- Exposes `GET /ping` → `pong` (used as the Render health check)
- Self-pings `RENDER_URL/ping` every 10 minutes so the Render free instance never sleeps
- Spawns the bot, and **auto-restarts it after 3 seconds** if the WhatsApp connection drops or the bot crashes

## Quick start (local)

```bash
cp .env.example .env       # then edit MONGO_URI, BOT_OWNER_LID, etc.
npm install
npm start
```

On the first run the console will print a *Pairing Code* — open WhatsApp on
your phone, go to **Settings → Linked Devices → Link a device → Link with
phone number**, and enter the code.

---

## Deploy to Render (free tier, 24/7)

> Render does not accept ZIP uploads directly. You push your code to GitHub
> first, then point Render at the repo. It takes ~5 minutes total.

### Step 1 — Get the code into a GitHub repo

1. **Unzip** `shadow-garden-bot.zip` on your computer.
2. Go to <https://github.com/new>, create a new **empty** repo (e.g.
   `shadow-garden-bot`). Don't add a README, .gitignore, or license — leave
   the repo completely empty.
3. The easiest way to push the files (no Git command line needed):
   - Click **"uploading an existing file"** on the empty repo page.
   - Drag the **contents** of the unzipped folder (NOT the folder itself) into
     the upload area: `dist/`, `data/`, `keepalive.mjs`, `package.json`,
     `render.yaml`, `Procfile`, `.env.example`, `.gitignore`, `README.md`.
   - Click **Commit changes**.

### Step 2 — Create a Render Web Service

1. Go to <https://dashboard.render.com> and sign in.
2. Click **New +** → **Web Service**.
3. Connect your GitHub account, then pick the repo you just created.
4. Render auto-detects `render.yaml` and pre-fills almost everything. Confirm:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/ping`
   - **Plan**: `Free`
5. Click **Create Web Service** and wait for the first build (~2-4 min).

### Step 3 — Add your secrets

In the Render dashboard, open the service → **Environment** tab → add:

| Key             | Value                                                               |
|-----------------|---------------------------------------------------------------------|
| `MONGO_URI`     | Your MongoDB Atlas connection string                                |
| `BOT_OWNER_LID` | Your WhatsApp LID, e.g. `1234567890@lid`                            |
| `RENDER_URL`    | Leave **blank for now** — fill in step 4                            |

`SESSION_SECRET` is auto-generated. `PREFIX`, `PORT`, `NODE_ENV` are already set.

### Step 4 — Wire up the self-ping URL

1. After the first deploy finishes, Render shows your live URL at the top of the
   service page (e.g. `https://shadow-garden-bot.onrender.com`).
2. Copy it.
3. Go to **Environment** → set `RENDER_URL` to that URL → **Save Changes**.
   Render auto-redeploys.
4. Verify in the **Logs** tab — every 10 minutes you should see:
   ```
   [keepalive] self-ping https://shadow-garden-bot.onrender.com/ping -> 200
   ```
5. Open `https://<your-url>/ping` in a browser — you should see `pong`.

### Step 5 — Pair your WhatsApp

1. Open the **Logs** tab on Render.
2. Look for the **Pairing Code** the bot prints on first boot.
3. On your phone: **WhatsApp → Settings → Linked Devices → Link a device →
   Link with phone number** → enter the code.

You're live. The bot will stay online 24/7 thanks to the self-ping, and will
auto-reconnect 3 seconds after any disconnect.

---

## Heroku-style PaaS

The included `Procfile` runs the keep-alive wrapper:

```
web: node --enable-source-maps ./keepalive.mjs
```

## Environment variables

| Variable         | Required | Description                                          |
|------------------|:--------:|------------------------------------------------------|
| `MONGO_URI`      |    ✅    | MongoDB connection string (Atlas works fine)         |
| `SESSION_SECRET` |    ✅    | Long random string for session signing               |
| `BOT_OWNER_LID`  |    ✅    | Your WhatsApp LID, e.g. `1234567890@lid`             |
| `RENDER_URL`     |   ⭐     | Public URL of your Render service (enables self-ping)|
| `PREFIX`         |          | Command prefix (default `.`)                         |
| `PORT`           |          | HTTP port (Render injects this)                      |
| `DATABASE_URL`   |          | Optional Postgres URL. If unset, an in-memory shim is used. |

## What's inside

- `keepalive.mjs` — HTTP server + self-ping + bot supervisor (entry point)
- `dist/` — pre-bundled bot (esbuild output)
- `data/` — bundled images (menu image, frames, etc.)
- `package.json` — only runtime native deps (+ `express`)
- `render.yaml` — one-click Render config
- `Procfile` — Heroku-style start command

## Commands cheat-sheet (highlights)

- `.menu` — main menu (image + registered sub-bots online/offline list)
- `.ci <name> <tier>` — card info (sends image + caption from MongoDB)
- `.upload <tier> <name>|<series>` — upload a card (reply to image, persisted to MongoDB)
- `.uc <tier>` — bulk auto-detect upload (AI vision)
- `.lottery` — enter the global lottery
- `.play <song>` — search YouTube and stream the audio (play-dl, no yt-dlp)
- `.fish` / `.dig` — economy commands with anime thumbnails
- `.regbot <name> <number>` — register a paired sub-bot (owner only)

## Notes

- The keep-alive wrapper runs the bot as a child process. If WhatsApp drops
  the connection and Baileys exits, the wrapper restarts it after 3 seconds.
  The HTTP server keeps responding to `/ping` the whole time, so Render's
  health check never fails.
- The bot uses MongoDB for primary persistence (cards, users, lottery, etc.).
- A small set of legacy game/SQL helpers run on an in-memory Postgres shim so
  that `.lottery`, `.uno`, `.tictactoe`, etc. work even without a real
  Postgres. Set `DATABASE_URL` if you want those to persist across restarts.
- `.play` streams audio via `play-dl` and transcodes to MP3 with the bundled
  `@ffmpeg-installer/ffmpeg` binary — no external `yt-dlp` required.
