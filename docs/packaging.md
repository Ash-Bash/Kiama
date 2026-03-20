**Packaging & Distribution (Kiama)**

This document explains how to build, package, and distribute the Kiama client and where themes, plugins and icons are located for both packaged apps and user-supplied content.

**Build**: From the repository root build the client (compiles main and renderer):

```bash
# compile main and bundle renderer
cd src/client
npm run build
# (optional) copies built themes/plugins/icons into repo dist/binaries
# the client package.json has a postbuild script that runs node scripts/copyToBinaries.js
```

**Package (create platform binaries)**

Unsigned (useful for local testing / skipping mac codesign):

```bash
# from repository root (recommended)
npm run package:unsigned
# or from the client folder
cd src/client && CSC_IDENTITY_AUTO_DISCOVERY=false npm run package
```

Signed (normal packaging/installer creation):

```bash
# from repository root (if configured with signing credentials)
npm run package
# or from the client folder
cd src/client && npm run package
```

Artifacts are written to the repository `dist/binaries` folder. Example final layout:

- dist/client/           -> built app files (packaged into app.asar)
- dist/binaries/         -> packaging artifacts (DMG, ZIP, EXE, AppImage, etc.)
  - themes/
  - plugins/
  - icons/
  - Kiama-*.dmg | Kiama-*.zip | Kiama-*.exe | Kiama-*.AppImage

**Where themes, plugins and icons come from**

- Built-in themes/plugins: included in the packaged app under `dist/client/themes` and `dist/client/plugins` and are bundled into the app.asar. These are produced by the renderer build and copied into the `dist/client` output.

- Third-party / user themes and plugins: the packaged app looks for user-supplied items in common App Data locations. The runtime search order used by the client (main process) is, in order:
  1. Packaged resources (app internal): `<app>/Contents/Resources/app.asar/dist/client/themes` and `.../plugins`
  2. `app.getPath('appData')/Kiama/Themes` and `app.getPath('appData')/Kiama/Plugins`
  3. `app.getPath('userData')/Kiama/Themes` and `app.getPath('userData')/Kiama/Plugins`

At runtime the renderer requests these search paths from the main process using an IPC channel: `kiama-get-paths`. The renderer then loads theme JSON files and plugin JS from these directories; files found later in the search order override earlier ones.

**Icons**

- Source icons live in `assets/icon` in the repository. During the build/postbuild step these icons are copied to `dist/binaries/icons` and electron-builder uses those for platform icons (configured in `src/client/package.json -> build.icon`).

**Scripts of interest**

- `src/client/package.json`:
  - `build`: compiles main and bundles renderer
  - `postbuild`: runs `node scripts/copyToBinaries.js` to assemble `dist/binaries/{themes,plugins,icons}`
  - `package`: runs `electron-builder` (signed packaging if signing credentials are present)

- `src/client/scripts/copyToBinaries.js` — copies built themes, plugins and icons into the repository `dist/binaries` output directory.

**Typical developer workflow**

1. Make changes to renderer/main or add themes/plugins under the client source.
2. From `src/client` run `npm run build` to produce `dist/client`.
3. From repository root run `npm run package:unsigned` to produce local packaging artifacts in `dist/binaries` (or `npm run package` to produce signed artifacts if signing is configured).
4. Check `dist/binaries` for installers and `dist/client` for the bundled app files.

**Adding a built-in theme or plugin**

- Add the theme JSON or plugin JS to the renderer build input (follow existing conventions under `src/client/renderer/...`). After `npm run build` the new files should appear under `dist/client/themes` or `dist/client/plugins` and will be included in the packaged app.

**Troubleshooting**

- If electron-builder complains that `package.json` or `main` is missing in the app.asar, ensure that:
  - You ran the renderer and main build so `dist/client/package.json` and `dist/client/main.js` exist before packaging.
  - `src/client/package.json` `build.files` includes `../../dist/client` so that electron-builder adds `dist/client` into the app.asar.
  - `extraMetadata.main` is set to `dist/client/main.js` to point the packaged app to the main entry.

- Mac code signing: local development machines without a Developer ID will fail signing. Use the unsigned packaging flow to test locally:

```bash
npm run package:unsigned
```

**Notes for CI / release automation**

- CI should run the `build` step, then `package` with proper signing credentials configured for macOS notarization and Windows code signing.
- Ensure the build agent can write to the repository `dist` directory and that `electron-builder` has access to any required native dependency rebuilds.

**Multi-Architecture Builds (arm64, x64, universal)**

- electron-builder supports building for multiple CPU architectures. Use the CLI flags to target specific platforms and architectures.
- Common CLI examples (run from `src/client`):

```bash
# macOS arm64
npm run package -- --mac --arm64

# macOS x64
npm run package -- --mac --x64

# macOS universal (a single universal binary combining x64 + arm64)
npm run package -- --mac --universal

# Windows x64 + ia32
npm run package -- --win --x64 --ia32

# Linux x64 + arm64
npm run package -- --linux --x64 --arm64
```

- From the repository root you can run the unsigned packaging flow to avoid local codesign issues:

```bash
npm run package:unsigned
```

- Notes and caveats:
  - macOS universal builds typically must be produced on macOS hosts. Cross-building universal mac binaries from Linux/Windows is not supported.
  - Code signing and notarization for macOS requires valid Developer ID credentials on the macOS machine performing the build.
  - Windows signed installers typically require a code signing certificate available to the CI agent.
  - Some Windows targets (NSIS) require Wine on non-Windows build agents to build properly.
  - When producing multiple architectures in CI, prefer a matrix job per OS/arch (see example below).

Example GitHub Actions snippet (build unsigned artifacts across platforms and archs):

```yaml
name: Build Kiama
on: [push, pull_request]
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: macos-latest
            cmd: npm run package -- --mac --x64
          - os: macos-latest
            cmd: npm run package -- --mac --arm64
          - os: ubuntu-latest
            cmd: npm run package -- --linux --x64
          - os: ubuntu-latest
            cmd: npm run package -- --linux --arm64
          - os: windows-latest
            cmd: npm run package -- --win --x64
    steps:
      - uses: actions/checkout@v4
      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install deps
        run: npm ci
        working-directory: src/client
      - name: Build
        run: |
          npm run build
          ${{ matrix.cmd }}
        working-directory: src/client
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: kiama-${{ matrix.os }}
          path: dist/binaries
```

If you want, I can add a runnable CI workflow file under `.github/workflows` and/or add `npm` scripts that wrap common arch combos for convenience.

**Developer contact / next steps**

If you want I can:
- Add a short CI job example to `/.github/workflows` for producing unsigned artifacts.
- Add a small verification script that lists files inside the created app.asar for sanity checks.

---

File references:
- Main packaging config: src/client/package.json
- Postbuild copy script: src/client/scripts/copyToBinaries.js
- Main IPC path provider: src/client/main/main.ts
- Renderer theme loader: src/client/renderer/src/components/ThemeProvider.tsx
- Renderer plugin loader: src/client/renderer/src/utils/PluginManager.ts
