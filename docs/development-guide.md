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
- Layout created on startup: `configs/`, `plugins/`, `uploads/`, `logs/`, `secrets/` under the data root.
- Persisted config lives at `<data-root>/configs/<serverId>.json` (override with `KIAMA_CONFIG_PATH`) and stores sections/channels/roles plus a hashed admin token.
- Admin token: set `KIAMA_ADMIN_TOKEN` to supply your own; otherwise the server generates one, writes it to `<data-root>/secrets/admin.token` with mode 600, and uses it for admin endpoints and CLI commands.

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