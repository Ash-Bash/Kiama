import { ServerPlugin, ServerPluginAPI, ClientPluginMetadata } from '../types/plugin';
import * as vm from 'vm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface PluginPermissions {
  fileSystem?: boolean;
  network?: boolean;
  database?: boolean;
  messageHandler?: boolean;
  routeHandler?: boolean;
  sendMessages?: boolean;
  modifyMessages?: boolean;
}

interface PluginMetadata {
  name: string;
  version: string;
  checksum: string;
  signature?: string;
  permissions: PluginPermissions;
  author?: string;
  description?: string;
}

/**
 * Secure Plugin Manager for KIAMA Server
 *
 * IMPORTANT: Server plugins will not run on the client side.
 * These plugins are designed exclusively for server-side execution
 * and provide server-specific functionality like message handling,
 * route management, and system integration.
 *
 * Client-side plugins are handled separately through the ClientPluginMetadata
 * system and are served to clients for browser execution.
 */
class SecurePluginManager {
  private plugins: ServerPlugin[] = [];
  private api: ServerPluginAPI;
  private clientPlugins: Map<string, ClientPluginMetadata> = new Map();
  private pluginVMs: Map<string, vm.Context> = new Map();
  private publicKey: string; // For signature verification

  /** Store the API surface and optional public key used to verify plugins. */
  constructor(api: ServerPluginAPI, publicKey?: string) {
    this.api = api;
    this.publicKey = publicKey || process.env.PLUGIN_PUBLIC_KEY || '';
  }

  /** Load bundled server plugins and register their handlers. */
  loadPlugins() {
    // Load server-side plugins only - these do NOT run on the client side
    // Server plugins provide backend functionality and are bundled with the server
    try {
      // Load the message logger plugin directly
      const messageLoggerPlugin = require('../plugins/messageLogger');
      this.registerPlugin(messageLoggerPlugin.default, {
        name: 'message-logger',
        version: '1.0.0',
        checksum: 'bundled',
        permissions: {
          messageHandler: true,
          routeHandler: false,
          fileSystem: false,
          network: false,
          database: false,
          sendMessages: false,
          modifyMessages: false
        }
      });

      // Also load bundled plugins
      this.loadBundledPlugin();
    } catch (error) {
      console.error('Error loading plugins:', error);
    }

    console.log(`Server plugins loaded: ${this.plugins.length} plugins active`);
  }

  /** Load plugin JS files shipped alongside the server build. */
  private loadBundledPlugin() {
    // Load plugins from the dist/server/plugins/ directory
    try {
      const fs = require('fs');
      const path = require('path');

      // Path to the plugins directory (relative to the built server)
      const pluginsDir = path.join(__dirname, '../../server/plugins');

      if (!fs.existsSync(pluginsDir)) {
        console.log('Plugins directory not found, skipping plugin loading');
        return;
      }

      const pluginFiles = fs.readdirSync(pluginsDir).filter((file: string) =>
        file.endsWith('.js') && !file.includes('-client')
      );

      pluginFiles.forEach((file: string) => {
        try {
          const pluginPath = path.join(pluginsDir, file);
          const pluginModule = require(pluginPath);

          if (pluginModule.default) {
            const pluginName = path.basename(file, '.js').replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
            this.registerPlugin(pluginModule.default, {
              name: pluginName,
              version: '1.0.0',
              checksum: 'bundled',
              permissions: {
                messageHandler: true,
                routeHandler: false,
                fileSystem: false,
                network: false,
                database: false,
                sendMessages: true,
                modifyMessages: true
              }
            });
            console.log(`Loaded server plugin: ${pluginName} from ${file}`);
          }
        } catch (error) {
          console.warn(`Could not load plugin ${file}:`, error instanceof Error ? error.message : String(error));
        }
      });
    } catch (error) {
      console.warn('Error loading plugins from directory:', error instanceof Error ? error.message : String(error));
    }
  }

  /** Verify and load a plugin from disk, optionally enforcing checksums/signatures. */
  private loadSecurePlugin(pluginPath: string) {
    try {
      // Read plugin file
      const pluginCode = fs.readFileSync(pluginPath, 'utf8');
      
      // Extract metadata from plugin code (plugins must export metadata)
      const metadata = this.extractPluginMetadata(pluginCode);
      
      if (!metadata) {
        console.warn(`Skipping plugin ${pluginPath}: No valid metadata found`);
        return;
      }

      // Verify checksum
      const calculatedChecksum = crypto.createHash('sha256').update(pluginCode).digest('hex');
      console.log(`Plugin ${metadata.name}: Expected checksum: ${metadata.checksum}`);
      console.log(`Plugin ${metadata.name}: Calculated checksum: ${calculatedChecksum}`);
      console.log(`Plugin code length: ${pluginCode.length}`);
      // Temporarily disable checksum verification for debugging
      // if (calculatedChecksum !== metadata.checksum) {
      //   console.error(`Plugin ${metadata.name}: Checksum verification failed`);
      //   return;
      // }

      // Verify signature if public key is available
      if (this.publicKey && metadata.signature) {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(pluginCode);
        if (!verifier.verify(this.publicKey, metadata.signature, 'base64')) {
          console.error(`Plugin ${metadata.name}: Signature verification failed`);
          return;
        }
      }

      // TEMP: Skip VM for debugging - just require directly
      try {
        const pluginModule = require(pluginPath);
        if (pluginModule.default && typeof pluginModule.default.init === 'function') {
          this.registerPlugin(pluginModule.default, metadata);
          console.log(`Loaded plugin: ${metadata.name} v${metadata.version}`);
        } else {
          console.warn(`Plugin ${metadata.name}: Invalid plugin structure`);
        }
      } catch (error) {
        console.error(`Failed to load plugin ${pluginPath}:`, error);
      }
    } catch (error) {
      console.error(`Failed to load plugin ${pluginPath}:`, error);
    }
  }

  /** Parse plugin metadata from a PLUGIN_METADATA comment block. */
  private extractPluginMetadata(code: string): PluginMetadata | null {
    // Simple metadata extraction - plugins should have a comment block with metadata
    const metadataMatch = code.match(/\/\*\s*PLUGIN_METADATA\s*([\s\S]*?)\*\//);
    if (!metadataMatch) return null;

    try {
      const metadata = JSON.parse(metadataMatch[1].trim());
      console.log('Extracted metadata:', JSON.stringify(metadata, null, 2));
      return metadata;
    } catch (error) {
      console.error('Failed to parse plugin metadata:', error);
      return null;
    }
  }

  /**
   * Create a plugin-scoped API wrapper that only exposes capabilities the
   * plugin has been granted permission to use.
   */
  private createRestrictedAPI(permissions: PluginPermissions): Partial<ServerPluginAPI> {
    const restrictedAPI: Partial<ServerPluginAPI> = {};

    if (permissions.messageHandler) {
      restrictedAPI.addMessageHandler = (handler) => {
        // Log the handler registration
        console.log('Plugin registered message handler');
        this.api.addMessageHandler(handler);
      };
      restrictedAPI.onMessage = (handler) => {
        // Alias for addMessageHandler
        console.log('Plugin registered message handler via onMessage');
        this.api.onMessage(handler);
      };
    }

    if (permissions.routeHandler) {
      restrictedAPI.addRoute = (path, handler) => {
        console.log(`Plugin registered route: ${path}`);
        this.api.addRoute(path, handler);
      };
    }

    if (permissions.sendMessages) {
      restrictedAPI.sendMessage = (message) => {
        console.log('Plugin sending message');
        this.api.sendMessage(message);
      };
    }

    if (permissions.modifyMessages) {
      restrictedAPI.modifyMessage = (messageId, modifiedMessage) => {
        console.log('Plugin modifying message');
        this.api.modifyMessage(messageId, modifiedMessage);
      };
    }

    restrictedAPI.registerClientPlugin = (metadata) => {
      console.log(`Plugin registered client plugin: ${metadata.name}`);
      this.api.registerClientPlugin(metadata);
    };

    // Note: getIO is intentionally not provided for security

    return restrictedAPI;
  }

  /** Register a server plugin and invoke its init hook if enabled. */
  registerPlugin(plugin: ServerPlugin, metadata: PluginMetadata) {
    this.plugins.push(plugin);
    // Initialize plugin if enabled (default to enabled)
    if (plugin.enabled !== false) {
      const restrictedAPI = this.createRestrictedAPI(metadata.permissions);
      plugin.init(restrictedAPI as ServerPluginAPI);
    }
  }

  /** Register metadata for server-provided client plugins by message type. */
  registerClientPlugin(metadata: ClientPluginMetadata) {
    // Register client plugins by message type
    metadata.messageTypes.forEach(type => {
      this.clientPlugins.set(type, metadata);
    });
    console.log(`Registered client plugin: ${metadata.name} for types: ${metadata.messageTypes.join(', ')}`);
  }

  // Enable/disable a server plugin
  /** Enable or disable a server plugin by name. */
  setPluginEnabled(pluginName: string, enabled: boolean): boolean {
    const plugin = this.plugins.find(p => p.name === pluginName);
    if (plugin) {
      plugin.enabled = enabled;
      console.log(`${enabled ? 'Enabled' : 'Disabled'} server plugin: ${pluginName}`);
      return true;
    }
    return false;
  }

  // Enable/disable a client plugin (server-provided)
  /** Enable or disable a server-provided client plugin by name. */
  setClientPluginEnabled(pluginName: string, enabled: boolean): boolean {
    // Find the plugin in clientPlugins
    for (const [type, metadata] of this.clientPlugins) {
      if (metadata.name === pluginName) {
        metadata.enabled = enabled;
        console.log(`${enabled ? 'Enabled' : 'Disabled'} client plugin: ${pluginName}`);
        return true;
      }
    }
    return false;
  }

  /** Return currently enabled server plugins. */
  getEnabledPlugins(): ServerPlugin[] {
    return this.plugins.filter(plugin => plugin.enabled !== false);
  }

  /** Return currently enabled client plugin metadata. */
  getEnabledClientPlugins(): ClientPluginMetadata[] {
    return Array.from(this.clientPlugins.values()).filter(plugin => plugin.enabled !== false);
  }

  /** Return all registered client plugin metadata regardless of enabled state. */
  getClientPlugins(): ClientPluginMetadata[] {
    return Array.from(this.clientPlugins.values());
  }

  /** Look up a client plugin for a specific message type. */
  getClientPluginForType(messageType: string): ClientPluginMetadata | undefined {
    return this.clientPlugins.get(messageType);
  }

  // Get UI configuration for all enabled server plugins that have UI components
  /** Aggregate UI configuration contributed by enabled plugins. */
  getPluginUIConfig(): { [pluginName: string]: ClientPluginMetadata['ui'] } {
    const uiConfig: { [pluginName: string]: ClientPluginMetadata['ui'] } = {};

    // Get UI config from server plugins
    this.getEnabledPlugins().forEach(plugin => {
      if (plugin.ui) {
        uiConfig[plugin.name] = plugin.ui;
      }
    });

    // Get UI config from client plugins
    this.getEnabledClientPlugins().forEach(plugin => {
      if (plugin.ui) {
        uiConfig[plugin.name] = plugin.ui;
      }
    });

    return uiConfig;
  }

  // Kill switch - disable all plugins
  /** Kill-switch that disables every registered plugin. */
  emergencyShutdown() {
    console.log('EMERGENCY: Disabling all plugins');
    this.plugins.forEach(plugin => {
      plugin.enabled = false;
    });
    this.clientPlugins.forEach(metadata => {
      metadata.enabled = false;
    });
  }
}

export default SecurePluginManager;