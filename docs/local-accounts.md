# Local Accounts (client-side)

This document describes how Kiama's local account system works (client-side accounts stored on the user's machine).

Overview
--------

- Local accounts are stored and managed by the client application only — they are never transmitted to or stored on remote servers.
- Local accounts hold your username, password-derived authentication, profile picture, and the local server list.
- Stored account files are encrypted on disk with AES-256-CBC; the encryption key is derived from your password using `scrypt`.

Where accounts live
-------------------

- Default path: the shared AccountManager stores accounts in `~/.kiama/accounts` (the app uses `sharedAccountManager`).
- Each account is a single encrypted file: `{accountsDir}/{username}.json.enc`.
- Media (avatars, server icons exported to the account) are stored in `{accountsDir}/media/` alongside the encrypted files.

File format & encryption
------------------------

- Encryption algorithm: AES-256-CBC.
- Key derivation: `scrypt(password, salt, 32)` where `salt` is a 16-byte random value.
- File content (new format): `{saltHex}:{ivHex}:{cipherHex}` — the salt is embedded in the file so a password is sufficient to derive the key even without OS keychain data.
- Legacy/alternate format: older files may omit the embedded salt and rely on the OS keychain entry (Keytar) to store the salt+key.
- The client caches the derived key in memory for the session so users don't need to re-enter their password repeatedly.

Key storage & OS keychain
-------------------------

- When available, the app stores the derived key (and salt) in the OS keychain via `keytar` under service `KiamaApp` and key `key:<username>`. This is optional — the embedded salt ensures files remain unlockable without keychain access.
- If `keytar` is unavailable, the salt embedded in the file is used during login to derive the key from the password.

Password hashing
----------------

- The account JSON contains a `passwordHash` field used for local password verification. The client derives `passwordHash` via PBKDF2:
  - `crypto.pbkdf2(password, 'kiama-salt', 100000, 32, 'sha256')`
- Note: the hash is stored as hex and is used to verify passwords locally — the password itself is never stored in plain text.

Login / unlock flow
-------------------

1. The user provides `username` and `password`.
2. The client reads `{username}.json.enc`, extracts the embedded salt (if present), derives the AES key via `scrypt`, decrypts the file, and returns the `LocalAccount` object on success.
3. If `keytar` holds a cached key for the account, the client may use that instead for faster unlock.
4. On successful login the derived key is cached in memory for the session.

Account operations
------------------

- Create: `createAccount({ username, password })` derives a key+salt, creates the `LocalAccount` JSON, encrypts and writes `{username}.json.enc`, and sets restrictive file perms (mode `600` where supported).
- Load: `loadAccount(username)` loads a previously unlocked account (requires the key in memory or keychain).
- Save: `saveAccount(account)` re-encrypts and persists the account (preserves the embedded salt).
- Delete: `deleteAccount(username)` removes the `.json.enc` file, clears the memory cache, and removes keychain entries if present.
- List: `listAccounts()` lists stored account usernames by enumerating `*.json.enc` files.
- Rotate key: `rotateKey(username, oldPassword, newPassword)` re-encrypts the account under a new password-derived key (useful when changing password).
- Export/Import: `exportToZip(username)` exports a plain JSON account + media into a ZIP; `importFromZip(zipBuffer, newPassword)` imports and re-encrypts the account with a new password.

Profile pictures & media
------------------------

- Profile pictures are saved to `{accountsDir}/media/avatar-{username}.{ext}`. The account JSON stores the filename in `profilePic`.
- Saving a profile picture updates the encrypted account file so the change is persisted.

Security considerations & recommendations
---------------------------------------

- Local accounts are intended for single-machine use. Since account files are encrypted with a password-derived key, choose a strong password.
- The app stores a derived key in the OS keychain when available — protect your OS account/keychain with a secure login.
- Keep backups of exported ZIPs in a safe place (exports are plain JSON; treat them like passwords).
- If you lose your password and do not have exports or keychain access, the encrypted file cannot be recovered.

Server-side accounts (bot accounts)
-----------------------------------

- Regular local accounts never leave the client.
- The server stores only bot accounts (managed by `BotAccountManager`). Bot accounts are similar in that they are written to `{dataRoot}/accounts/{username}.json.enc` and encrypted with AES-256-CBC, but their encryption key is derived from `KIAMA_ACCOUNT_SECRET` (server environment) rather than a user password.

Notes for developers
--------------------

- Client code: see `src/client/renderer/src/utils/AccountManager.ts` and `src/client/renderer/src/utils/sharedAccountManager.ts` (default path is `path.join(os.homedir(), '.kiama', 'accounts')`).
- Types: `src/client/renderer/src/types/account.ts` defines `LocalAccount` and `BotAccount` shapes.
- Server bot account code: `src/server/src/utils/BotAccountManager.ts`.

If you'd like, I can:

- Add short usage examples to `docs/local-accounts.md` (create, login, export/import) showing the API calls used in the client code.
- Add a small diagram of file formats and the keychain fallback.

