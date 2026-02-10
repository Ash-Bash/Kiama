// Plugin API interface
export interface PluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  addUIComponent: (component: React.ComponentType) => void;
  getSocket: () => any;
  registerMessageType: (type: string, component: React.ComponentType) => void;
  // Add more API methods as needed
}

export interface ClientPlugin {
  name: string;
  version: string;
  messageTypes?: string[]; // Message types this plugin handles
  serverId?: string; // Server-specific plugin
  enabled?: boolean; // Whether the plugin is enabled
  serverProvided?: boolean; // Whether this plugin was provided by a server
  init: (api: PluginAPI) => void;
}

// Server-provided plugin metadata
export interface ServerPluginMetadata {
  name: string;
  version: string;
  messageTypes: string[];
  downloadUrl: string;
  checksum: string; // For security verification
  serverId: string;
  enabled?: boolean; // Server controls enable/disable for server-provided plugins
}

// Message with type information
export interface TypedMessage {
  id: string;
  user: string;
  content: string;
  type: string; // 'text', 'poll', 'embed', etc.
  timestamp: Date;
  data?: any; // Type-specific data
  serverId: string;
  channelId: string;
  embeds?: any[];
}

export interface ChannelSettings {
  nsfw?: boolean;
  slowMode?: number; // Delay between messages in seconds (0 = disabled)
  topic?: string;
  allowPinning?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'announcement';
  sectionId?: string;
  position: number;
  permissions?: ChannelPermissions;
  settings?: ChannelSettings;
  createdAt: Date;
  updatedAt: Date;
  messageCount?: number;
}

export interface ChannelSection {
  id: string;
  name: string;
  position: number;
  permissions?: SectionPermissions;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelPermissions {
  read: boolean;
  write: boolean;
  manage: boolean;
  roles?: string[];
}

export interface SectionPermissions {
  view: boolean;
  manage: boolean;
  roles?: string[];
}