# KIAMA Plugin System

KIAMA supports plugins for both client and server to extend functionality.

## Client Plugins

Client plugins allow adding features like link embeds, custom UI components, and message processing.

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

### Example: Link Embed Plugin

See `plugins/linkEmbed.ts` for an example that detects URLs and adds embed components.

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

## Loading Plugins

Plugins are loaded from the `plugins/` folder at startup. For development, add your plugin files there and rebuild.

For production, plugins can be distributed separately and loaded dynamically.