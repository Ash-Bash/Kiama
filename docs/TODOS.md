# TODOs — Client, Server & Plugin APIs

This document lists planned work items grouped by area. Each item should be tracked in the project board and prioritized per release.

## Server TODO

- Configure server port number: allow runtime config and persisted default (CLI flag, env var, and config file).
- Allow custom server data location: support a `--data-root`/`KIAMA_DATA_ROOT` option to point to an external data directory.
- Message/media auto-deletion ("spring cleaning"): implement configurable retention rules to delete old messages and media.
- Fully integrate backup functionality: connect UI/server backup triggers, scheduled backups, and restore flows.
 - [x] Detect duplicate usernames & nicknames: detect same display names and provide a per-server nickname system (like Discord) to allow unique identification.

## Client TODO

- Add a Plugin Browser page: UI to discover, inspect, and request plugin installs for servers/clients.
- Add a Plugin Manager inside Server Settings Page: manage installed plugins, enable/disable, configure, and update.
- Improve the Backup subpage in Server Settings: show backup status, manual backup/restore, and scheduled backup settings.
- Display media inline in messages: render images and playable videos inside the message list when users post media.

## Plugin API TODO

- Finalize Server & Client Plugin APIs: finalize lifecycle hooks, permissions, sandboxing, and data access boundaries.
- Implement a Plugin Manifest system: define metadata (name, id, version, author, compat, entry points, required permissions).
- Implement a Client Plugin Loader: safe client-side loader that validates manifests, enforces sandboxing, and handles hot-reload.
- Improve Server Plugin Loader: robust server-side loader with validation, dependency isolation, and safe reload/unload semantics.
- Plugin Versioning system: support version ranges, compatibility checks, and upgrade paths in manifest and loaders.

## Notes

- Each TODO should be scoped into one or more issues with acceptance criteria and a small implementation plan.
- Security: plugin loading and backups touch sensitive areas — prioritize permission models and auditing.
- UX: for nickname/duplicate-name handling, add clear UI affordances for setting per-server display names.
