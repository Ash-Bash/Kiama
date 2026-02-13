# KIAMA Plugin System

KIAMA supports plugins for both client and server to extend functionality.

## Client Plugins

Client plugins allow adding features like link embeds, custom UI components, and message processing. Client plugins run entirely in the browser and can modify the user interface, process messages, and add new functionality.

### Types of Client Plugins

- **Built-in Client Plugins**: Bundled with the client application, always available
- **Server-Provided Client Plugins**: Downloaded from servers when connecting, server-controlled

### Plugin Structure

```typescript
import { ClientPlugin } from './types/plugin';

const myPlugin: ClientPlugin = {
  name: 'My Plugin',
  version: '1.0.0',
  init: (api) => {
    // Plugin initialization code
    api.addMessageHandler((message) => {
      // Process messages
      return message;
    });
  }
};

export default myPlugin;
```

### API Methods

- `addMessageHandler(handler)`: Add a function to process incoming messages
- `addUIComponent(component)`: Add a React component to the UI
- `getSocket()`: Get the Socket.IO client instance
- `registerMessageType(type, component)`: Register a component for custom message types

### Example: Message Formatter Plugin

See `src/client/renderer/src/plugins/messageFormatter.ts` for an example client plugin that formats messages with basic markdown-like syntax (**bold**, *italic*).

### Example: Dark Mode Toggle Plugin

See `src/client/renderer/src/plugins/darkModeToggle.tsx` for an example client-only plugin that adds a theme toggle button to the UI and responds to theme commands.

## Server Plugins

Server plugins can add routes, message handlers, and other server-side features.

### Plugin Structure

```typescript
import { ServerPlugin } from './types/plugin';

const myServerPlugin: ServerPlugin = {
  name: 'My Server Plugin',
  version: '1.0.0',
  init: (api) => {
    // Add custom routes
    api.addRoute('/my-endpoint', (req, res) => {
      res.send('Hello from plugin!');
    });
  }
};

export default myServerPlugin;
```

### API Methods

- `addMessageHandler(handler)`: Process messages on the server
- `addRoute(path, handler)`: Add Express routes
- `getIO()`: Get the Socket.IO server instance
- `registerClientPlugin(metadata)`: Register a client plugin for download

## Server-Provided Client Plugins

Server plugins can provide client-side plugins that are downloaded and executed by clients. These plugins are served from the server and can be enabled/disabled by the server administrator.

### Example: Poll Client Plugin

See `src/server/src/plugins/poll-client.js` for an example server-provided client plugin that renders interactive polls in the chat interface.

## Loading Plugins

### Build System

KIAMA uses a modular build system where plugins are compiled separately from the main application code:

- **Client Plugins**: Compiled to individual `.js` files in `dist/client/plugins/` and loaded dynamically at runtime
- **Server Plugins**: Compiled to individual `.js` files in `dist/server/plugins/` and loaded dynamically at runtime
- **Main Application**: Core code is bundled into single files (`bundle.js` for client, `kiama-server-x.x.x.js` for server)

This separation allows plugins to be developed, updated, and distributed independently of the main application.

### Development Workflow

1. **Create Plugin**: Add plugin file to appropriate `plugins/` directory
2. **Build**: Run `npm run build` to compile plugins separately
3. **Test**: Plugins load automatically on application start
4. **Distribute**: Plugin files can be distributed independently

### Runtime Loading

- **Client**: Plugins are loaded using dynamic `require()` calls in the renderer process
- **Server**: Plugins are loaded using `require()` from the compiled plugin directory
- **Hot Reload**: For development, restart the application to load updated plugins