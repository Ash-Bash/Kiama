# Contributing to KIAMA

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kiama
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Server
   npm run dev:server

   # Terminal 2: Client
   npm run dev:client
   ```

## Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation

3. **Test your changes**
   ```bash
   npm run build
   npm run start:server
   npm run start:client
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

### Code Style Guidelines

- **TypeScript**: Use strict type checking
- **React**: Functional components with hooks
- **Naming**: camelCase for variables/functions, PascalCase for components
- **Imports**: Group imports (React, third-party, local)
- **Comments**: JSDoc for public APIs, inline for complex logic

### File Organization

```
src/
├── client/
│   ├── main/           # Electron main process
│   └── renderer/       # React application
│       ├── src/
│       │   ├── components/    # React components
│       │   ├── styles/        # SCSS styles
│       │   └── plugins/       # Client plugins
│       └── webpack.config.js
└── server/
    ├── src/
    │   ├── plugins/           # Server plugins
    │   └── server.ts          # Main server
    └── tsconfig.json
```

## Adding Features

### New Components
1. Create component in `src/client/renderer/src/components/`
2. Add corresponding styles in `src/client/renderer/src/styles/components/`
3. Export from appropriate index file

### Server Endpoints
1. Add routes in `src/server/src/server.ts`
2. Update Socket.IO event handlers
3. Document in API section

### Plugins
1. Implement plugin interface
2. Place in appropriate plugins directory
3. Export as default export

## Plugin Development

### Plugin Enable/Disable

Plugins support runtime enable/disable functionality:

- **Server Plugins**: Controlled via server API endpoints
- **Client Plugins**: Client-controlled (except server-provided plugins)
- **Server-Provided Plugins**: Server-controlled only

### Testing Plugin Management

When testing plugins, verify:

- [ ] Plugins can be enabled/disabled correctly
- [ ] Server-provided plugins respect server control
- [ ] Disabled plugins don't interfere with message processing
- [ ] Plugin status API returns correct information

## Pull Request Process

1. **Update documentation** - Update README and docs if needed
2. **Test thoroughly** - Ensure all functionality works
3. **Create PR** - Provide clear description of changes
4. **Code review** - Address any feedback

## Architecture Decisions

### Client Architecture
- Electron for cross-platform desktop app
- React for UI components
- SCSS for styling
- Plugin system for extensibility

### Server Architecture
- Node.js + Express for HTTP server
- Socket.IO for real-time communication
- Plugin system for server extensions

### Communication
- Socket.IO for bidirectional real-time messaging
- RESTful endpoints for configuration

## Troubleshooting

### Common Issues
- **Port conflicts**: Change server port in config
- **Build failures**: Clear node_modules and reinstall
- **Plugin loading**: Check plugin export format

### Getting Help
- Check existing issues
- Review documentation in `docs/`
- Test in development mode first

## Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat(auth): add user authentication system

- Implement login/logout functionality
- Add session management
- Update UI components
```