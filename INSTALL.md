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
