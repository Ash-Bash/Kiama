import React from 'react';
import { PluginAPI, ClientPlugin, ServerPluginMetadata, TypedMessage } from '../types/plugin';

class PluginManager {
  private plugins: ClientPlugin[] = [];
  private api: PluginAPI;
  private serverPlugins: Map<string, Map<string, ClientPlugin>> = new Map(); // serverId -> (messageType -> plugin)
  private messageTypeComponents: Map<string, React.ComponentType> = new Map();

  constructor(api: PluginAPI) {
    this.api = api;
  }

  async loadPlugins() {
    // Load global plugins dynamically from built files
    const pluginNames = ['messageFormatter', 'darkModeToggle'];
    const require = (window as any).require;

    for (const name of pluginNames) {
      try {
        const pluginModule = require(`./plugins/${name}.js`);
        this.registerPlugin(pluginModule.default || pluginModule);
      } catch (error) {
        console.error(`Failed to load plugin ${name}:`, error);
      }
    }
  }

  registerPlugin(plugin: ClientPlugin) {
    this.plugins.push(plugin);
    plugin.init(this.api);
  }

  // Download and install server-specific plugin
  async installServerPlugin(metadata: ServerPluginMetadata): Promise<boolean> {
    try {
      // Download plugin code
      const response = await fetch(metadata.downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download plugin: ${response.status}`);
      }

      const pluginCode = await response.text();

      // Verify checksum (simplified - in production use proper crypto)
      const calculatedChecksum = await this.calculateChecksum(pluginCode);
      if (calculatedChecksum !== metadata.checksum) {
        throw new Error('Plugin checksum verification failed');
      }

      // Create plugin from downloaded code
      const pluginModule = await this.loadPluginFromCode(pluginCode);
      const plugin: ClientPlugin = {
        ...pluginModule.default,
        serverId: metadata.serverId,
        messageTypes: metadata.messageTypes,
        enabled: metadata.enabled !== false, // Default to enabled unless explicitly disabled
        serverProvided: true
      };

      // Register server-specific plugin
      if (!this.serverPlugins.has(metadata.serverId)) {
        this.serverPlugins.set(metadata.serverId, new Map());
      }

      const serverPlugins = this.serverPlugins.get(metadata.serverId)!;
      metadata.messageTypes.forEach(type => {
        serverPlugins.set(type, plugin);
      });

      // Initialize plugin if enabled
      if (plugin.enabled) {
        plugin.init(this.api);
      }

      console.log(`Installed server plugin: ${metadata.name} for server ${metadata.serverId}`);
      return true;
    } catch (error) {
      console.error('Failed to install server plugin:', error);
      return false;
    }
  }

  // Enable/disable a plugin
  setPluginEnabled(pluginName: string, enabled: boolean, serverId?: string): boolean {
    if (serverId) {
      // Server-provided plugin - cannot be controlled by client
      console.warn(`Cannot ${enabled ? 'enable' : 'disable'} server-provided plugin: ${pluginName}`);
      return false;
    }

    // Find and update global plugin
    const plugin = this.plugins.find(p => p.name === pluginName);
    if (plugin) {
      if (plugin.serverProvided) {
        console.warn(`Cannot ${enabled ? 'enable' : 'disable'} server-provided plugin: ${pluginName}`);
        return false;
      }

      plugin.enabled = enabled;
      console.log(`${enabled ? 'Enabled' : 'Disabled'} plugin: ${pluginName}`);
      return true;
    }

    return false;
  }

  // Get enabled plugins only
  getEnabledPlugins(): ClientPlugin[] {
    return this.plugins.filter(plugin => plugin.enabled !== false);
  }

  // Get enabled plugin for message type and server
  getEnabledPluginForMessage(message: TypedMessage): ClientPlugin | undefined {
    // Check server-specific plugins first
    const serverPlugins = this.serverPlugins.get(message.serverId);
    if (serverPlugins && serverPlugins.has(message.type)) {
      const plugin = serverPlugins.get(message.type);
      return plugin && plugin.enabled !== false ? plugin : undefined;
    }

    // Fall back to global plugins
    return this.plugins.find(plugin =>
      plugin.messageTypes?.includes(message.type) && plugin.enabled !== false
    );
  }

  // Discover and install plugins for a server
  async discoverServerPlugins(serverUrl: string, serverId: string) {
    try {
      const response = await fetch(`${serverUrl}/client-plugins`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plugins: ${response.status}`);
      }

      const data = await response.json();
      if (data.serverId !== serverId) {
        console.warn('Server ID mismatch');
        return;
      }

      // Install each plugin
      for (const metadata of data.plugins) {
        await this.installServerPlugin(metadata);
      }
    } catch (error) {
      console.error('Failed to discover server plugins:', error);
    }
  }

  // Get plugin for message type and server
  getPluginForMessage(message: TypedMessage): ClientPlugin | undefined {
    // Check server-specific plugins first
    const serverPlugins = this.serverPlugins.get(message.serverId);
    if (serverPlugins && serverPlugins.has(message.type)) {
      return serverPlugins.get(message.type);
    }

    // Fall back to global plugins
    return this.plugins.find(plugin =>
      plugin.messageTypes?.includes(message.type)
    );
  }

  // Register message type component
  registerMessageTypeComponent(type: string, component: React.ComponentType) {
    this.messageTypeComponents.set(type, component);
  }

  // Get component for message type
  getMessageTypeComponent(type: string): React.ComponentType | undefined {
    return this.messageTypeComponents.get(type);
  }

  getPlugins() {
    return this.plugins;
  }

  private async calculateChecksum(code: string): Promise<string> {
    // Simplified checksum - in production use crypto.subtle.digest
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private async loadPluginFromCode(code: string): Promise<any> {
    // For now, create a simple module from the code
    // In production, this would need proper module loading
    try {
      // Execute the code in a sandboxed environment
      const func = new Function('React', 'console', code + '; return pollClientPlugin;');
      const plugin = func(React, console);
      return { default: plugin };
    } catch (error) {
      console.error('Failed to load plugin code:', error);
      throw error;
    }
  }
}

export default PluginManager;