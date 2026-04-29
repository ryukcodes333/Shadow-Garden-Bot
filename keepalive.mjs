// keepalive.mjs
// Wrapper that keeps the Shadow Garden bot online 24/7 on Render's free tier.
//
// Responsibilities:
//   1. Spin up a small Express HTTP server on process.env.PORT
//      with GET /ping -> "pong" (used by the self-ping + Render health check).
//   2. Self-ping RENDER_URL/ping every 10 minutes so Render's free instance
//      never spins down due to inactivity.
//   3. Spawn the actual bot (dist/index.mjs) as a child process.
//      If the bot exits or crashes (e.g. WhatsApp connection drops and Baileys
//      tears down the process) we wait 3 seconds and restart it automatically.

import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 10000;
const RENDER_URL = (process.env.RENDER_URL || "").replace(/\/+$/, "");
const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RECONNECT_DELAY_MS = 3 * 1000;     // 3 seconds

// ---------------------------------------------------------------------------
// 1) Tiny HTTP server
// ---------------------------------------------------------------------------
const app = express();

app.get("/ping", (_req, res) => res.type("text/plain").send("pong"));
app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));
app.get("/", (_req, res) =>
  res.type("text/plain").send("Shadow Garden bot is alive."),
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[keepalive] HTTP server listening on :${PORT}`);
  console.log(`[keepalive] RENDER_URL = ${RENDER_URL || "(not set, self-ping disabled)"}`);
});

// ---------------------------------------------------------------------------
// 2) Self-ping every 10 minutes
// ---------------------------------------------------------------------------
async function selfPing() {
  if (!RENDER_URL) return;
  const url = `${RENDER_URL}/ping`;
  try {
    const res = await fetch(url, { method: "GET" });
    console.log(`[keepalive] self-ping ${url} -> ${res.status}`);
  } catch (err) {
    console.warn(`[keepalive] self-ping failed: ${err?.message || err}`);
  }
}

setInterval(selfPing, PING_INTERVAL_MS);
// Fire once shortly after boot so we know it works.
setTimeout(selfPing, 30 * 1000);

// ---------------------------------------------------------------------------
// 3) Spawn the bot + auto-reconnect on exit
// ---------------------------------------------------------------------------
const BOT_ENTRY = path.join(__dirname, "dist", "index.mjs");

let shuttingDown = false;
let child = null;

function startBot() {
  console.log(`[keepalive] starting bot: ${BOT_ENTRY}`);
  child = spawn(
    process.execPath,
    ["--enable-source-maps", BOT_ENTRY],
    {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    },
  );

  child.on("exit", (code, signal) => {
    console.log(
      `[keepalive] bot exited (code=${code}, signal=${signal})`,
    );
    if (shuttingDown) return;
    console.log(
      `[keepalive] reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`,
    );
    setTimeout(startBot, RECONNECT_DELAY_MS);
  });

  child.on("error", (err) => {
    console.error(`[keepalive] failed to spawn bot: ${err?.message || err}`);
  });
}

function stop(signal) {
  shuttingDown = true;
  console.log(`[keepalive] received ${signal}, shutting down...`);
  if (child && !child.killed) {
    child.kill(signal);
  }
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

startBot();
