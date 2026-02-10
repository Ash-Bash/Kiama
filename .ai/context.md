# KIAMA AI Context

This document provides essential context for AI assistants working on the KIAMA codebase.

## Project Overview

KIAMA is a decentralized Discord-like chat application with:
- Self-hosted servers
- Electron desktop client
- Plugin architecture
- Real-time messaging via Socket.IO

## Key Architecture Decisions

### Build System
- **Server**: TypeScript → JavaScript (outputs to `dist/server/`)
- **Client**: Dual build process:
  - Main process: TypeScript → JavaScript (outputs to `dist/client/main.js`)
  - Renderer: React/TypeScript → Webpack bundle (outputs to `dist/client/`)

### File Structure Rationale
- All built files go to root `dist/` for easy deployment
- Source code stays in `src/` for development
- Client has separate main/renderer processes due to Electron architecture

## Common Patterns

### Component Structure
```typescript
interface ComponentProps {
  // Props interface
}

const ComponentName: React.FC<ComponentProps> = ({ prop }) => {
  // Component logic
  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  );
};
```

### Plugin Interface
```typescript
interface ClientPlugin {
  name: string;
  version: string;
  init: (api: PluginAPI) => void;
}
```

### Server Class Pattern
```typescript
export class Server {
  constructor(port: number, mode: 'public' | 'private') {
    // Initialization
  }

  private setupRoutes() {
    // Express routes
  }

  private setupSocket() {
    // Socket.IO setup
  }
}
```

## Development Workflow

1. **Setup**: `npm run install:all`
2. **Build**: `npm run build` (or individual builds)
3. **Run**: `npm run start:server` + `npm run start:client`
4. **Develop**: Use `npm run dev:*` scripts for hot reload

## Critical Files

- `src/client/main/main.ts` - Electron entry point
- `src/client/renderer/src/App.tsx` - React root component
- `src/server/src/server.ts` - Main server class
- `src/server/src/index.ts` - CLI entry point
- `package.json` - Root scripts and dependencies

## Plugin System

- Client plugins in `src/client/renderer/src/plugins/`
- Server plugins in `src/server/src/plugins/`
- Both use similar API interfaces
- Plugins loaded at startup

## Socket Events

Common events:
- `message` - Chat messages
- `user_join` - User joins channel
- `user_leave` - User leaves channel

## Styling

- SCSS with component-specific styles
- Located in `src/client/renderer/src/styles/`
- Follows BEM-like naming convention

## Error Patterns

- Path resolution issues (common with relative paths)
- Module not found (dependency issues)
- Socket connection failures
- Plugin loading errors

## Testing

Currently manual testing only. Key test scenarios:
- Server startup and CLI
- Client connection and messaging
- Plugin loading and functionality
- Build process completion

## Deployment

- Server: Copy `dist/server/` and run `node index.js`
- Client: Copy `dist/client/` and run with Electron

## Future Enhancements

- End-to-end encryption
- Voice/video chat UI
- User authentication
- Database integration
- Automated testing
- CI/CD pipeline