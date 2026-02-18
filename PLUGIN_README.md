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

**Note**: KIAMA now includes a comprehensive theming system that supports both light and dark modes. See the [Theming Guide](#theming) below for details on creating custom themes.

## Theming System

KIAMA supports a JSON-based theming system that allows users to customize the application's appearance with both light and dark mode support.

### Theme Structure

Themes are JSON files located in `src/client/renderer/src/themes/` and are automatically copied to `dist/client/themes/` during build.

```json
{
  "name": "My Custom Theme",
  "modes": {
    "light": {
      "colors": {
        "primary-bg": "#ffffff",
        "secondary-bg": "#f8f9fa",
        "tertiary-bg": "#e3e5e8",
        "text-primary": "#2e3338",
        "text-secondary": "#6d6f72",
        "accent": "#5865f2",
        "accent-hover": "#4752c4",
        "border": "#d1d5db",
        "hover": "#e3e5e8",
        "error": "#dc2626",
        "success": "#16a34a"
      }
    },
    "dark": {
      "colors": {
        "primary-bg": "#36393f",
        "secondary-bg": "#2f3136",
        "tertiary-bg": "#40444b",
        "text-primary": "#dcddde",
        "text-secondary": "#b9bbbe",
        "accent": "#5865f2",
        "accent-hover": "#4752c4",
        "border": "#202225",
        "hover": "#40444b",
        "error": "#f04747",
        "success": "#43b581"
      }
    }
  }
}
```

### Color Properties

- `primary-bg`: Main background color
- `secondary-bg`: Secondary background (modals, panels)
- `tertiary-bg`: Tertiary background (buttons, inputs)
- `text-primary`: Primary text color
- `text-secondary`: Secondary text color (muted text)
- `accent`: Primary accent color (links, active states)
- `accent-hover`: Hover/pressed state for accent elements
- `border`: Border colors
- `hover`: Hover state colors
- `error`: Error state colors
- `success`: Success state colors

### Creating Custom Themes

1. Create a new JSON file in `src/client/renderer/src/themes/`
2. Define both `light` and `dark` modes with complete color schemes
3. Build the client: `npm run build`
4. The theme will be available at runtime

### Theme Switching

Themes are loaded automatically on application start. The system supports switching between light and dark modes within a theme using the `useTheme` hook:

```typescript
import { useTheme } from './components/ThemeProvider';

const MyComponent = () => {
  const { currentMode, setMode } = useTheme();
  
  return (
    <button onClick={() => setMode(currentMode === 'dark' ? 'light' : 'dark')}>
      Toggle Mode
    </button>
  );
};
```

### Default Theme

The default theme (`default.json`) provides Discord-inspired color schemes for both light and dark modes and serves as a reference for custom theme creation.

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