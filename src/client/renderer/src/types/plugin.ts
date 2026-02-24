// Plugin API interface
export interface PluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  addUIComponent: (component: React.ComponentType) => void;
  getSocket: () => any;
  registerMessageType: (type: string, component: React.ComponentType) => void;
  addMessageInputButton: (button: MessageInputButton) => void;
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

// Reaction on a message (emoji + list of usernames who reacted)
export interface MessageReaction {
  emoji: string;
  users: string[];
}

// Reference to the message being replied to
export interface ReplyReference {
  id: string;
  user: string;
  content: string;
}

// Message with type information
export interface TypedMessage {
  id: string;
  user: string;
  userRole?: string; // Role name of the message sender (e.g. 'owner', 'mod')
  content: string;
  type: string; // 'text', 'poll', 'embed', etc.
  timestamp: Date;
  data?: any; // Type-specific data
  serverId: string;
  channelId: string;
  embeds?: any[];
  renderedContent?: string; // Sanitized HTML produced by formatter plugins
  reactions?: MessageReaction[]; // Emoji reactions on this message
  replyTo?: ReplyReference; // Reply reference if this message is a reply
}

export interface MessageInputButton {
  id: string;
  icon: string; // FontAwesome icon class
  tooltip: string;
  onClick: () => void;
  activeColor?: string; // Optional active/hover color
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
  serverId: string;
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
  serverId: string;
  position: number;
  permissions?: SectionPermissions;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelPermissions {
  read: boolean;
  write: boolean;
  manage: boolean;
  roles?: string[]; // legacy combined gate
  readRoles?: string[]; // roles allowed to read
  writeRoles?: string[]; // roles allowed to write
}

export interface SectionPermissions {
  view: boolean;
  manage: boolean;
  roles?: string[];
}