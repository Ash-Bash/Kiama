# Theming

This document explains Kiama's theming system: theme JSON format, where themes live, how the UI applies them, and how to add or customize themes.

Key pieces
----------

- Theme files: JSON files placed in `src/client/renderer/src/themes/` (during development) and `dist/client/themes/` in packaged releases.
- Client loader: `ThemeProvider` (`src/client/renderer/src/components/ThemeProvider.tsx`) discovers theme JSON files at runtime, applies CSS custom properties, and exposes a `useTheme()` hook for the UI.
- SCSS/CSS integration: theme colors are written to CSS custom properties (variables) on `:root` so the existing SCSS can reference them.
- Persistence: selected theme, light/dark mode, and font choice are persisted in `localStorage` keys: `selectedTheme`, `themeMode`, and `appFont`.

Theme JSON format
-----------------

Minimal shape (see `src/client/renderer/src/types/theme.ts`):

```json
{
  "name": "Human friendly name",
  "modes": {
    "light": { "colors": { "primary-bg": "#fff", "text-primary": "#000", "accent": "#5865f2" } },
    "dark":  { "colors": { "primary-bg": "#111", "text-primary": "#eee", "accent": "#5865f2" } }
  }
}
```

- `name`: display name shown in the theme selector.
- `modes`: must include `light` and `dark` (each with a `colors` map).
- `colors`: a flat map of color token → CSS color value. Each token becomes a CSS custom property `--<token>` (e.g. `--primary-bg`).

Standard tokens used by the app (examples)
-----------------------------------------

The default theme includes these tokens (your theme should supply equivalents):

- primary-bg, secondary-bg, tertiary-bg
- text-primary, text-secondary
- accent, accent-hover
- border, hover
- scrollbar-track, scrollbar-thumb, scrollbar-thumb-hover
- error, success, warning, idle, offline

Any additional tokens are supported — SCSS can read `--<token>` if the code uses it.

How themes are applied
----------------------

- `ThemeProvider` loads all JSON files from `src/client/renderer/src/themes` during development (and from `dist/client/themes` in a packaged release) on startup.
- When a theme is selected, `ThemeProvider` pushes each color in `theme.modes[mode].colors` to `document.documentElement.style.setProperty('--<key>', value)`.
- Font stacks are applied via `--app-font` (see `FONT_OPTIONS` in `ThemeProvider`).
- The UI reads `useTheme()` to get `availableThemes`, `currentThemeId`, `setThemeById`, `currentMode`, and `setMode`.

Available fonts
---------------

`ThemeProvider` exposes a small set of font options (by default `Inter` and `Space Grotesk`). These are defined in `FONT_OPTIONS` (id, label, CSS stack) and applied via `--app-font`.

Persistence and localStorage
----------------------------

- `selectedTheme`: id of the chosen theme JSON (filename minus `.json`).
- `themeMode`: `light` or `dark`.
- `appFont`: id of the selected font option.

If preferences exist in localStorage on startup, `ThemeProvider` loads them and applies the saved theme/mode/font.

Adding a new theme
------------------

1. Create a new JSON file matching the Theme format. Name the file `<id>.json` (e.g. `my-theme.json`).
2. Provide a `name` and both `light`/`dark` color maps.
3. Add the file to `src/client/renderer/src/themes/` in development or to `dist/client/themes/` in a packaged distribution.
4. Rebuild (`npm run build`) so the theme is included in `dist`.
5. Start the app — the theme will appear in the selector (id = filename without `.json`).

Example minimal theme (`src/client/renderer/src/themes/simple.json`)

```json
{
  "name": "Simple",
  "modes": {
    "light": { "colors": { "primary-bg": "#ffffff", "text-primary": "#111", "accent": "#0077cc" } },
    "dark":  { "colors": { "primary-bg": "#0b0c0d", "text-primary": "#eee", "accent": "#0077cc" } }
  }
}
```

Tips for authors
----------------

- Prefer semantic token names (like `primary-bg`, `text-primary`) instead of design-specific colors so themes remain flexible.
- Test both `light` and `dark` modes; `ThemeProvider` will switch modes while preserving the same theme id.
- Use hex or CSS color functions (e.g. `rgba()`, `hsl()`); SCSS consumes the resulting CSS variables.

Developer references
--------------------

- Loader & runtime: `src/client/renderer/src/components/ThemeProvider.tsx`.
- Theme shape: `src/client/renderer/src/types/theme.ts`.
- Example themes (development): `src/client/renderer/src/themes/default.json`, `src/client/renderer/src/themes/light.json`, `src/client/renderer/src/themes/high-contrast.json`, `src/client/renderer/src/themes/colorful.json`, `src/client/renderer/src/themes/luna.json`.

If you'd like, I can:

- Add a sample `src/client/renderer/src/themes/README.md` with token recommendations and a theme template.
- Add a small CLI or script that validates theme JSON files for required tokens.

