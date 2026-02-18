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

### Plugin Enable/Disable

Plugins can be enabled or disabled at runtime:

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

## Context for Future AI Prompts

- Recent UI intent: keep mobile drawers non-overlapping and simplify controls (no server close button, channel close also hides server on mobile, add-section only in section menu).
- Style intent: server drawer has no shadow on mobile; channel/member drawers keep shadows for separation.
- If changing responsive behavior, preserve current breakpoints (768px, 1100px) unless explicitly requested.

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

**Client:**
- [ ] Electron window opens
- [ ] React app renders
- [ ] Socket connection established
- [ ] Messages send/receive
- [ ] Plugins function properly

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
- No authentication system
- No input validation
- No rate limiting
- Plain text communication

### Future Enhancements
- Implement user authentication
- Add input sanitization
- Enable HTTPS/WSS
- Add rate limiting
- Implement end-to-end encryption

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