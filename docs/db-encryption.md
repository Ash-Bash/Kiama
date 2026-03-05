DB Encryption (Optional)

Summary

This document explains the optional database-at-rest encryption added to the KIAMA server. Owner, role, section and channel data (and other sensitive server metadata) are now stored in the internal SQLite database (`kiama.db`). To protect that sensitive data, you can enable file-level encryption of the DB.

What changed

- Server now persists channels, sections, roles, and owner info into the internal DB (`data/kiama.db`).
- The external `server.config.json` written beside the bundle is intentionally sanitized and no longer contains owner username, owner account ID, or per-user role mappings.
- Optional DB encryption support was added using AES-256-GCM with a PBKDF2-derived key. Encrypted file is written as `data/kiama.db.enc`.
- Admin endpoints allow enabling/disabling DB encryption at runtime.

Files changed / new behavior

- Server implementation: [src/server/src/server.ts](src/server/src/server.ts#L1) — added DB schema for `servers`, `sections`, `channels`; added encrypt/decrypt helpers and admin endpoints to enable/disable encryption.
- DB files: `data/kiama.db` (plain) and `data/kiama.db.enc` (encrypted blob).
- The external config file remains at `data/configs/<serverId>.json` but is sanitized (no owner/userRoles).

How to enable encryption

A) During startup (automatic decryption)

- If an encrypted DB `data/kiama.db.enc` exists and a plaintext `data/kiama.db` is missing, the server will attempt to decrypt using the environment variable `KIAMA_DB_KEY`.
- To start the server and allow automated decryption:

```bash
export KIAMA_DB_KEY="your-strong-passphrase-or-key"
node dist/server/main.js --other-flags
```

B) Enable encryption via admin API (recommended when server is running)

- POST /admin/db/encryption/enable
  - Body: `{ "passphrase": "<passphrase>", "removePlain": true|false }`
  - Example:

```bash
curl -X POST -H "Content-Type: application/json" -H "X-Username: owner" -d '{"passphrase":"s3cr3t","removePlain":false}' https://your-server/admin/db/encryption/enable
```

- This will create `data/kiama.db.enc`. If `removePlain` is true, the plain `kiama.db` will be removed after encrypting.

C) Disable encryption via admin API

- POST /admin/db/encryption/disable
  - Body: `{ "passphrase": "<passphrase>", "removeEnc": true|false }`
  - Example:

```bash
curl -X POST -H "Content-Type: application/json" -H "X-Username: owner" -d '{"passphrase":"s3cr3t","removeEnc":false}' https://your-server/admin/db/encryption/disable
```

- This will decrypt `data/kiama.db.enc` into `data/kiama.db`. If `removeEnc` is true, the encrypted file will be removed after decryption.

Startup with encrypted DB

- If `data/kiama.db.enc` exists and `data/kiama.db` does not, the server will refuse to start unless `KIAMA_DB_KEY` is set (or you first decrypt the file manually using the same algorithm). This prevents accidental startup without the key.

Key management recommendations

- Do NOT store `KIAMA_DB_KEY` in the repository or world-readable files. Prefer one of:
  - OS keyring (macOS Keychain, Windows Credential Manager, or Linux Secret Service)
  - Environment variable injected by a process manager (systemd unit with `EnvironmentFile`, Docker secret, Kubernetes Secret)
  - Manual passphrase entry at startup (not implemented here — consider it for interactive deployments)
- Rotate the passphrase periodically and re-encrypt the DB (disable/enable flow).

Backups & migration

- Backups that include the DB must be protected (encrypt backup files with the same key or different secure key management).
- When migrating from JSON-only servers, the server will load `server.config.json` if the DB is empty and then persist that state into the DB. After migrating, you may enable DB encryption.

Security notes

- The encryption in this implementation uses AES-256-GCM with PBKDF2 (200k iterations). This is reasonable for many deployments but evaluate against organizational security requirements.
- This is a file-level encryption layer implemented by the server process. For stronger protection consider SQLCipher (native SQLite encryption) or filesystem-level encryption.
- Plugin code and other server processes that have access to the running server process or to the decrypted `kiama.db` file can still access data; reduce attack surface by running the server as a dedicated user and restricting permissions.

Support and troubleshooting

- If the server refuses to start because the encrypted DB cannot be decrypted, provide a valid `KIAMA_DB_KEY` or restore a backup plain DB.
- If you lose the passphrase, encrypted data is unrecoverable.

Questions or next steps

If you'd like, I can:
- Add CLI tooling for interactive passphrase input at startup.
- Integrate SQLCipher instead of the custom file-layer encryption.
- Add example systemd unit and Dockerfile snippets showing secure secret injection.


