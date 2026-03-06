# KIAMA Development Guide

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Initial Setup
```bash
git clone <repository-url>
cd Kiama
npm run install:all
npm run build
```

### Development Workflow
```bash
# Terminal 1: Server development
npm run dev:server

# Terminal 2: Client development
npm run dev:client
```

## Project Structure Deep Dive

### Client Architecture

The client uses Electron's dual-process architecture:

**Main Process** (`src/client/main/main.ts`)
- Controls application lifecycle
- Manages windows and system integration
- Runs Node.js environment

**Renderer Process** (`src/client/renderer/`)
- React application
- Runs in Chromium browser context
- Communicates with main process via IPC

### Server Architecture

**Core Server** (`src/server/src/server.ts`)
- Express.js web server
- Socket.IO real-time communication
- Plugin system integration

**CLI Interface** (`src/server/src/index.ts`)
- Commander.js for CLI parsing
- Server lifecycle management
- Configuration handling

**Data & Admin Token Handling**
- Data root defaults to `dist/server/data` (or `src/server/data` when running from source); override with `KIAMA_DATA_DIR`.
- Layout created on startup: `configs/`, `plugins/`, `uploads/`, `logs/`, `secrets/`, `media/` under the data root.
- Persisted config lives at `<data-root>/configs/<serverId>.json` (override with `KIAMA_CONFIG_PATH`) and stores sections/channels/roles, a hashed admin token, and `ownerUsername`.
- Admin token: set `KIAMA_ADMIN_TOKEN` to supply your own; otherwise the server generates one, writes it to `<data-root>/secrets/admin.token` with mode 600, and uses it for admin endpoints and CLI commands.
- Server icon: uploaded to `<data-root>/server-icon.{ext}` via `POST /server/icon`; served publicly at `GET /server/icon`.
- `ownerUsername`: stored as a plain string in the config; set via `--owner <username>` CLI flag or `POST /server/claim-owner`.

**Backup System** (`src/server/src/utils/BackupManager.ts`)
- Manages automated and manual backups of all server data.
- Backups are stored in `<data-root>/Backups/` and are excluded from subsequent backup archives (no recursive backup-of-backups).
- Backup schedule config is persisted to `<data-root>/backup-config.json`.
- See [Backup System](#backup-system) section for full API details.

## Account System

### Overview

Kiama uses a **local-account-only** model in Phase 1. There are no centralised user accounts. Each account is an AES-256-CBC encrypted JSON file stored in `~/.kiama/accounts/` on the user's machine.

Phase 2 (future) will add cloud accounts and opt-in local→cloud transfer.

### File format

Each account is written as:
```
{saltHex}:{ivHex}:{cipherHex}
```

The scrypt salt is embedded in the file header so the correct decryption key can always be re-derived from the user's password alone — no keychain dependency for login.

### Client: `AccountManager` (`src/client/renderer/src/utils/AccountManager.ts`)

Handles all local account operations in the renderer process.

```typescript
import { AccountManager } from './utils/AccountManager';
import * as os from 'os';
import * as path from 'path';

const accountManager = new AccountManager(
  path.join(os.homedir(), '.kiama', 'accounts')
);

// Create a new account
const account = await accountManager.createAccount({ username: 'alice', password: 'secret' });

// Log in
const result = await accountManager.login('alice', 'secret');
if (result.success) { /* result.account is LocalAccount */ }

// List saved accounts (for the account-switcher chip list)
const names = accountManager.listAccounts(); // string[]

// Export to ZIP (plain JSON inside — user chose to export)
const zip: Buffer = await accountManager.exportToZip('alice');

// Import from ZIP with a new password
const imported = await accountManager.importFromZip(zipBuffer, 'newSecret');

// Rotate encryption key
await accountManager.rotateKey('alice', 'oldSecret', 'newSecret');

// Delete
accountManager.deleteAccount('alice');
```

**Key derivation**: `crypto.scryptSync(password, salt, 32)` with `{ N: 16384, r: 8, p: 1 }`.  
**Keychain**: `keytar` stores `{saltHex}:{keyHex}` as an optional session-resume cache. If unavailable, login still works because the salt is read from the file.

### Account types (`src/client/renderer/src/types/account.ts`)

```typescript
interface LocalAccount {
  id: string;
  username: string;
  passwordHash: string;      // PBKDF2-SHA256, 100k iterations
  profilePic?: string;       // filename relative to ~/.kiama/accounts/media/
  credentials: Record<string, unknown>;
  serverList: ServerList;    // { servers: ServerEntry[], folders: ServerFolder[] }
  isBot: false;
  isServerCreated: false;
  createdAt: string;
  updatedAt: string;
}

interface BotAccount {
  id: string;
  username: string;
  passwordHash: string;
  botType: 'chat' | 'moderator' | 'custom';
  isBot: true;
  isServerCreated: true;     // Bot accounts can never be transferred to cloud
  linkedPlugin?: string;
  preconfig?: Record<string, unknown>;
  serverList: ServerList;
  createdAt: string;
  updatedAt: string;
}
```

### Server: `BotAccountManager` (`src/server/src/utils/BotAccountManager.ts`)

Stores **only** bot/owner accounts on the server — user local accounts are never sent to or stored by the server.

```typescript
// Instantiated inside Server constructor:
this.botAccountManager = new BotAccountManager(this.dataRoot);
// Accounts stored at: {dataRoot}/accounts/{username}.json.enc
```

Encryption key is derived from `process.env.KIAMA_ACCOUNT_SECRET` (required in production).

### Admin REST endpoints for bot accounts (all require `x-admin-token`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/accounts/bots` | List all bot accounts |
| `POST` | `/admin/accounts/bots` | Create a bot (`username`, `password`, `botType`, optional `linkedPlugin`, `preconfig`) |
| `DELETE` | `/admin/accounts/bots/:username` | Delete a bot account |

### Login screen behaviour

The `Login` component (`src/client/renderer/src/components/Login.tsx`) shows only two tabs — **Sign in** and **Create account** — both operating on local accounts. There is no server/cloud toggle on the login screen; that belongs in server settings (Phase 2).

When a local login succeeds, `onLogin` is called with:
- `token`: `local:{uuid}` — **never persisted to `localStorage`** (session-only)
- `user`: the full `LocalAccount` object with a normalised `name` field (`= username`)

### Clearing account files (development)

```bash
rm -rf ~/.kiama/accounts/   # delete all local accounts
rm ~/.kiama/accounts/<name>.json.enc  # delete one account
```

## Development Tasks

### Adding a New Feature

1. **Plan the feature**
   - Determine if it's client-side, server-side, or both
   - Identify required UI components or API endpoints
   - Consider plugin vs core implementation

2. **Implement server-side (if needed)**
   ```typescript
   // Add to server.ts or create new module
   private setupNewFeature() {
     // Implementation
   }
   ```

3. **Implement client-side (if needed)**
   ```typescript
// Create new component in src/client/renderer/src/components/
const NewFeature: React.FC = () => {
  // Implementation
};

// For a new page, place it in src/client/renderer/src/pages and wrap content in <Page>
import Page from '../components/Page';

const NewPage: React.FC = () => (
  <Page header={<h3>My Page</h3>} scroll padded>
    {/* Body */}
  </Page>
);
   ```

4. **Add Socket.IO events (if real-time)**
   ```typescript
   // Server side
   socket.on('new_event', (data) => {
     // Handle event
   });

   // Client side
   socket.emit('new_event', data);
   ```

5. **Update types**
   ```typescript
   // Add to appropriate types file
   interface NewFeatureData {
     // Type definitions
   }
   ```

## Common UI Components

All shared UI primitives live in `src/client/renderer/src/components/`.  Use these instead of raw HTML elements to ensure consistent styling, theme-variable support, and Modern Surface compatibility.

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `Button.tsx` | `variant` (primary / ghost / danger) × `size` (sm / md / lg) |
| `TextField` | `TextField.tsx` | Labelled input with optional error state |
| `Select` | `Select.tsx` | Styled `<select>` element |
| `Toggle` | `Toggle.tsx` | On/off switch; `inline` prop puts the label to the right; `size="small"` for compact list rows; `tintColor` tints the track colour when checked |
| `ColorPicker` | `ColorPicker.tsx` | Colour swatch grid |
| `SegmentedControl` | `SegmentedControl.tsx` | Pill-style tab strip |
| `Modal` | `Modal.tsx` | Full-screen overlay wrapper |
| `ModalPanel` | `ModalPanel.tsx` | Soft-3D side-panel sheet |
| `PopoverPanel` | `PopoverPanel.tsx` | Generic floating picker panel (see below) |
| `Page` | `Page.tsx` | Header/body split with optional scroll + padding |
| `TitleBar` | `TitleBar.tsx` | Custom Electron title bar |

### PopoverPanel — generic floating picker

`PopoverPanel` is the shared chrome for all tray/popover picker panels.  It handles backdrop dismiss, iOS-style directional arrow, `position:fixed` portal, soft-3D surface, and the header bar.  Content-specific UI (grids, search forms, etc.) goes inside as `children`.

**Props:**

```tsx
import PopoverPanel, { PopoverAnchorRect } from '../components/PopoverPanel';

<PopoverPanel
  title="My Picker"           // header title text
  onClose={handleClose}       // called on X button or backdrop click
  width={360}                 // panel width in px (default 360)
  height={400}                // max-height in px (default 380)
  anchorRect={buttonRect}     // DOMRect of trigger — omit for inline tray mode
  className="my-picker"       // scopes your SCSS content rules
>
  {/* your content */}
</PopoverPanel>
```

**Tray mode** (no `anchorRect`): renders `position: absolute; bottom: 100%; right: 0` — sits above the parent container.  
**Popover mode** (with `anchorRect`): rendered via `ReactDOM.createPortal` to `document.body` as `position: fixed`, centred on the trigger button, with an arrow pointing at it.

To get the anchor rect from a button click:

```tsx
const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
  setAnchorRect(e.currentTarget.getBoundingClientRect());
};
```

Content-specific SCSS should be scoped to your `className` value and placed in `src/client/renderer/src/styles/components/MyPicker.scss`.

---

## Modern Surface System (Soft-3D)

KIAMA supports an optional *Modern Surface* mode that adds highlight-and-shadow depth cues to floating panels, modals, and toolbars.  When enabled, a `.soft-3d` class is added to `.app-shell` and individual panels apply their own soft-3D styles.

### SurfaceContext

Because picker panels are portalled outside `.app-shell`, they cannot inherit the `.soft-3d` class via CSS.  Instead, read the setting through `SurfaceContext`:

```tsx
import { useSurface } from '../utils/SurfaceContext';

const MyComponent = () => {
  const { soft3DEnabled } = useSurface();
  return <div className={soft3DEnabled ? 'my-panel soft-3d' : 'my-panel'}>...</div>;
};
```

`SurfaceProvider` wraps the entire `AppContent` return in `App.tsx`, so any component — including portalled ones — can call `useSurface()`.

### Soft-3D CSS pattern

The recommended pattern is a `&.soft-3d` modifier block inside the component's own SCSS:

```scss
.my-panel {
  background-color: var(--secondary-bg);

  &.soft-3d {
    background: linear-gradient(160deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10)), var(--secondary-bg);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.12),
      inset 0 -1px 3px rgba(0,0,0,0.12),
      0 12px 28px rgba(0,0,0,0.32);
  }
}
```

Panel-level soft-3D (background gradient, inset shadows, border colour) for `PopoverPanel`-based pickers is handled centrally in `PopoverPanel.scss` — content SCSS files only need to override inner elements (tabs, grids, etc.).

### --app-font CSS property

`ThemeProvider` writes the selected font stack to `--app-font` on `:root` via `document.documentElement.style.setProperty`.  Because browser UA stylesheets set `font-family` directly on heading elements, always use:

```scss
h3 { font-family: var(--app-font, inherit); }
```

`inherit` alone is insufficient for `<h3>` and similar elements.

---

## Adding a New Picker Panel

To create a new picker (e.g., a sticker picker from a plugin):

1. **Create the component** in `src/client/renderer/src/components/StickerPicker.tsx`:

   ```tsx
   import React from 'react';
   import PopoverPanel, { PopoverAnchorRect } from './PopoverPanel';
   import '../styles/components/StickerPicker.scss';

   interface StickerPickerProps {
     onSelect: (url: string) => void;
     onClose: () => void;
     anchorRect?: PopoverAnchorRect | null;
   }

   const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect, onClose, anchorRect }) => (
     <PopoverPanel title="Stickers" onClose={onClose} width={320} height={340}
                   anchorRect={anchorRect} className="sticker-picker">
       {/* grid of sticker buttons */}
     </PopoverPanel>
   );

   export default StickerPicker;
   ```

2. **Create SCSS** in `src/client/renderer/src/styles/components/StickerPicker.scss` and scope all rules to `.sticker-picker`.

3. **Wire in App.tsx** with an `anchorRect` state and an opener function that captures `e.currentTarget.getBoundingClientRect()`.

---



**Server Plugins**: Controlled via server API
```bash
# Enable server plugin
curl -X POST http://localhost:3000/plugins/server/MyPlugin/enable

# Disable server plugin
curl -X POST http://localhost:3000/plugins/server/MyPlugin/disable
```

**Client Plugins**: Client-controlled, except server-provided plugins
```javascript
// Enable/disable client plugin (client-side)
pluginManager.setPluginEnabled('MyPlugin', true); // Enable
pluginManager.setPluginEnabled('MyPlugin', false); // Disable
```

**Server-Provided Client Plugins**: Must be controlled by server
```bash
# Enable server-provided client plugin
curl -X POST http://localhost:3000/plugins/client/PollRenderer/enable

# Disable server-provided client plugin
curl -X POST http://localhost:3000/plugins/client/PollRenderer/disable
```

### Plugin Status

Check plugin status via API:
```bash
curl http://localhost:3000/plugins/status
```

### Plugin Compilation

KIAMA uses separate compilation for plugins to maintain modularity:

**Client Plugins:**
- Located in `src/client/renderer/src/plugins/`
- Compiled to individual files in `dist/client/plugins/`
- Loaded dynamically at runtime using `require()`
- Not bundled with main client code

**Server Plugins:**
- Located in `src/server/src/plugins/`
- Compiled to individual files in `dist/server/plugins/`
- Loaded dynamically at runtime using `require()`
- Not bundled with main server code

**Benefits:**
- Plugins can be updated independently
- Smaller main application bundles
- Better separation of concerns
- Easier plugin distribution

## Responsive UI & Mobile Notes

- Breakpoints: drawers engage at ≤768px (server/channel/member), mobile nav buttons appear at ≤1100px.
- Drawer coordination: closing the channel drawer on mobile also hides the server drawer to prevent overlap; backdrop taps close all.
- UI controls: server drawer has no close button; “Add Section” lives in the section plus menu (no bottom button).
## Settings & Server-Settings Layout

Both `SettingsPage` and `ServerSettingsPage` render as **full-width** inside `.content-shell` — the channel/member sidebar is intentionally hidden for these views.  This is controlled by `showSidebarPanel` in `App.tsx`:

```ts
// Sidebar only visible on the active-server view, never during settings pages
const showSidebarPanel = isServerView && ((!sidebarCollapsed && !isMobile) || (isMobile && showMobileSidebar));
```

Both pages share the same darker background:

```scss
background:
  radial-gradient(circle at 20% 20%, rgba(255,255,255,0.04), transparent),
  linear-gradient(160deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15)),
  var(--primary-bg);
```

`SettingsPage` gets this from the global `.settings-page` rule in `App.scss`; `ServerSettingsPage` gets it directly in `ServerSettings.scss`.

## Role Management System

Roles are stored server-side and exposed over three REST endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/roles` | Return all roles |
| `POST` | `/roles` | Create a new role (`name` required; `color`, `permissions` optional) |
| `PATCH` | `/roles/:roleId` | Update an existing role's `name`, `color`, and/or `permissions` |

---

## Channel & Section Visibility System

Channels and sections each carry a `permissions` object that gates which roles can see or manage them.  The sidebar in `App.tsx` filters out items the current user's role cannot see.

### Permission shapes (`src/client/renderer/src/types/plugin.ts`)

```typescript
interface ChannelPermissions {
  roles?: string[];        // legacy — "can manage" role names
  readRoles?: string[];    // roles allowed to see & read this channel ([] = everyone)
  writeRoles?: string[];   // roles allowed to post in this channel ([] = everyone)
}

interface SectionPermissions {
  roles?: string[];        // legacy manage list
  viewRoles?: string[];    // roles that can see this section ([] = everyone)
  manageRoles?: string[];  // roles that can manage channels within this section
  view?: boolean;          // legacy fallback
  manage?: boolean;        // legacy fallback
}
```

**Default visibility** — when a channel or section is newly created, it is **private by default**: only roles with `manageChannels: true` (or the server owner) can see it until permissions are explicitly opened.

### Visibility helpers in `App.tsx`

```tsx
// Returns true when the current user may see this section in the sidebar
const canUserViewSection = (section: ChannelSection): boolean => { ... };

// Returns true when the current user may see this channel in the sidebar
const canUserReadChannel = (channel: Channel): boolean => { ... };
```

Both helpers treat managers (roles with `manageChannels` flag or the server owner) as always-visible.

### REST endpoints for permissions

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `PATCH` | `/channels/:id/permissions` | `{ readRoles, writeRoles }` | Update channel visibility / write access |
| `PATCH` | `/sections/:id/permissions` | `{ viewRoles, manageRoles }` | Update section visibility / manage access |

### Section Settings Page (`src/client/renderer/src/pages/SectionSettingsPage.tsx`)

Mirrors the pattern of `ChannelSettingsPage`.  Opened from the section context menu ("Section Settings").

**Tabs:**
- **Overview** — rename section, display section ID and position (read-only)
- **Permissions** — per-role toggles for "Can view" and "Can manage"

**Props:**
```tsx
<SectionSettingsPage
  section={section}            // ChannelSection object
  roles={roles}                // Role[]
  onBack={closeSectionSettings}
  onRename={renameSection}     // (id, name) => Promise<void>
  onSavePermissions={fn}       // (id, viewRoles, manageRoles) => Promise<void>
/>
```

### Section deletion behaviour

When a section is deleted the server automatically moves any orphaned channels to the **lowest-position remaining section**.  No channels are ever left without a section.

---

## Server Ownership System

Each server can designate a single account as its owner.  The owner bypasses all permission checks (equivalent to every permission being enabled) and is the only one who can transfer ownership.

### Storage

`ownerUsername` is stored as a plain string in both `InitialServerConfig` (the in-memory config) and the persisted `server.config.json`.

### Setting ownership

**Option 1 — CLI flag at startup:**
```bash
npm run start:server start --owner Oblivifrek
```
This always overwrites any value already in `server.config.json`.

**Option 2 — claim-owner endpoint:**
```bash
# First claim (no admin token needed if none is configured)
curl -X POST http://localhost:3000/server/claim-owner \
  -H "Content-Type: application/json" \
  -d '{"username": "Oblivifrek"}'

# Transfer ownership (requires X-Admin-Token when a token is configured OR owner is already set)
curl -X POST http://localhost:3000/server/claim-owner \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <token>" \
  -d '{"username": "NewOwner"}'
```

**Option 3 — Server Settings → Ownership tab** in the client UI (wraps the endpoint above).

### Server info endpoint

`GET /info` is public (no auth required) and returns:
```json
{ "id": "...", "name": "KIAMA Server", "ownerUsername": "Oblivifrek", "iconUrl": "/server/icon" }
```

The client fetches this every time it switches to a server and stores the result in `serverInfoCache` (a `Map<url, { ownerUsername, iconUrl }>` React state).  `canManageChannels` compares `user.username` against the cached `ownerUsername` to detect the owner client-side.

### Server icon persistence

Icons are uploaded to the server via `POST /server/icon` (base64 `dataUri` in the JSON body).  The server saves the file as `<data-root>/server-icon.{ext}` (removing old extension variants) and serves it at `GET /server/icon`.  All clients then load the same URL, so the icon is consistent across connections — not just on the uploader's machine.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/info` | none | Server identity: id, name, ownerUsername, iconUrl |
| `POST` | `/server/icon` | none\* | Upload base64 icon (`{ dataUri }`) |
| `GET` | `/server/icon` | none | Serve the current icon file |
| `POST` | `/server/claim-owner` | open or `X-Admin-Token` | Claim / transfer ownership (`{ username }`) |

\* In production you should restrict icon upload to authenticated users.

---

---

## Backup System

`BackupManager` (`src/server/src/utils/BackupManager.ts`) handles all server-side backup logic. It is instantiated inside `Server` and started automatically with `backupManager.startScheduler()` after the server initialises.

### Data layout

```
<data-root>/
  Backups/                        ← all zip archives live here
    MyServer_Backup_2026-02-25_14-30-00.zip
    ...
  backup-config.json              ← persisted schedule / maxBackups config
  configs/
  media/
  plugins/
  secrets/
  kiama.db
```

The `Backups/` folder and `backup-config.json` are **always excluded** from the archive content, preventing recursive backup-of-backups.

### Zip filename format

```
[ServerName]_Backup_[YYYY-MM-DD]_[HH-MM-SS].zip
```

Special characters in the server name are replaced with underscores before use.

### Schedules

| Value | Interval |
|-------|----------|
| `manual` | No automatic backups |
| `daily` | Every 24 hours |
| `weekly` | Every 7 days |
| `monthly` | Every 30 days |

The scheduler checks on startup whether a scheduled backup is overdue; if so it runs one immediately.

### Admin API endpoints (all require `x-admin-token` header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/backups` | List all backups + current config |
| `GET` | `/admin/backups/config` | Return schedule config only |
| `POST` | `/admin/backups/config` | Set `schedule` and/or `maxBackups` |
| `POST` | `/admin/backups/create` | Trigger an immediate backup |
| `POST` | `/admin/backups/restore/:filename` | Restore data from a named zip |
| `DELETE` | `/admin/backups/:filename` | Delete a named zip |
| `GET` | `/admin/backups/download/:filename` | Download a zip (also accepts `?token=` query param for browser links) |

### BackupConfig shape

```typescript
interface BackupConfig {
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  lastBackupAt?: string;  // ISO timestamp of most recent backup
  maxBackups?: number;    // 0 = keep all; default 10
}
```

### BackupEntry shape

```typescript
interface BackupEntry {
  filename: string;    // e.g. "MyServer_Backup_2026-02-25_14-30-00.zip"
  createdAt: string;   // ISO timestamp
  sizeBytes: number;
  checksum: string;    // SHA-256 of the zip file
}
```

### Client UI

The **Backups** tab is available in `ServerSettingsPage` under the side-nav.  It prompts for the admin token (stored in component state only — never persisted), then offers:

- Schedule picker + max-backups input with a **Save schedule** button
- **Back up now** button for an immediate manual backup
- Backup list with per-entry download, restore, and delete actions
- Toast-style status messages for success/error feedback

The `adminToken` prop on `ServerSettingsPage` can pre-fill the token field if the host context already knows it.

### webpack externals

`archiver` and `unzipper` are listed as webpack externals in `src/server/webpack.config.js` so the bundler leaves them as runtime `require()` calls.  This prevents their optional native/cloud dependencies (`@aws-sdk/client-s3`, `bufferutil`, `utf-8-validate`) from causing build errors.

### Role shape

```typescript
interface Role {
  id: string;
  name: string;
  color?: string;
  permissions?: {
    manageServer: boolean;
    manageChannels: boolean;
    manageRoles: boolean;
    kickMembers: boolean;
    banMembers: boolean;
    sendMessages: boolean;
    viewChannels: boolean;
  };
}
```

### Client integration

The `App.tsx` `openServerSettings()` function fetches `GET /roles` and **merges** the response into the local `serverRoles` map (keyed by server id) — it does not replace, so roles loaded before the settings panel opens are preserved.

`updateServerRole(id, input)` issues `PATCH /roles/:id` with an optimistic local update before the request resolves.

Both are wired into `<ServerSettingsPage>` via props:

```tsx
<ServerSettingsPage
  roles={serverRoles[server.id] ?? []}
  onCreateRole={createServerRole}
  onUpdateRole={updateServerRole}
  adminToken={adminToken}   // optional; pre-fills the Backups tab token field
  ...
/>
```

### Username colour in chat

When a message is sent, `userRole` (the sender's current role id) is stamped onto the `TypedMessage` object and broadcast to all channel subscribers.  `MessageList` reads `message.userRole`, looks it up in the roles list, and applies `role.color` as the username foreground colour.  This means the colour is preserved even if roles are later renamed or the client reconnects.

```typescript
// plugin.ts — TypedMessage
userRole?: string;  // role id stamped at send time; drives username colour badge
```
## Context for Future AI Prompts

- Recent UI intent: keep mobile drawers non-overlapping and simplify controls (no server close button, channel close also hides server on mobile, add-section only in section menu).
- Style intent: server drawer has no shadow on mobile; channel/member drawers keep shadows for separation.
- If changing responsive behavior, preserve current breakpoints (768px, 1100px) unless explicitly requested.
- Channel/section visibility defaults to **private** (managed-roles-only) on creation; `canUserViewSection` / `canUserReadChannel` helpers gate the sidebar.
- `SectionPermissions.viewRoles` and `SectionPermissions.manageRoles` are the current API; legacy `roles`/`view`/`manage` fields may exist in old config files and should be treated as read/manage respectively.
- Server ownership is `ownerUsername` (string) in the config; compared case-insensitively against `user.username` from the auth JWT.  The client caches this in `serverInfoCache` (a `Map<serverUrl, { ownerUsername, iconUrl }>`), populated by `fetchServerInfo()` on every server switch.
- `canManageChannels` in `App.tsx` uses `serverInfoCache` for real servers and falls back to the legacy `role === 'owner'` check for home/test servers.
- Server icon is stored server-side at `<data-root>/server-icon.{ext}` and served at `GET /server/icon`; the client switches the displayed icon to this URL after a successful upload so all clients share the same icon.
- `SectionSettingsPage` mirrors `ChannelSettingsPage` — overview (rename) + permissions (viewRoles/manageRoles) tabs. Opened from the section context menu.

## Emote System

KIAMA supports server-specific custom emotes and built-in Unicode emoji, similar to Discord.

### Data Storage

Emotes are stored in the server's SQLite database (`kiama.db`) with the following schema:

```sql
CREATE TABLE emotes (
  serverId TEXT,
  name TEXT,
  filename TEXT,
  createdAt TEXT,
  updatedAt TEXT,
  uploadedBy TEXT,
  PRIMARY KEY (serverId, name)
);
```

Emote image files are stored in `<data-root>/emotes/` with unique filenames.

### Server API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/emotes-list` | List all emotes for the server (returns array of `{ name, url }`) |
| `POST` | `/emotes` | Upload a new emote (multipart form: `emote` file, `name` field) |
| `DELETE` | `/emotes/:name` | Delete an emote by name |

### Emote Upload (Server)

- Accepts images up to 256KB
- Supports PNG, GIF, JPEG, and WebP formats
- GIF files are stored directly to preserve animation
- PNG files are processed with Canvas and resized to 320×320px
- Filename extension is inferred from MIME type if not provided
- `uploadedBy` is extracted from `x-username` header

### Client: EmotePicker

`EmotePicker.tsx` provides a unified picker for both custom server emotes and built-in Unicode emoji.

**Features:**
- Tab-based navigation: "All", "Emoji" (built-in), and per-server tabs
- Fetches emotes from all connected servers
- Displays Unicode emoji inline using native font rendering
- Custom emotes rendered as `<img>` tags

**Props:**
```tsx
<EmotePicker
  onSelect={(emote) => handleEmoteSelect(emote)}
  onClose={() => setShowPicker(false)}
  servers={servers}  // { id, name, url }[]
  anchorRect={buttonRect}  // optional popover positioning
/>
```

### Emote Rendering in Chat

Emotes are parsed and rendered on the server side to ensure consistent display across clients.

**Server-side parsing:**
- `parseEmotes(content, serverId)` replaces `:emoteName:` patterns with `<img class="emote" src="/emotes/filename" alt=":emoteName:">`
- The rendered HTML is stored in `message.renderedContent`
- Both new messages and loaded history include `renderedContent`

**Client-side display:**
- The `messageFormatter` plugin preserves server's `renderedContent`
- `App.tsx` prepends the server URL to relative emote paths
- Emote-only messages (containing only emotes) are rendered larger (42×42px vs 20×20px inline)

### Emote Sizing CSS

```scss
// Inline emotes (mixed with text)
img.emote {
  width: 20px;
  height: 20px;
  vertical-align: middle;
}

// Standalone emote messages
.emote-only .message-content img.emote {
  width: 42px;
  height: 42px;
}
```

### Server Settings: Emotes Tab

The Emotes subpage in Server Settings provides:
- Split-view editor: emote list on left, preview/upload on right
- Table with Image, Name, and "Uploaded By" columns
- Upload area with drag-and-drop support
- Real-time preview with checkered background
- Zoom slider for preview (0.5×–2×)

---

## Theming System

KIAMA includes a comprehensive JSON-based theming system that allows customization of the application's appearance.

### Theme Structure

Themes are defined in JSON files with support for both light and dark modes:

```json
{
  "name": "Custom Theme",
  "modes": {
    "light": {
      "colors": {
        "primary-bg": "#ffffff",
        "secondary-bg": "#f8f9fa",
        "text-primary": "#2e3338",
        "accent": "#5865f2",
        "accent-hover": "#4752c4"
        // ... additional colors
      }
    },
    "dark": {
      "colors": {
        "primary-bg": "#36393f",
        "secondary-bg": "#2f3136",
        "text-primary": "#dcddde",
        "accent": "#5865f2",
        "accent-hover": "#4752c4"
        // ... additional colors
      }
    }
  }
}
```

### Available Color Properties

- `primary-bg`: Main application background
- `secondary-bg`: Modal and panel backgrounds
- `tertiary-bg`: Button and input backgrounds
- `text-primary`: Main text color
- `text-secondary`: Muted text color
- `accent`: Primary accent (links, active states)
- `accent-hover`: Hover/pressed state for accent elements
- `border`: Border colors
- `hover`: Hover state colors
- `error`: Error state colors
- `success`: Success state colors

### Creating Custom Themes

1. **Create Theme File**: Add JSON file to `src/client/renderer/src/themes/`
2. **Define Colors**: Provide complete color schemes for both light and dark modes
3. **Build**: Run `npm run build:client` to copy themes to `dist/client/themes/`
4. **Load**: Themes are loaded automatically at runtime

### Theme Switching

Use the `useTheme` hook to access theme functionality:

```typescript
import { useTheme } from './components/ThemeProvider';

const MyComponent = () => {
  const { currentMode, setMode, theme } = useTheme();
  
  // Switch between light/dark modes
  const toggleMode = () => {
    setMode(currentMode === 'dark' ? 'light' : 'dark');
  };
  
  return (
    <button onClick={toggleMode}>
      Current: {currentMode} | Theme: {theme?.name}
    </button>
  );
};
```

### CSS Implementation

Themes use CSS custom properties (variables) for dynamic styling:

```scss
.my-component {
  background-color: var(--primary-bg);
  color: var(--text-primary);
  border: 1px solid var(--border);
  
  &:hover {
    background-color: var(--hover);
  }
}
```

### Modifying the Build System

**Client Build:**
- Main process: Modify `src/client/tsconfig.main.json`
- Renderer: Modify `src/client/webpack.config.js`

**Server Build:**
- Modify `src/server/tsconfig.json`

### Adding Dependencies

```bash
# Client dependencies
cd src/client && npm install <package>

# Server dependencies
cd src/server && npm install <package>

# Root dependencies
npm install <package>
```

## Debugging

### Client Debugging
- Use `npm run dev:client` for hot reload
- Open DevTools with `Ctrl+Shift+I` (or `Cmd+Option+I` on Mac)
- Check console for React errors
- Use React DevTools extension

### Server Debugging
- Use `npm run dev:server` for ts-node with source maps
- Check server console output
- Use debugger statements or attach debugger

### Common Issues

**Path Resolution Errors:**
- Ensure all paths in configs use correct relative/absolute paths
- Check that built files exist in `dist/` directory

**Module Not Found:**
- Run `npm install` in affected directory
- Check package.json for correct dependencies

**Socket Connection Issues:**
- Verify server is running on correct port
- Check firewall settings
- Confirm client is connecting to right URL

**Plugin Loading Failures:**
- Verify plugin implements correct interface
- Check plugin exports default correctly
- Review console for initialization errors

## Testing Strategy

### Manual Testing Checklist

**Server:**
- [ ] Starts without errors
- [ ] CLI commands work
- [ ] Socket.IO connections accepted
- [ ] Plugins load correctly
- [ ] Manual backup creates a zip in `<data-root>/Backups/`
- [ ] Automatic schedule triggers at the configured interval
- [ ] Backup archive excludes the `Backups/` folder itself
- [ ] Restore endpoint extracts correctly (restart server to apply)
- [ ] Delete endpoint removes the zip file

**Client:**
- [ ] Electron window opens
- [ ] React app renders
- [ ] Socket connection established
- [ ] Messages send/receive
- [ ] Plugins function properly
- [ ] Local account create works (check `~/.kiama/accounts/` for `.json.enc` file)
- [ ] Local account login works with correct password
- [ ] Saved account chips appear on sign-in screen
- [ ] Display name shows username (not "You") in settings and chat
- [ ] New channel/section defaults to managed-roles-only visibility
- [ ] Sidebar hides channels/sections the current user's role cannot see
- [ ] Section Settings page opens from section context menu and saves permissions
- [ ] Channel Settings page "Can view" toggle updates sidebar visibility
- [ ] Deleting a section moves its channels to the next remaining section (no orphans)
- [ ] Server Settings → Ownership tab shows current owner badge
- [ ] Claiming ownership via the Ownership tab works (no token required on first claim if no token configured)
- [ ] Server icon uploaded from one client is visible to another client after reconnect
- [ ] Emote upload works (Server Settings → Emotes)
- [ ] Emotes appear in EmotePicker
- [ ] Emotes render in chat messages with `:emoteName:` syntax
- [ ] Emote-only messages display larger (42px)
- [ ] GIF emotes animate properly
- [ ] Built-in emoji tab shows Unicode emoji
- [ ] Chat scrolls to bottom when opening a channel

**Integration:**
- [ ] Client connects to server
- [ ] Real-time messaging works
- [ ] Multiple clients can connect

### Automated Testing (Future)

Consider adding:
- Unit tests with Jest
- E2E tests with Playwright
- API tests for server endpoints

## Performance Considerations

### Client
- Minimize bundle size (check webpack output)
- Optimize React re-renders
- Use React.memo for expensive components
- Lazy load non-critical components

### Server
- Implement connection limits
- Use clustering for multi-core utilization
- Optimize Socket.IO for high concurrency
- Implement rate limiting

## Security Considerations

### Current State
- Local account authentication (Phase 1) — AES-256 encrypted, stored on-device
- No centralised user accounts yet (Phase 2)
- No input validation
- No rate limiting
- Plain text communication (server channels)

### Future Enhancements
- Cloud accounts + local-to-cloud transfer (Phase 2; only accounts where `isServerCreated: false` are eligible)
- Input sanitization
- HTTPS/WSS
- Rate limiting

## Deployment

### Development
- Use `npm run dev:*` scripts
- Enable source maps for debugging

### Production
- Run `npm run build` to create optimized bundles
- Use `npm run start:*` for production servers
- Consider using PM2 for process management

## Contributing

1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation
4. Submit pull request

### Code Review Checklist
- [ ] TypeScript types are correct
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Documentation updated
- [ ] Tests pass (when implemented)
- [ ] Code follows style guidelines