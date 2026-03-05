# KIAMA - Decentralized Chat Platform

A decentralized Discord-like chat application built with modern web technologies, featuring self-hosted servers, end-to-end encryption, and extensible plugin architecture.

## 🚀 Features

- **Decentralized Architecture**: Self-hosted chat servers with federation capabilities
- **Channel Organization**: Discord-style channels organized into collapsible sections
- **Real-time Messaging**: Socket.IO-powered instant messaging with channel-specific chat
- **Discord-Style Message Layout**: Avatar, username, role-colour badge, timestamp header, hover toolbar — grouped consecutive messages by the same author
- **Emoji Reactions & Replies**: Per-message reaction picker and threaded-style reply references
- **Emote & GIF Pickers**: iOS-style popover pickers backed by custom server emotes (Tenor API for GIFs)
- **Voice & Video Chat**: WebRTC-based voice and video communication
- **End-to-End Encryption**: Secure communication channels
- **Role-Based Access Control**: Create/edit server roles with per-permission toggles (manage server, kick, ban, send, view); assign read/write roles per channel from the Server Settings panel
- **Channel & Section Visibility**: Per-channel and per-section visibility rules driven by roles — new channels/sections default to managed-roles-only visibility so they are private until explicitly opened
- **Section Settings Page**: Dedicated settings page per section with Overview (rename) and Permissions (viewRoles/manageRoles) tabs, mirroring the Channel Settings page
- **Server Ownership**: Designate a specific account as server owner via the Ownership tab in Server Settings or the `--owner` CLI flag; owner identity is stored in the server config and verified at login so ownership is accurate across all clients
- **Moderation System**: Advanced moderation with whitelists/blacklists
- **Plugin Architecture**: Extensible client and server plugins
- **Modern Surface (Soft-3D) Mode**: Optional per-surface highlight-and-shadow styling for panels, toolbars, and picker overlays
- **Theming System**: JSON-based themes with light/dark mode support and per-theme font selection
- **Common UI Component Library**: Shared `Button`, `TextField`, `ModalPanel`, `PopoverPanel`, `Select`, `Toggle`, `ColorPicker`, `SegmentedControl` — usable from plugins and core pages alike
- **Server Icon Persistence**: Server icons are uploaded to the server (`POST /server/icon`) so all connected clients see the same icon, not just the uploader
- **Cross-Platform Client**: Electron-based desktop application
- **Responsive UI**: Mobile drawers for server/channel/member lists with coordinated toggles
- **CLI Server Management**: Command-line interface for server administration
- **Backup System**: Scheduled or manual zip backups of all server data; manage, restore, and download backups from the Server Settings panel
- **Local Account System**: Encrypted local accounts stored on-device — no server required. AES-256-CBC encryption, OS keychain integration, ZIP export/import, and support for multiple saved accounts with quick-switch
- **Bot Accounts**: Server-side bot accounts (linked to plugins or created manually) managed via admin REST endpoints
- **Friends System**: User relationship management
- **Custom Emotes**: Server-specific emoji support

## 🏗️ Architecture

### Technology Stack

**Frontend (Client):**
- **Framework**: React 18 with TypeScript
- **Build Tool**: Webpack 5
- **Styling**: SCSS with modular component styles
- **Desktop App**: Electron
- **State Management**: React hooks
Server Name
├── 📁 General
│   ├── # general
│   └── 📢 announcements
├── 📁 Gaming
│   ├── # gaming-chat
### Channel & Section Visibility

The sidebar automatically hides channels/sections the current user's role cannot see.


### Channel Management
- **Create Channels**: Via API or client UI
- **Organize Sections**: Group related channels together
- **Permissions**: Role-based access control per channel/section
- **Real-time Updates**: Instant channel creation/deletion notifications

### Responsive UI Behavior
- **Mobile drawers**: Server, channel, and member lists slide in on ≤768px; backdrop closes all.
- **Coordinated close**: Closing the channel drawer on mobile also hides the server list to prevent overlap.
- **Add controls**: “Add Section” now lives in each section’s plus menu; the bottom bar button was removed.

## DB Encryption

See [docs/db-encryption.md](docs/db-encryption.md) for information about optional database-at-rest encryption (how to enable, admin endpoints, and key management recommendations).
- **Role colors in chat**: Each message carries `userRole` (sender's role id at send-time); `MessageList` looks up the role color and applies it to the username badge so colors survive reconnects and role renames.

### Project Structure

```
Kiama/
├── dist/                          # Built application files
│   ├── client/                    # Client application bundle
│   │   ├── main.js               # Electron main process
│   │   ├── index.html            # Client HTML
│   │   ├── bundle.js             # React application
│   │   └── *.js/*.map            # Source maps and chunks
│   └── server/                    # Server application
│       ├── index.js              # Server entry point
│       ├── server.js             # Main server class
│       └── *.js                  # Compiled server files
├── src/                           # Source code
│   ├── client/                    # Client application
│   │   ├── main/                  # Electron main process
│   │   │   └── main.ts           # Main process entry
│   │   ├── renderer/              # React renderer process
│   │   │   ├── src/              # React source
│   │   │   │   ├── components/   # Shared React components
│   │   │   │   │   ├── Button.tsx          # Primary, ghost, danger variants + sizes
│   │   │   │   │   ├── TextField.tsx       # Labelled text input with error state
│   │   │   │   │   ├── Select.tsx          # Styled select element
│   │   │   │   │   ├── Toggle.tsx          # On/off toggle switch
│   │   │   │   │   ├── ColorPicker.tsx     # Colour swatch picker
│   │   │   │   │   ├── SegmentedControl.tsx# Pill-style tab strip
│   │   │   │   │   ├── Modal.tsx           # Full-screen overlay wrapper
│   │   │   │   │   ├── ModalPanel.tsx      # Soft-3D modal sheet (side panels)
│   │   │   │   │   ├── PopoverPanel.tsx    # Shared floating picker panel (tray or popover)
│   │   │   │   │   ├── ChannelList.tsx
│   │   │   │   │   ├── EmotePicker.tsx     # Emoji / server-emote picker
│   │   │   │   │   ├── GifPicker.tsx       # Tenor GIF picker
│   │   │   │   │   ├── MessageInput.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   └── UserList.tsx
│   │   │   │   ├── plugins/      # Client plugins
│   │   │   │   │   └── messageFormatter.ts
│   │   │   │   │   └── darkModeToggle.tsx
│   │   │   │   ├── styles/       # SCSS styles
│   │   │   │   │   ├── components/
│   │   │   │   │   └── App.scss
│   │   │   │   ├── types/        # TypeScript types
│   │   │   │   │   ├── plugin.ts
│   │   │   │   │   └── account.ts          # LocalAccount, BotAccount, ServerList types
│   │   │   │   ├── utils/        # Utilities
│   │   │   │   │   ├── PluginManager.ts
│   │   │   │   │   ├── AccountManager.ts   # Client-side local account CRUD + encryption
│   │   │   │   │   └── SurfaceContext.tsx  # React context exposing soft-3D state to portalled components
│   │   │   │   ├── App.tsx       # Main React shell wiring pages/layout
│   │   │   │   └── index.tsx     # React entry point
│   │   │   ├── public/           # Static assets
│   │   │   └── tsconfig.json     # Client TypeScript config
│   │   ├── tsconfig.main.json    # Main process TypeScript config
│   │   ├── webpack.config.js     # Webpack configuration
│   │   └── package.json          # Client dependencies
│   └── server/                    # Server application
│       ├── src/                  # Server source
│       │   ├── index.ts          # CLI entry point
│       │   ├── server.ts         # Main server class
│       │   ├── types/            # Server types
│       │   │   └── plugin.ts
│       │   ├── utils/            # Server utilities
│       │   │   ├── PluginManager.ts
│       │   │   ├── BackupManager.ts
│       │   │   └── BotAccountManager.ts    # Server-side bot account CRUD + encryption
│       │   └── plugins/          # Server plugins
│       │       └── messageLogger.ts
│       │       └── pollServer.js
│       │       └── poll-client.js
│       ├── tsconfig.json         # Server TypeScript config
│       └── package.json          # Server dependencies
├── assets/                        # Static assets (emotes, etc.)
├── PLUGIN_README.md               # Plugin development guide
├── package.json                   # Root package.json
└── README.md                      # This file
```

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: v18+ (with npm)
- **TypeScript**: v5.0+
- **Python**: For node-gyp (if needed)

### Installation

1. **Clone and Install Dependencies:**
   ```bash
   git clone <repository-url>
   cd Kiama
   npm run install:all
   ```

2. **Build the Application:**
   ```bash
   npm run build
   ```

3. **Start Development Servers:**
   ```bash
   # Terminal 1: Start server
   npm run dev:server

   # Terminal 2: Start client
   npm run dev:client
   ```

### Available Scripts

**Root Level:**
- `npm run build` - Build both client and server
- `npm run build:server` - Build server only
- `npm run build:client` - Build client only
- `npm run start:server` - Start production server
- `npm run start:client` - Start production client
- `npm run dev:server` - Start server in development mode
- `npm run dev:client` - Start client in development mode
- `npm run install:all` - Install all dependencies

**Server Specific:**
- `npm run build` - Compile TypeScript
- `npm run start` - Start server with CLI
- `npm run dev` - Start with ts-node

**Client Specific:**
- `npm run build` - Build main + webpack
- `npm run build:main` - Build Electron main process
- `npm run start` - Start Electron app
- `npm run dev` - Start development with hot reload

## 🔧 Configuration

### Server Configuration

The server supports several command-line options:

```bash
kiama-server --help
```

Key options:
- `--port <number>` - Server port (default: 3000)
- `--mode <public|private>` - Server access mode
- `--token <token>` - Admin token for protected endpoints (or set `KIAMA_ADMIN_TOKEN`)
- `--owner <username>` - Designate a local account as server owner on startup
- `--config <path>` - Path to an initial server configuration JSON file
- `--help` - Show help information

Server management CLI (requires admin token):
- `kiama-server notify --message "Planned maintenance" --type maintenance` – broadcast a notice
- `kiama-server stop --message "Shutting down"` – graceful stop with optional notice
- `kiama-server restart --message "Rebooting" --delay 1000` – graceful restart (process manager should relaunch)
- `kiama-server init-config --name "My Server" --output server.config.json` – scaffold a starter config (sections, channels, roles)

Environment variables:
- `KIAMA_ADMIN_TOKEN` – admin token for protected endpoints/CLI (if unset, the server generates one and writes it to `data/secrets/admin.token` with mode 600)
- `KIAMA_DATA_DIR` – root for runtime data (configs, plugins, uploads, logs, secrets). Defaults to `dist/server/data` (or equivalent when running from source).
- `KIAMA_CONFIG_PATH` – override path to the persisted config JSON (defaults to `<data-root>/configs/<serverId>.json`).

Data layout created on startup:
- `<data-root>/configs/` – persisted server config (includes sections/channels/roles, hashed admin token, and `ownerUsername`)
- `<data-root>/plugins/` – server-side plugins
- `<data-root>/uploads/` – user uploads (emotes, etc.)
- `<data-root>/logs/` – server logs
- `<data-root>/media/` – uploaded media files
- `<data-root>/data/` – server icon file (`server-icon.{ext}`) stored here
- `<data-root>/Backups/` – backup zip archives (`[ServerName]_Backup_[Datetime].zip`)
- `<data-root>/secrets/admin.token` – generated admin token (mode 600) when no token is supplied
- `<data-root>/backup-config.json` – persisted backup schedule and max-count settings

### Client Configuration

The client automatically connects to `http://localhost:3000`. To change this, modify the socket URL in `src/client/renderer/src/App.tsx`.

### Build Configuration

**TypeScript:**
- `src/server/tsconfig.json` - Server compilation
- `src/client/tsconfig.json` - Client renderer compilation
- `src/client/tsconfig.main.json` - Electron main process compilation

**Webpack:**
- `src/client/webpack.config.js` - Client bundling configuration

## 🔌 Plugin System

KIAMA features an extensible plugin architecture for both client and server, with support for server-provided client plugins that can be downloaded on a per-server basis.

### Plugin Compilation

Plugins are compiled separately from the main application code for better modularity:

- **Client Plugins**: Source in `src/client/renderer/src/plugins/`, compiled to `dist/client/plugins/`
- **Server Plugins**: Source in `src/server/src/plugins/`, compiled to `dist/server/plugins/`
- **Main Applications**: Core code bundled into single files without plugin code

This separation allows plugins to be developed, updated, and distributed independently.

### Client Plugins

Located in `src/client/renderer/src/plugins/`

Current client plugins:
- `messageFormatter.ts` - Formats messages with basic markdown-like syntax
- `darkModeToggle.tsx` - Adds a theme toggle button and responds to theme commands

```typescript
interface ClientPlugin {
  name: string;
  version: string;
  messageTypes?: string[]; // Message types this plugin handles
  serverId?: string; // Server-specific plugin
  init: (api: PluginAPI) => void;
}

interface PluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  addUIComponent: (component: React.ComponentType) => void;
  getSocket: () => any;
  registerMessageType: (type: string, component: React.ComponentType) => void;
}
```

### Server Plugins

Located in `src/server/src/plugins/`

Current server plugins:
- `messageLogger.ts` - Logs all messages to console for debugging

```typescript
interface ServerPlugin {
  name: string;
  version: string;
  init: (api: ServerPluginAPI) => void;
}

interface ServerPluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  onMessage: (handler: (message: any) => void) => void; // Alias for addMessageHandler
  sendMessage: (message: any) => void; // Broadcast new server-side messages/commands
  modifyMessage: (messageId: string, modifiedMessage: any) => void; // Adjust messages in-place
  addRoute: (path: string, handler: any) => void; // Expose REST-ish endpoints for commands/config
  registerClientPlugin: (metadata: ClientPluginMetadata) => void; // Ship companion client plugins
  getIO: () => any;
}
```

Server plugins can wire in new command surfaces (e.g., slash-like commands via routes), broadcast automation messages, and ship paired client plugins to render UI for those commands.

### Server-Provided Client Plugins

Servers can provide client-side plugins for custom message types:

```typescript
interface ClientPluginMetadata {
  name: string;
  version: string;
  messageTypes: string[];
  downloadUrl: string;
  checksum: string;
  description?: string;
  author?: string;
  enabled?: boolean; // Server controls enable/disable
}
```

**Example**: A server can provide a poll plugin that clients download automatically when connecting. The poll client plugin is located in `src/server/src/plugins/poll-client.js`.

### Plugin Management

Both server and client plugins can be enabled/disabled:

**Server Plugins**: Can be enabled/disabled via server API endpoints
**Client Plugins**: Can be enabled/disabled by the client, except for server-provided plugins which must be controlled by the server

**API Endpoints**:
- `POST /plugins/server/:pluginName/enable` - Enable server plugin
- `POST /plugins/server/:pluginName/disable` - Disable server plugin
- `POST /plugins/client/:pluginName/enable` - Enable client plugin (server-provided only)
- `POST /plugins/client/:pluginName/disable` - Disable client plugin (server-provided only)
- `GET /plugins/status` - Get plugin status

### Message Types

Messages now support types for custom rendering:

```typescript
interface TypedMessage {
  id: string;
  user: string;
  content: string;
  type: string; // 'text', 'poll', 'embed', etc.
  timestamp: Date;
  data?: any; // Type-specific data
  serverId: string;
}
```
}
```

See `PLUGIN_README.md` for detailed plugin development instructions.

## 🧪 Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled
- **React**: Functional components with hooks
- **Styling**: SCSS modules with BEM-like naming
- **Imports**: Absolute imports from src root

### File Naming

- Components: `PascalCase.tsx`
- Utilities: `PascalCase.ts`
- Styles: `componentName.scss`
- Types: `camelCase.ts`

### Commit Messages

Follow conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Testing
- `chore:` - Maintenance

### Testing

Currently no automated tests are implemented. Manual testing is performed by:

1. Building the application
2. Starting server and client
3. Testing chat functionality
4. Testing plugin loading

## 🚀 Deployment

### Server Deployment

1. Build the server: `npm run build:server`
2. Copy `dist/server/` to your server
3. Install production dependencies
4. Run: `node index.js [options]`

### Client Deployment

1. Build the client: `npm run build:client`
2. The `dist/client/` folder contains the packaged Electron app
3. Distribute the built files or use electron-builder for platform-specific packages

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Areas for Contribution

- **Plugin Development**: Create new plugins for additional features
- **UI/UX Improvements**: Enhance the Discord-like interface
- **Security**: Implement end-to-end encryption
- **Performance**: Optimize real-time communication
- **Testing**: Add automated test suites
- **Documentation**: Improve developer documentation

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Server won't start:**
- Check if port 3000 is available
- Ensure all dependencies are installed
- Verify TypeScript compilation succeeded

**Client shows white screen:**
- Check if server is running
- Verify webpack build completed successfully
- Check browser console for errors

**Plugin not loading:**
- Ensure plugin follows the correct interface
- Check console for plugin initialization errors
- Verify plugin exports default correctly

### Debug Mode

Run client with dev tools:
```bash
npm run dev:client
```

This opens Electron with developer tools enabled.

## 📚 Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [Socket.IO Documentation](https://socket.io/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

---

**AI Context Note**: This codebase is designed with AI-assisted development in mind. Key files include comprehensive TypeScript types, clear component structure, and extensive documentation. The plugin system allows for easy extension without modifying core code.
- `dist/` - Build outputs (gitignored)

## Setup

1. Install dependencies: `npm run install:all`
2. Build the project: `npm run build`
3. Start server: `npm run start:server`
4. Start client: `npm run start:client`

## Development

- Server dev: `npm run dev:server`
- Client dev: `npm run dev:client`