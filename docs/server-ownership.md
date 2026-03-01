# Server Ownership

This document explains how server ownership works in Kiama: how an owner is set, how ownership can be claimed or transferred, and how the admin token ties into ownership and administrative endpoints.

Key concepts
------------

- `ownerUsername`: a single username recorded on the server that denotes the Server Owner. Owners are assigned the highest-privilege role (owner/admin role) and bypass permission checks where appropriate.
- `allowClaimOwnership` (config): whether clients should offer the "Claim Ownership" flow when no owner is set. Defaults to `true`.
- Admin token: a secret token used to protect management endpoints and to control ownership transfers when already configured.

How an owner is set
-------------------

1. Initial config: you may set an initial owner via the server configuration (e.g., `server.config.json`) using the `ownerUsername` field, or by starting the server with the `--owner <username>` flag. When provided at startup the specified user is granted the admin/owner role immediately.

2. Claiming ownership (first-time setup): when no owner is set the client UI will prompt the first connecting user to "Claim Ownership" (when `allowClaimOwnership` is true). The client sends a POST to `/server/claim-owner` with a `username` and optional `token`.

3. Transferring ownership: if an owner already exists and an admin token is configured, ownership can only be changed by providing the admin token (see below). If the admin token is not configured, a client may claim ownership without supplying a token.

Claim / Transfer endpoint
-------------------------

- Endpoint: POST /server/claim-owner
- Body: `{ "username": "alice", "token": "<admin-token-optional>" }`
- Behavior:
  - Validates `username` is provided.
  - If the server has an admin token configured, the request must include the correct token either as `X-Admin-Token` header or `body.token` — otherwise the request is rejected with 401 and `requiresToken: true`.
  - If token validation succeeds (or no admin token is configured), the server sets `ownerUsername = username`, assigns that username the admin role, emits `member_role_updated`, persists the config, and returns `{ success: true, ownerUsername }`.

Admin token and protection of admin endpoints
---------------------------------------------

- The admin token may be provided via:
  - `--token <token>` when starting the server
  - `KIAMA_ADMIN_TOKEN` environment variable
  - If neither is provided, the server will auto-generate a token on first run and write it to `data/secrets/admin.token` (file mode 600). Keep this token safe — it grants administrative capabilities.

- Administrative HTTP endpoints (e.g., `/admin/*`) are protected by `requireAdmin`, which checks the `X-Admin-Token` header or a supplied token in the CLI call. If no admin token is configured, `requireAdmin` returns 403 for admin routes.

- Typical CLI usage for starting with explicit owner/token:

```bash
# start the server with an admin token and initial owner
kiama-server start --config server.config.json --token <admin-token> --owner alice

# or pass env var
KIAMA_ADMIN_TOKEN=<admin-token> kiama-server start --config server.config.json --owner alice
```

Where the admin token is stored
------------------------------

- If you don't pass `--token` or `KIAMA_ADMIN_TOKEN`, the server generates a token and writes it to `data/secrets/admin.token` with restrictive permissions (mode 600). The `install` / build process may copy `data/` into `dist/server` depending on packaging — verify the token file location on deployed hosts.

Client behavior
---------------

- The client fetches `/info` to learn `ownerUsername` and `allowClaimOwnership`.
- If `ownerUsername` is empty and `allowClaimOwnership` is `true`, the client may prompt the user to claim ownership and optionally request an admin token if the server requires one.
- The UI provides a server settings "Ownership" tab for owners and for transferring ownership (requires admin token when configured).

Role effects and UI
-------------------

- The canonical owner role (`owner` or a role whose name equals `owner`) is created with full permissions by default. `findAdminRoleId()` chooses the role treated as admin/owner (prefers `owner` or `admin` ids/names).
- Assigning `ownerUsername` also writes the mapping `userRoles[ownerUsername] = <adminRoleId>` so the owner gains full permissions.
- The UI treats the owner specially (owner badge, inability to restrict the owner role from losing permissions, etc.).

Operational recommendations
---------------------------

- When deploying on a server, supply an admin token explicitly via `--token` or `KIAMA_ADMIN_TOKEN` and record it in your secrets manager. This prevents an unintended user from claiming ownership during first connections.
- Keep the generated `data/secrets/admin.token` file secure (mode 600). If you lose the token, you can recover ownership by editing `server.config.json` to set `ownerUsername` (and restart), or by starting the server with `--owner` plus a new token.
- Use `POST /server/claim-owner` only over trusted networks or through authenticated clients that you control.

Examples
--------

1) Initial setup without a preconfigured token (first-run automatic token):

- Start server without `--token`. The server prints where it generated the token (e.g. `data/secrets/admin.token`).
- From the UI, the first user can claim ownership (the server will require the token if one was generated).

2) Deploy with a known owner and token (recommended):

```bash
kiama-server start --config server.config.json --token s3cr3tadmintok --owner alice
```

This sets `alice` as owner and protects ownership transfers by the provided admin token.

If you want, I can also:

- Add short examples to `docs/installing-server.md` referencing the admin token location.
- Add a brief section in the `Server settings -> Ownership` UI docs linking to this file.

