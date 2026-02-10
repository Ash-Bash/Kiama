import { ServerPlugin, ServerPluginAPI, ClientPluginMetadata } from '../types/plugin';

class ServerPluginManager {
  private plugins: ServerPlugin[] = [];
  private api: ServerPluginAPI;
  private clientPlugins: Map<string, ClientPluginMetadata> = new Map(); // messageType -> metadata

  constructor(api: ServerPluginAPI) {
    this.api = api;
  }

  loadPlugins() {
    // Load plugins from plugins/ folder
    try {
      // Load poll plugin
      const pollPlugin = require('../plugins/pollServer');
      this.registerPlugin(pollPlugin.default);

      console.log('Server plugins loaded successfully');
    } catch (error) {
      console.error('Plugin load error:', error);
    }
  }

  registerPlugin(plugin: ServerPlugin) {
    this.plugins.push(plugin);
    // Initialize plugin if enabled (default to enabled)
    if (plugin.enabled !== false) {
      plugin.init(this.api);
    }
  }

  registerClientPlugin(metadata: ClientPluginMetadata) {
    // Register client plugins by message type
    metadata.messageTypes.forEach(type => {
      this.clientPlugins.set(type, metadata);
    });
    console.log(`Registered client plugin: ${metadata.name} for types: ${metadata.messageTypes.join(', ')}`);
  }

  // Enable/disable a server plugin
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

  getEnabledPlugins(): ServerPlugin[] {
    return this.plugins.filter(plugin => plugin.enabled !== false);
  }

  getEnabledClientPlugins(): ClientPluginMetadata[] {
    return Array.from(this.clientPlugins.values()).filter(plugin => plugin.enabled !== false);
  }

  getClientPlugins(): ClientPluginMetadata[] {
    return Array.from(this.clientPlugins.values());
  }

  getClientPluginForType(messageType: string): ClientPluginMetadata | undefined {
    return this.clientPlugins.get(messageType);
  }
}

export default ServerPluginManager;