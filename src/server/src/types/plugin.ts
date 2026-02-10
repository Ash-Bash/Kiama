// Server Plugin interface
export interface ServerPlugin {
  name: string;
  version: string;
  enabled?: boolean; // Whether the plugin is enabled
  init: (api: ServerPluginAPI) => void;
}

export interface ServerPluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  addRoute: (path: string, handler: any) => void;
  getIO: () => any;
  registerClientPlugin: (metadata: ClientPluginMetadata) => void;
  // Add more as needed
}

// Client plugin metadata that servers can provide
export interface ClientPluginMetadata {
  name: string;
  version: string;
  messageTypes: string[];
  downloadUrl: string;
  checksum: string; // SHA-256 hash for security
  description?: string;
  author?: string;
  enabled?: boolean; // Server controls enable/disable for server-provided plugins
}