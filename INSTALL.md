Installation and CLI linking
=============================

This project includes a simple installer script at `./install` that:

- Builds the server in `src/server`.
- Runs `npm link` in `src/server` to expose the `kiama-server` CLI globally for your user.
- Writes a stamp file `.kiama-install-stamp` which records the installed server version and path.

How it behaves
--------------

- First run: `./install` will `npm install` dependencies, `npm run build`, then `npm link`.
- Subsequent runs: the script checks the version in `src/server/package.json`. If it matches the previously installed version, the script will simply re-run `npm link` to ensure the CLI is available. If the version differs, it rebuilds and relinks.

Usage
-----

From the repository root (macOS/Linux):

```bash
# make executable once
chmod +x ./install

./install
```

After successfully running, test the CLI:

```bash
kiama-server --help
```

Notes
-----

- If your global npm bin directory isn't on your `PATH`, you can run `npm bin -g` and add that directory to your `PATH` (e.g., by adding an export to `~/.zshrc`).
- The script uses `npm link` by default which is development-friendly. In production you may prefer `npm install -g .`.
- The installer updates automatically when `src/server/package.json`'s `version` changes; re-running `./install` will rebuild and relink.

Documenting updates
--------------------

When releasing a new server version, update `src/server/package.json`'s `version`. This installer will detect the change and rebuild/relink on next run.

Configuring server port
-----------------------

- **Default:** If no port is provided the server listens on `3000`.
- **During initial config:** Use `kiama-server init-config --port <port>` to generate a `server.config.json` that includes the desired port. The generated file will contain a `port` field the server will read when started with `--config`.

	Example:

	```bash
	kiama-server init-config --port 8080 --output server.config.json
	```

- **When starting the server:** You may provide `--port` to `kiama-server start` to override any configured port:

	```bash
	kiama-server start --port 8080 --config server.config.json
	```

- **After startup (persisted change):** An admin can change the configured port via the management API. This updates the persisted config so the new port is used on next start, but the server must be restarted to bind the new port.

	Example (replace `<token>` and `host:port` as appropriate):

	```bash
	curl -X POST -H "x-admin-token: <token>" -H "Content-Type: application/json" \
		-d '{"port":8080}' http://localhost:3000/admin/config
	```

- **Notes:**
	- The port value is validated (1–65535). The API call persists the value to the server's config file but does not automatically restart the process.
	- If you manage the server with a process supervisor (systemd, Docker, PM2, etc.), restart the service after changing the port.
