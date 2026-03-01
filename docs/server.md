# Server — Architecture and Commands

This document explains how the KIAMA server is structured, where important data/config lives, how ownership and admin tokens work, and documents the CLI commands provided by `kiama-server`.

Overview
--------

- Entrypoint: `src/server/src/index.ts` — CLI (Commander.js) that starts the runtime or invokes management actions.
- Core runtime: `src/server/src/server.ts` — `Server` class that loads config, data, plugins, starts HTTP/WebSocket listeners, and exposes management endpoints.
- Packaged bundle: `dist/server/kiama-server-<version>.js` and an executable wrapper `kiama-server` (used by the `install` script to register the CLI).

Data layout and important files
------------------------------

- `data/` (server data root): stores runtime data, user data, plugin data, and `secrets/`.
- `data/secrets/admin.token` — generated admin token (mode 0o600) if `--token`/`KIAMA_ADMIN_TOKEN` not provided.
- `data/accounts/` — server-side bot account files: `{username}.json.enc` encrypted via `BotAccountManager`.
- `server.config.json` — initial server configuration (if provided) or the file produced by `kiama-server init-config`.

Security & secrets
------------------

- Admin token:
  - Provide via `--token <token>` flag when starting the server or set the `KIAMA_ADMIN_TOKEN` environment variable.
  - If not provided, the server generates a random token and writes it to `data/secrets/admin.token` (file permission 600).
  - The CLI and admin endpoints require the admin token (CLI uses `--token` or `KIAMA_ADMIN_TOKEN`; admin endpoints require `x-admin-token` header).

- Bot accounts and server account encryption:
  - Server-side bot accounts are encrypted via AES-256-CBC and the key is derived from `process.env.KIAMA_ACCOUNT_SECRET` (scrypt).
  - Set `KIAMA_ACCOUNT_SECRET` in production to a strong secret.

Ownership
---------

- The server exposes `ownerUsername` and `allowClaimOwnership` via its public `/info` endpoint.
- If no owner exists and `allowClaimOwnership` is `true`, clients may prompt the first user to claim ownership by POSTing to `/server/claim-owner` (optionally providing an admin token if the server is configured to require one).
- When ownership is claimed, the server assigns the `owner` role and persists the setting to disk.

Runtime behavior
----------------

- `Server` constructs with: `new Server(port, visibility, dataRoot, adminToken, initialConfig, configPath)`
- On `start()`, it initializes storage, loads plugins, binds HTTP endpoints and WebSocket, and starts listening on the configured port.
- Management endpoints are guarded by a middleware that checks the `x-admin-token` header against the configured/admin token.

CLI reference (`kiama-server`)
------------------------------

The CLI is implemented in `src/server/src/index.ts` using Commander.js. Below are the available commands and options with examples.

1) `kiama-server start`

- Description: Start the server runtime.
- Options:
  - `-p, --port <port>`: Port to listen on (default `3000`).
  - `--public` / `--private`: Mark server visibility.
  - `--token <token>`: Admin token (falls back to `KIAMA_ADMIN_TOKEN`).
  - `--config <path>`: Path to an initial server config JSON.
  - `--force`: Start without an initial config (not recommended).
  - `--owner <username>`: Set the owner username at startup.
- Behavior:
  - If `--config` not provided, the CLI will look for `*.config.json` in CWD.
  - If no config and `--force` not set, `start` will exit with instructions to run `init-config`.
- Examples:
  - `kiama-server start --config server.config.json --token s3cr3t --owner alice`
  - `KIAMA_ADMIN_TOKEN=s3cr3t kiama-server start --config server.config.json --owner alice`

2) `kiama-server stats`

- Description: Query the running server's `/system/stats` endpoint and pretty-print results.
- Options: `-p, --port`, `-H, --host` (default `http://localhost`).
- Example: `kiama-server stats -H http://localhost -p 3000`

3) `kiama-server notify`

- Description: Send a broadcast notification to connected clients.
- Required option: `-m, --message <message>`
- Options: `--type <type>` (default `maintenance`), `-c, --channel <channel...>` (target channel IDs), `-p, -H` host/port, `-t, --token <token>`.
- Example: `kiama-server notify -m "Server maintenance in 5 minutes" --type maintenance -t s3cr3t`

4) `kiama-server stop`

- Description: Gracefully request the running server to stop via the management API.
- Options: `-m, --message <message>`, host/port, `-t, --token`.
- Example: `kiama-server stop -m "Shutting down for updates" -t s3cr3t`

5) `kiama-server restart`

- Description: Request the server to perform a graceful restart (requires a process manager to actually relaunch the process).
- Options: `-m, --message`, `-d, --delay <ms>` (default `1000`), host/port, `-t, --token`.
- Example: `kiama-server restart -m "Restarting" -d 2000 -t s3cr3t`

6) `kiama-server init-config`

- Description: Scaffold an initial server configuration JSON with example `sections`, `channels`, and `roles`.
- Options: `-n, --name <name>` (default `KIAMA Server`), `-o, --output <path>` (default `server.config.json`).
- Example: `kiama-server init-config --name "My Server" --output server.config.json`

7) `kiama-server plugins install <url>`

- Description: Instruct the running server to download and load a plugin from a URL (POSTs to `/admin/plugins/install`).
- Options: host/port and `-t, --token`.
- Example: `kiama-server plugins install https://example.com/plugins/my-plugin.js -t s3cr3t`

8) `kiama-server plugins reload`

- Description: Ask the server to reload plugins from disk (`/admin/plugins/reload`).
- Example: `kiama-server plugins reload -t s3cr3t`

9) `kiama-server whitelist add <user>` and `kiama-server blacklist add <user>`

- Description: Basic management stubs for maintaining simple allow/deny lists.
- These are currently simple CLI stubs that log actions; they are intended as extension points for server-side whitelist/blacklist management.

Admin token behavior and management API
---------------------------------------

- The CLI helper functions use `resolveAdminToken()` which prefers `--token` then `process.env.KIAMA_ADMIN_TOKEN`.
- Management endpoints expect the `x-admin-token` header.
- Key admin management endpoints used by the CLI include:
  - `POST /admin/notify`
  - `POST /admin/shutdown`
  - `POST /admin/restart`
  - `POST /admin/plugins/install`
  - `POST /admin/plugins/reload`

Server configuration shape
--------------------------

- See `src/server/src/index.ts` for the `InitialServerConfig` template used by `init-config` — it includes `name`, `sections`, `channels`, and `roles` with example permissions.

Extending and running in production
-----------------------------------

- Build and packaging produce `dist/server` with a bundled server file and `install` helper. To install on a server machine, copy `dist/server`, then run `sudo bash ./install` which will create a global `kiama-server` wrapper via `npm link`.
- Ensure `KIAMA_ADMIN_TOKEN` and `KIAMA_ACCOUNT_SECRET` are set in your environment for secure deployments.
- Use a process manager (systemd, PM2, Docker, etc.) to run `kiama-server start` in production, so `restart` requests can be honored by a supervisor.

References
----------

- CLI entrypoint: `src/server/src/index.ts`
- Server runtime: `src/server/src/server.ts`
- Bot accounts: `src/server/src/utils/BotAccountManager.ts`
- Install script / packaging: `install` and `dist/server/install`

