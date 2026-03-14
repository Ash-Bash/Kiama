# KIAMA Quick Reference

## Essential Commands

### Setup
```bash
npm run install:all    # Install all dependencies
npm run build         # Build everything
```

### Development
```bash
npm run dev:server    # Start server with hot reload
npm run dev:client    # Start client with hot reload
```

### Production
```bash
npm run start:server  # Start production server
npm run start:client  # Start production client
```

### Server Management CLI
```bash
kiama-server start                          # start server (auto-generates admin token if none set)
kiama-server start --token mytoken         # start with a fixed admin token
kiama-server start --owner Oblivifrek      # designate server owner on startup
kiama-server notify --message "Maintenance in 5m" --type maintenance
kiama-server stop --message "Shutting down"
kiama-server restart --message "Rebooting" --delay 1000
kiama-server init-config --name "My Server" --output server.config.json
```

### Individual Builds
```bash
npm run build:server  # Build server only
npm run build:client  # Build client only
```

## File Structure Reference

### Key Files
- `src/client/main/main.ts` - Electron main process
- `src/client/renderer/src/App.tsx` - React root
- `src/client/renderer/src/components/Login.tsx` - Login screen (local accounts only)
- `src/client/renderer/src/utils/AccountManager.ts` - Local account CRUD, AES-256 encryption, ZIP backup
- `src/client/renderer/src/types/account.ts` - `LocalAccount`, `BotAccount`, `ServerList` types
- `src/server/src/server.ts` - Main server class
- `src/server/src/index.ts` - CLI entry point
- `src/server/src/utils/BotAccountManager.ts` - Server-side bot account CRUD + encryption
- `src/client/renderer/src/components/PopoverPanel.tsx` - Shared picker panel chrome
- `src/client/renderer/src/utils/SurfaceContext.tsx` - Soft-3D state context

### Key Pages
- `src/client/renderer/src/pages/SettingsPage.tsx` - Account / app settings (full-width, dark gradient bg)
- `src/client/renderer/src/pages/ServerSettingsPage.tsx` - Per-server settings: overview, roles, permissions, security, backups, **ownership** (full-width, same dark gradient bg as SettingsPage, **no** channel/member sidebar)
- `src/client/renderer/src/pages/ServerUserSettingsPage.tsx` - Per-server user profile: nickname and per-server avatar override
- `src/client/renderer/src/pages/ChannelSettingsPage.tsx` - Per-channel settings: overview (rename, move), permissions ("Can view (visibility)" and "Can write" per role)
- `src/client/renderer/src/pages/SectionSettingsPage.tsx` - Per-section settings: overview (rename) and permissions (viewRoles/manageRoles per role)
- `src/client/renderer/src/pages/HomePage.tsx` - Dashboard / home view
- `src/client/renderer/src/pages/ServerPage.tsx` - Active server chat view (sidebar visible)

### Build Outputs
- `dist/client/bundle.js` - Main client application (plugins excluded)
- `dist/client/plugins/` - Individual compiled client plugin files
- `dist/server/kiama-server-x.x.x.js` - Main server application (plugins excluded)
- `dist/server/plugins/` - Individual compiled server plugin files

### Configuration Files
- `src/client/webpack.config.js` - Client bundling
- `src/client/tsconfig.main.json` - Main process TS
- `src/server/tsconfig.json` - Server TS

### Admin Token & Data Paths
- Set `KIAMA_ADMIN_TOKEN` to control admin endpoints; otherwise the server writes a generated token to `<data-root>/secrets/admin.token` (mode 600).
- Read auto-generated token: `cat dist/server/data/secrets/admin.token`
- Override data root with `KIAMA_DATA_DIR`; override persisted config path with `KIAMA_CONFIG_PATH`.
- Default data layout: `configs/`, `plugins/`, `uploads/`, `logs/`, `secrets/`, `media/`, `Backups/`, **`accounts/`**, **`cached/avatars/`** under the data root.
- Server icon file saved at `<data-root>/server-icon.{ext}` and served at `GET /server/icon`.
- Backup schedule is saved to `<data-root>/backup-config.json`. The `Backups/` folder is always excluded from archive contents.
- `KIAMA_ACCOUNT_SECRET` — secret used to derive the AES key for server-side bot account files (`BotAccountManager`) and avatar cache encryption.
- `KIAMA_CACHE_KEY` — optional separate key for avatar cache encryption (falls back to `KIAMA_ACCOUNT_SECRET`).

## Common Components Quick Reference

### Shared UI Primitives

| Component | Import | Notes |
|-----------|--------|-------|
| `Button` | `./Button` | `variant`: primary / ghost / danger; `size`: sm / md / lg |
| `TextField` | `./TextField` | `label`, `error`, `containerClassName` props |
| `Select` | `./Select` | Wraps `<select>` with theme styling |
| `Toggle` | `./Toggle` | Boolean on/off with label; `inline` puts label to the right; `size="small"` for compact rows; `tintColor` colours the track when on |
| `ColorPicker` | `./ColorPicker` | Swatch-grid colour selector |
| `SegmentedControl` | `./SegmentedControl` | Pill tab strip |
| `ModalPanel` | `./ModalPanel` | Side-panel sheet with soft-3D support |
| `PopoverPanel` | `./PopoverPanel` | Floating picker panel (tray or anchored popover) |
| `Page` | `./Page` | Header/body split with `scroll` and `padded` options |

### PopoverPanel at a glance

```tsx
import PopoverPanel, { PopoverAnchorRect } from '../components/PopoverPanel';

// Tray mode (no anchorRect) — absolute, bottom: 100%, right: 0
<PopoverPanel title="Stickers" onClose={close} width={320} height={340} className="sticker-picker">
  {/* content */}
</PopoverPanel>

// Popover mode — portalled to document.body, fixed, arrow pointing at trigger
<PopoverPanel title="Stickers" onClose={close} anchorRect={buttonRect} className="sticker-picker">
  {/* content */}
</PopoverPanel>
```

### Capturing an anchor rect

```tsx
const [anchorRect, setAnchorRect] = useState<PopoverAnchorRect | null>(null);

<button onClick={(e) => setAnchorRect(e.currentTarget.getBoundingClientRect())}>
  Open Picker
</button>
{
  anchorRect && (
    <MyPicker anchorRect={anchorRect} onClose={() => setAnchorRect(null)} />
  )
}
```

### SurfaceContext / useSurface

```tsx
import { useSurface } from '../utils/SurfaceContext';

const { soft3DEnabled } = useSurface();
// Use in portalled or non-portalled components; SurfaceProvider wraps AppContent in App.tsx
```

### Font in headings

```scss
// Always use --app-font for h2/h3 etc. — `inherit` is overridden by the browser UA stylesheet
h3 { font-family: var(--app-font, inherit); }
```

## Account System

### Local accounts (client-side)

Accounts are stored in `~/.kiama/accounts/` as AES-256-CBC encrypted files.

```bash
# Delete all local accounts (dev reset)
rm -rf ~/.kiama/accounts/

# Delete one account
rm ~/.kiama/accounts/<username>.json.enc
```

```typescript
import { AccountManager } from './utils/AccountManager';
const mgr = new AccountManager(path.join(os.homedir(), '.kiama', 'accounts'));

await mgr.createAccount({ username, password });  // create
await mgr.login(username, password);               // → LoginResult
mgr.listAccounts();                                // → string[]
await mgr.exportToZip(username);                   // → Buffer (plain ZIP)
await mgr.importFromZip(buffer, newPassword);      // re-encrypts on import
await mgr.rotateKey(username, oldPw, newPw);       // key rotation
mgr.deleteAccount(username);                       // remove file + keychain entry
```

**Encrypted file format**: `{saltHex}:{ivHex}:{cipherHex}` — salt is embedded so login never requires the OS keychain.

### Bot accounts (server-side)

Require the `x-admin-token` header. Set `KIAMA_ACCOUNT_SECRET` env var for encryption.

```bash
# List bots
curl http://localhost:3000/admin/accounts/bots -H "x-admin-token: <token>"

# Create a bot
curl -X POST http://localhost:3000/admin/accounts/bots \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <token>" \
  -d '{"username": "poll-bot", "password": "secret", "botType": "custom", "linkedPlugin": "pollServer"}'

# Delete a bot
curl -X DELETE http://localhost:3000/admin/accounts/bots/poll-bot \
  -H "x-admin-token: <token>"
```

---

## Common Tasks

### Add New Component
1. Create `src/client/renderer/src/components/NewComponent.tsx`
2. Add styles in `src/client/renderer/src/styles/components/`
3. Import in parent component

### Add Picker Panel (uses PopoverPanel)
1. Create `src/client/renderer/src/components/MyPicker.tsx`
2. Import `PopoverPanel, { PopoverAnchorRect }` from `./PopoverPanel`
3. Wrap content: `<PopoverPanel title="…" onClose={…} width={…} height={…} anchorRect={…} className="my-picker">…</PopoverPanel>`
4. Add **content-only** SCSS in `src/client/renderer/src/styles/components/MyPicker.scss` scoped to `.my-picker` (no backdrop/arrow/header — PopoverPanel owns those)
5. Wire anchor state in parent with `e.currentTarget.getBoundingClientRect()` on the trigger button
6. See `EmotePicker.tsx` / `GifPicker.tsx` as reference implementations

### Add Server Endpoint
1. Add route in `src/server/src/server.ts`
2. Update Socket.IO events if needed
3. Test with client

### Create Plugin
1. Create plugin file in appropriate plugins directory (`src/client/renderer/src/plugins/` or `src/server/src/plugins/`)
2. Implement plugin interface with proper exports
3. Build project to compile plugin separately
4. Plugin loads automatically at runtime (no bundling with main app)

### Modify Styling
1. Edit SCSS files in `src/client/renderer/src/styles/`
2. Rebuild client to see changes
3. Use dev mode for hot reload

### Create Custom Theme
1. Create JSON file in `src/client/renderer/src/themes/`
2. Define `modes.light.colors` and `modes.dark.colors` objects
3. Include all required color properties (primary-bg, text-primary, etc.)
4. Build client to copy theme to `dist/client/themes/`
5. Theme loads automatically at runtime

## Socket Events

### Client → Server
- `message` - Send chat message
- `join_channel` - Join channel
- `leave_channel` - Leave channel

### Server → Client
- `message` - Receive chat message
- `user_joined` - User joined channel
- `user_left` - User left channel

## Emotes

### Server API

```bash
# List all emotes
curl http://localhost:3000/emotes-list

# Upload emote (multipart form)
curl -X POST http://localhost:3000/emotes \
  -H "x-username: alice" \
  -F "emote=@smile.png" \
  -F "name=smile"

# Delete emote
curl -X DELETE http://localhost:3000/emotes/smile \
  -H "x-username: alice"
```

### Chat Syntax

Use `:emoteName:` in messages to render emotes:
```
Hello :smile: how are you?
```

### Emote Sizing

- **Inline (with text):** 20×20px
- **Standalone (emote-only messages):** 42×42px

### Key Files

| Purpose | File |
|---------|------|
| Emote Picker | `src/client/renderer/src/components/EmotePicker.tsx` |
| Emote Editor | `src/client/renderer/src/pages/ServerSettingsPage.tsx` (EmotesSubPage) |
| Server API | `src/server/src/server.ts` (emotes routes) |
| Styles | `src/client/renderer/src/styles/App.scss` (.emote, .emote-only) |

## Plugin APIs

### Client Plugin API
```typescript
interface PluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  addUIComponent: (component: React.ComponentType) => void;
  getSocket: () => Socket;
}
```

### Server Plugin API
```typescript
interface ServerPluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  onMessage: (handler: (message: any) => void) => void; // Alias for addMessageHandler
  sendMessage: (message: any) => void; // Broadcast server-origin messages/commands
  modifyMessage: (messageId: string, modifiedMessage: any) => void; // Update existing messages
  addRoute: (path: string, handler: any) => void; // Custom endpoints/command handlers
  registerClientPlugin: (metadata: ClientPluginMetadata) => void; // Ship companion client plugins
  getIO: () => Server;
}
```

Server plugins can expose new command surfaces (e.g., slash-style handlers via routes) and pair them with client-side renderers delivered through `registerClientPlugin`.

### Theme API
```typescript
interface ThemeContext {
  theme: Theme | null;
  currentMode: 'light' | 'dark';
  setMode: (mode: 'light' | 'dark') => void;
  setTheme: (theme: Theme) => void;
}

// Usage in components
const { currentMode, setMode, theme } = useTheme();
```

## Troubleshooting

### Client Won't Start
- Check if `dist/client/main.js` exists
- Verify server is running
- Check console for errors

### Server Won't Start
- Check if `dist/server/index.js` exists
- Verify port 3000 is available
- Check for missing dependencies

### Messages Not Sending
- Verify Socket.IO connection
- Check server console for errors
- Confirm event names match

### Styles Not Updating
- Rebuild client after SCSS changes
- Clear browser cache
- Check for CSS compilation errors

### Responsive UI Notes
- Mobile drawers activate at ≤768px; use the top-left/right mobile buttons to open channel and member lists.
- Closing the channel drawer on mobile also hides the server list to avoid overlapping drawers.
- The server drawer no longer shows a close button; tap the backdrop or open another panel to exit.
- “Add Section” is available from each section’s plus menu instead of a bottom button.

## Architecture Notes

- **Client**: Electron (main + renderer processes)
- **Server**: Node.js + Express + Socket.IO
- **Communication**: Socket.IO for real-time messaging
- **Plugins**: Extensible system for both client/server
- **Build**: TypeScript compilation to `dist/` directory
- **Styling**: SCSS with component-based architecture

## Performance Tips

- Use React.memo for expensive components
- Minimize bundle size (check webpack output)
- Implement connection pooling for high load
- Use lazy loading for non-critical features

## Plugin Management

### Server Plugin Control
```bash
# Enable server plugin
curl -X POST http://localhost:3000/plugins/server/PluginName/enable

# Disable server plugin
curl -X POST http://localhost:3000/plugins/server/PluginName/disable
```

### Client Plugin Control (Server-Provided Only)
```bash
# Enable client plugin
curl -X POST http://localhost:3000/plugins/client/PluginName/enable

# Disable client plugin
curl -X POST http://localhost:3000/plugins/client/PluginName/disable
```

### Plugin Status
```bash
# Get all plugin status
curl http://localhost:3000/plugins/status
```

### Client-Side Plugin Control
```javascript
// Enable/disable regular client plugins (not server-provided)
pluginManager.setPluginEnabled('PluginName', true);  // Enable
pluginManager.setPluginEnabled('PluginName', false); // Disable

// Server-provided plugins cannot be controlled by client
pluginManager.setPluginEnabled('ServerPlugin', false); // Will fail
```

## Plugin Types

- **Global Client Plugins**: User-installed, client-controlled
- **Server-Provided Client Plugins**: Server-controlled, auto-downloaded
- **Server Plugins**: Server-controlled, run on server

## Security Notes

- Server-provided plugins can only be enabled/disabled by the server
- Client plugins are verified with checksums before installation
- Disabled plugins don't process messages or render components

## Channel Management

### Creating Channels
```bash
# Create a text channel
curl -X POST http://localhost:3000/channels \
  -H "Content-Type: application/json" \
  -d '{"name": "gaming-chat", "type": "text"}'

# Create a voice channel
curl -X POST http://localhost:3000/channels \
  -H "Content-Type: application/json" \
  -d '{"name": "voice-lounge", "type": "voice"}'

# Create an announcement channel
curl -X POST http://localhost:3000/channels \
  -H "Content-Type: application/json" \
  -d '{"name": "news", "type": "announcement"}'
```

### Creating Sections
```bash
# Create a section to organize channels
curl -X POST http://localhost:3000/sections \
  -H "Content-Type: application/json" \
  -d '{"name": "Gaming"}'
```

### Deleting Channels/Sections
```bash
# Delete a channel (cannot delete default channels)
curl -X DELETE http://localhost:3000/channels/channel-id

# Delete a section (cannot delete default section)
curl -X DELETE http://localhost:3000/sections/section-id
```

### Getting Channel Information
```bash
# Get all channels
curl http://localhost:3000/channels

# Get all sections
curl http://localhost:3000/sections
```

## Backup Management

All backup endpoints require the `x-admin-token` header (or `?token=` query param for download links).

### List backups & config
```bash
curl http://localhost:3000/admin/backups \
  -H "x-admin-token: <your-token>"
```

### Trigger a manual backup
```bash
curl -X POST http://localhost:3000/admin/backups/create \
  -H "x-admin-token: <your-token>"
```

### Set backup schedule
```bash
# Schedules: manual | daily | weekly | monthly
curl -X POST http://localhost:3000/admin/backups/config \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <your-token>" \
  -d '{"schedule": "daily", "maxBackups": 14}'
```

### Restore from a backup
```bash
curl -X POST \
  "http://localhost:3000/admin/backups/restore/MyServer_Backup_2026-02-25_14-30-00.zip" \
  -H "x-admin-token: <your-token>"
# Restart the server after restoring to apply changes.
```

### Download a backup zip (browser-friendly)
```
http://localhost:3000/admin/backups/download/MyServer_Backup_2026-02-25_14-30-00.zip?token=<your-token>
```

### Delete a backup
```bash
curl -X DELETE \
  "http://localhost:3000/admin/backups/MyServer_Backup_2026-02-25_14-30-00.zip" \
  -H "x-admin-token: <your-token>"
```

### Zip filename format
```
[ServerName]_Backup_[YYYY-MM-DD]_[HH-MM-SS].zip
```

---

## Role Management

### REST Endpoints
```bash
# List all roles
curl http://localhost:3000/roles

# Create a role
curl -X POST http://localhost:3000/roles \
  -H "Content-Type: application/json" \
  -d '{"name": "Moderator", "color": "#ed4245", "permissions": {"kickMembers": true, "banMembers": false, "manageServer": false, "manageChannels": false, "manageRoles": false, "sendMessages": true, "viewChannels": true}}'

# Update an existing role
curl -X PATCH http://localhost:3000/roles/<roleId> \
  -H "Content-Type: application/json" \
  -d '{"name": "Senior Mod", "color": "#fee75c", "permissions": {"kickMembers": true, "banMembers": true, "manageServer": false, "manageChannels": false, "manageRoles": false, "sendMessages": true, "viewChannels": true}}'
```

### Channel Permissions (read/write by role)
```bash
# Update which roles can read/write a channel
curl -X PATCH http://localhost:3000/channels/<channelId>/permissions \
  -H "Content-Type: application/json" \
  -d '{"readRoles": ["owner", "mod"], "writeRoles": ["owner"]}'

# Update which roles can view/manage a section
curl -X PATCH http://localhost:3000/sections/<sectionId>/permissions \
  -H "Content-Type: application/json" \
  -d '{"viewRoles": [], "manageRoles": ["owner", "mod"]}'
# viewRoles: [] = visible to everyone; non-empty = only those roles can see it
# manageRoles: [] = no one can manage via role alone (only server owner)
```

### Server Info & Ownership Endpoints
```bash
# Get server identity (public — no token required)
curl http://localhost:3000/info
# Response: { id, name, ownerUsername, iconUrl }

# Upload / update server icon (base64 dataUri)
curl -X POST http://localhost:3000/server/icon \
  -H "Content-Type: application/json" \
  -d '{"dataUri": "data:image/png;base64,..."}'

# Serve current icon (browser-friendly)
curl http://localhost:3000/server/icon

# Claim or transfer server ownership
# If no admin token is configured the endpoint is open (first-run "claim").
# Once a token exists OR an owner is already set, X-Admin-Token is required.
curl -X POST http://localhost:3000/server/claim-owner \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <token>" \
  -d '{"username": "Oblivifrek"}'
```

### ServerSettingsPage Props
```tsx
<ServerSettingsPage
  server={server}                   // { id, name, url }
  channels={channels}               // Channel[]
  roles={roles}                     // Role[] — id/name/color/permissions
  selectedChannelId={channelId}
  onSelectChannel={fn}              // (channelId: string) => void
  onSavePermissions={fn}            // (channelId, readRoles, writeRoles) => Promise<void>
  onCreateRole={fn}                 // ({ name, color?, permissions }) => Promise<void>
  onUpdateRole={fn}                 // (id, { name, color?, permissions }) => Promise<void>
  onBack={fn}
  loading={false}
  passwordRequired={null}           // null | boolean
  adminToken="..."                  // optional; pre-fills Backups tab token field
  ownerUsername={ownerUsername}     // string | null | undefined — from /info cache
  currentUsername={user?.username}  // logged-in account username
  onClaimOwner={claimOwner}         // (username, token?) => Promise<{success, ...}>
/>
```

## Socket.IO Events

### Channel Events
```javascript
// Join a channel
socket.emit('join_channel', { channelId: 'general' });

// Leave a channel
socket.emit('leave_channel', { channelId: 'general' });

// Get channel list
socket.emit('get_channels');

// Listen for channel updates
socket.on('channel_created', (channel) => { ... });
socket.on('channel_deleted', (data) => { ... });
socket.on('section_created', (section) => { ... });
socket.on('section_deleted', (data) => { ... });
```

### Message Events (Channel-Specific)
```javascript
// Send message to specific channel
socket.emit('message', {
  content: 'Hello!',
  channelId: 'general',
  type: 'text'
});

// Receive channel history
socket.on('channel_history', (data) => {
  // data.messages contains recent messages for the channel
});

// Receive new messages
socket.on('message', (message) => {
  // message.channelId indicates which channel it belongs to
  // message.userRole  — role id assigned to the sender at send-time;
  //                     used to look up role color for the username badge in chat
});
```

### TypedMessage shape (plugin.ts)
```typescript
interface TypedMessage {
  id: string;
  user: string;       // display name
  userRole?: string;  // role id stamped at send-time — drives username colour in MessageList
  content: string;
  timestamp: string;
  channelId: string;
  type?: string;
  // ... reactions, replyTo, attachments, etc.
}
```