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

### Individual Builds
```bash
npm run build:server  # Build server only
npm run build:client  # Build client only
```

## File Structure Reference

### Key Files
- `src/client/main/main.ts` - Electron main process
- `src/client/renderer/src/App.tsx` - React root
- `src/server/src/server.ts` - Main server class
- `src/server/src/index.ts` - CLI entry point

### Build Outputs
- `dist/client/bundle.js` - Main client application (plugins excluded)
- `dist/client/plugins/` - Individual compiled client plugin files
- `dist/server/kiama-server-x.x.x.js` - Main server application (plugins excluded)
- `dist/server/plugins/` - Individual compiled server plugin files

### Configuration Files
- `src/client/webpack.config.js` - Client bundling
- `src/client/tsconfig.main.json` - Main process TS
- `src/server/tsconfig.json` - Server TS

## Code Commenting Guidelines

- Add a brief comment above every class, exported function, and React component describing its role.
- For helper functions inside components, include one-line comments when behavior is non-trivial (API calls, state transitions, IPC, etc.).
- Prefer concise JSDoc-style blocks when parameters or return values are helpful to future readers.
- Keep inline comments sparing but use them to flag important side effects, security considerations, or non-obvious defaults.
- Avoid restating obvious code; focus on intent and constraints (why this exists, what to watch out for).

## Common Development Tasks

### Add New Component
1. Create `src/client/renderer/src/components/NewComponent.tsx`
2. Add styles in `src/client/renderer/src/styles/components/`
3. Import in parent component

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
  addRoute: (path: string, handler: any) => void;
  getIO: () => Server;
}
```

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
});
```