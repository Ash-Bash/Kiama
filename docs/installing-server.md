# Installing the Kiama server

This document explains how the `./install` script works and how to use it from both the repository (dev) and a packaged distribution (`dist/server`).

Summary
-------

- `npm run build` copies a ready-to-run `install` script and a `kiama-server` wrapper into `dist/server` alongside the bundled `kiama-server-<version>.js`.
- From `dist/server` on the target machine you can run the included installer to register the CLI and install production deps.

Dev mode (from the repo)
------------------------

From the repository root you typically run the installer in dev mode:

```bash
# make the installer executable (one-time)
chmod +x ./install

# run the installer (dev mode)
./install
```

This flow will:

- run `npm install` in the server package
- run `npm run build` to create the distributable bundle under `dist/server`
- create a small `kiama-server` wrapper in `src/server` that points at the bundle
- create a minimal `package.json` inside `dist/server` and install production deps there
- run `npm link` so `kiama-server` is available on your user PATH

Distribution mode (from `dist/server`)
-------------------------------------

When you run `npm run build`, the build output includes an `install` script and a `kiama-server` wrapper inside `dist/server`. To deploy the server on another machine, copy the entire `dist/server` folder and run the installer from that folder.

Example (on the target machine):

```bash
# from the dist/server folder you copied to the machine
sudo bash ./install
```

- `sudo` may be required on some systems so `npm link` can create global symlinks (or to write into global locations). The installer will make the `kiama-server` wrapper executable and register the CLI globally.
- After the installer completes you can run `kiama-server --help` to verify the CLI is available.

What the distribution installer does
-----------------------------------

- Ensures a minimal `package.json` exists (creates one if necessary) so `npm link` can register the `kiama-server` bin.
- Writes a small executable wrapper `kiama-server` that invokes the bundled `kiama-server-<version>.js`.
- Attempts to install production dependencies into the distribution folder so native modules (e.g. `better-sqlite3`) are available.
- Runs `npm link` to register the package's `bin` globally; it also attempts to ensure the global `kiama-server` symlink points at the wrapper.
- Writes a `.kiama-install-stamp` file that records `version:`, `date:`, and `path:` so subsequent runs can detect version changes and only rebuild when necessary.

Troubleshooting & notes
-----------------------

- If `kiama-server` is not found after running the installer, run `npm bin -g` and ensure that path is on your `PATH`.
- If native modules fail to install, ensure build tools are present (macOS: `xcode-select --install`) and run:

```bash
npm --prefix "<dist-server-path>" install --omit=dev --no-audit --no-fund
```

- If you prefer not to use `npm link`, you can install the package globally from the distribution folder with:

```bash
npm install -g .
```

- Check the `.kiama-install-stamp` file in the same folder as the `install` script to confirm which version/path was linked.

Files you should see in `dist/server`
-------------------------------------

- `install` (the installer script)
- `kiama-server` (an executable wrapper)
- `kiama-server-<version>.js` (the bundled server)
- `package.json` / `package-lock.json` (may be present)
- `node_modules/` (production dependencies if installed)

If you'd like, I can:

- Update the main `INSTALL.md` to include a short pointer to this document and the `dist` usage example.
- Or replace `INSTALL.md` content directly with this material.

