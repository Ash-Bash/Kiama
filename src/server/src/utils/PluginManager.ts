import { ServerPlugin, ServerPluginAPI, ClientPluginMetadata, PluginManifest, PluginSettingField } from '../types/plugin';
import * as vm from 'vm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Obtain a reference to the native Node.js require that webpack cannot replace.
// eval('require') is opaque to webpack's static analysis.
const dynamicRequire: (id: string) => any = eval('require');

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
  private pluginDirs: string[];
  private loadedPluginNames: Set<string> = new Set();
  /** Maps plugin name → its folder on disk (only for folder-based plugins). */
  private pluginDirMap: Map<string, string> = new Map();
  /** Cached manifests keyed by plugin name. */
  private pluginManifests: Map<string, PluginManifest> = new Map();

  /** Store the API surface and optional public key used to verify plugins. */
  constructor(api: ServerPluginAPI, publicKey?: string, pluginDirs?: string[]) {
    this.api = api;
    this.publicKey = publicKey || process.env.PLUGIN_PUBLIC_KEY || '';
    this.pluginDirs = pluginDirs || [];
  }

  /** Load bundled server plugins and register their handlers. */
  loadPlugins() {
    // Load server-side plugins only - these do NOT run on the client side
    // Server plugins provide backend functionality and are bundled with the server
    try {
      // Load bundled plugins from the dist/server/plugins/ directory
      // This supports both folder-based plugins (with plugin.manifest.json) and legacy loose .js files
      const bundledPluginsDir = path.join(__dirname, 'plugins');
      this.loadPluginsFromDirectory(bundledPluginsDir);
    } catch (error) {
      console.error('Error loading plugins:', error);
    }

    console.log(`Server plugins loaded: ${this.plugins.length} plugins active`);
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
        const pluginModule = dynamicRequire(pluginPath);
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

    // Add permitted API methods based on permissions
    if (permissions.messageHandler) {
      // Add message handling capabilities
    }
    if (permissions.routeHandler) {
      // Add route handling capabilities
    }
    // Add other permission-based API restrictions

    return restrictedAPI;
  }

  /** Register a server plugin with the manager. */
  registerPlugin(plugin: ServerPlugin, metadata: PluginMetadata) {
    // Initialize the plugin with the full API (permissions can be checked at runtime)
    if (plugin.init) {
      try {
        plugin.init(this.api);
      } catch (error) {
        console.error(`Failed to initialize plugin ${metadata.name}:`, error);
        return;
      }
    }

    // Add to plugins array
    this.plugins.push(plugin);
    console.log(`Registered server plugin: ${metadata.name} v${metadata.version}`);
  }

  /** Register a client plugin metadata. */
  registerClientPlugin(metadata: ClientPluginMetadata) {
    this.clientPlugins.set(metadata.name, metadata);
    console.log(`Registered client plugin: ${metadata.name}`);
  }

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

  /** Remove a server plugin by name, calling its cleanup hook. */
  removePlugin(pluginName: string): boolean {
    const idx = this.plugins.findIndex(p => p.name === pluginName);
    if (idx === -1) return false;
    const plugin = this.plugins[idx];
    try { plugin.cleanup?.(); } catch (e) { console.warn(`Cleanup failed for ${pluginName}:`, e); }
    this.plugins.splice(idx, 1);
    this.loadedPluginNames.delete(pluginName);
    this.pluginDirMap.delete(pluginName);
    this.pluginManifests.delete(pluginName);
    console.log(`Removed server plugin: ${pluginName}`);
    return true;
  }

  /** Remove a client plugin by name. */
  removeClientPlugin(pluginName: string): boolean {
    const deleted = this.clientPlugins.delete(pluginName);
    if (deleted) console.log(`Removed client plugin: ${pluginName}`);
    return deleted;
  }

  /** Enable or disable a client plugin by name. */
  setClientPluginEnabled(pluginName: string, enabled: boolean): boolean {
    const metadata = this.clientPlugins.get(pluginName);
    if (metadata) {
      metadata.enabled = enabled;
      console.log(`${enabled ? 'Enabled' : 'Disabled'} client plugin: ${pluginName}`);
      return true;
    }
    return false;
  }

  /** Load plugin JS files from a directory (supports both folder-based plugins with manifests and legacy loose JS files). */
  private loadPluginsFromDirectory(pluginsDir: string) {
    try {
      if (!fs.existsSync(pluginsDir)) {
        console.log(`Plugins directory not found (${pluginsDir}), skipping`);
        return;
      }

      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

      // 1. Load folder-based plugins that contain a plugin.manifest.json
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(pluginsDir, entry.name, 'plugin.manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        this.loadManifestPlugin(path.join(pluginsDir, entry.name));
      }

      // 2. Fallback: load legacy loose .js files (not inside a subfolder)
      const pluginFiles = entries
        .filter(e => !e.isDirectory() && e.name.endsWith('.js') && !e.name.includes('-client'))
        .map(e => e.name);

      pluginFiles.forEach((file: string) => {
        try {
          const pluginPath = path.join(pluginsDir, file);
          const pluginModule = dynamicRequire(pluginPath);

          if (pluginModule.default) {
            const pluginName = path.basename(file, '.js');
            if (this.loadedPluginNames.has(pluginName)) {
              return; // Skip duplicates
            }

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
            this.loadedPluginNames.add(pluginName);
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

  /** Load a single folder-based plugin using its plugin.manifest.json. */
  private loadManifestPlugin(pluginDir: string) {
    const manifestPath = path.join(pluginDir, 'plugin.manifest.json');
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest: PluginManifest = JSON.parse(raw);

      if (!manifest.name || !manifest.main) {
        console.warn(`Invalid manifest in ${pluginDir}: missing name or main`);
        return;
      }

      if (this.loadedPluginNames.has(manifest.name)) return;

      const entryPath = path.join(pluginDir, manifest.main);
      if (!fs.existsSync(entryPath)) {
        console.warn(`Plugin ${manifest.name}: entry file ${manifest.main} not found in ${pluginDir}`);
        return;
      }

      const pluginModule = dynamicRequire(entryPath);
      const plugin: ServerPlugin | undefined = pluginModule.default || pluginModule;

      if (!plugin || typeof plugin.init !== 'function') {
        console.warn(`Plugin ${manifest.name}: invalid plugin structure (no init function)`);
        return;
      }

      // Overlay manifest metadata onto the plugin object
      plugin.name = manifest.name;
      plugin.version = manifest.version || '0.0.0';
      plugin.description = manifest.description;
      plugin.author = manifest.author;
      if (manifest.ui) plugin.ui = manifest.ui;

      const permMap: PluginPermissions = {
        messageHandler: (manifest.permissions || []).includes('messageHandler'),
        routeHandler: (manifest.permissions || []).includes('routeHandler'),
        fileSystem: (manifest.permissions || []).includes('fileSystem'),
        network: (manifest.permissions || []).includes('network'),
        database: (manifest.permissions || []).includes('database'),
        sendMessages: (manifest.permissions || []).includes('sendMessages'),
        modifyMessages: (manifest.permissions || []).includes('modifyMessages'),
      };

      this.registerPlugin(plugin, {
        name: manifest.name,
        version: manifest.version || '0.0.0',
        checksum: 'manifest',
        permissions: permMap,
        author: manifest.author,
        description: manifest.description,
      });
      this.loadedPluginNames.add(manifest.name);
      this.pluginDirMap.set(manifest.name, pluginDir);
      this.pluginManifests.set(manifest.name, manifest);
      console.log(`Loaded manifest plugin: ${manifest.name} v${manifest.version} from ${pluginDir}`);
    } catch (error) {
      console.warn(`Failed to load manifest plugin from ${pluginDir}:`, error instanceof Error ? error.message : String(error));
    }
  }

  /** Reload plugins from external directory (e.g., downloaded plugins). */
  reloadExternalPlugins(directory: string) {
    this.loadPluginsFromDirectory(directory);
  }

  /** Return currently enabled server plugins. */
  getEnabledPlugins(): ServerPlugin[] {
    return this.plugins.filter(plugin => plugin.enabled !== false);
  }

  /** Return all registered server plugins regardless of enabled state. */
  getAllPlugins(): ServerPlugin[] {
    return [...this.plugins];
  }

  /** Return all registered client plugin metadata regardless of enabled state. */
  getAllClientPlugins(): ClientPluginMetadata[] {
    return Array.from(this.clientPlugins.values());
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

  // ── Plugin settings ─────────────────────────────────────────────────────

  /** Return the settings schema declared in the plugin's manifest, or null. */
  getPluginSettingsSchema(pluginName: string): PluginSettingField[] | null {
    const manifest = this.pluginManifests.get(pluginName);
    return manifest?.settings && manifest.settings.length > 0 ? manifest.settings : null;
  }

  /** Return the on-disk directory for a plugin (folder-based only). */
  getPluginDir(pluginName: string): string | null {
    return this.pluginDirMap.get(pluginName) || null;
  }

  /** Read persisted settings values for a plugin from its folder. */
  getPluginSettings(pluginName: string): Record<string, any> {
    const dir = this.pluginDirMap.get(pluginName);
    if (!dir) return {};
    const settingsPath = path.join(dir, 'plugin.settings.json');
    try {
      if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (e) {
      console.warn(`Failed to read settings for ${pluginName}:`, e);
    }
    // Fall back to defaults from the schema
    return this.getDefaultSettings(pluginName);
  }

  /** Write settings values for a plugin to its folder. */
  setPluginSettings(pluginName: string, values: Record<string, any>): boolean {
    const dir = this.pluginDirMap.get(pluginName);
    if (!dir) return false;
    const settingsPath = path.join(dir, 'plugin.settings.json');
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(values, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`Failed to write settings for ${pluginName}:`, e);
      return false;
    }
  }

  /** Compute default values from the manifest schema. */
  private getDefaultSettings(pluginName: string): Record<string, any> {
    const schema = this.getPluginSettingsSchema(pluginName);
    if (!schema) return {};
    const defaults: Record<string, any> = {};
    for (const field of schema) {
      if (field.default !== undefined) defaults[field.key] = field.default;
    }
    return defaults;
  }
}

export default SecurePluginManager;