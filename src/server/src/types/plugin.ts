// Server Plugin interface
// NOTE: Server plugins run only on the server side and are NOT executed on clients
export interface ServerPlugin {
  name: string;
  version: string;
  description?: string;          // Optional description
  author?: string;               // Optional author
  permissions?: string[];        // Required permissions
  ui?: PluginUIConfig;           // UI configuration for client integration
  enabled?: boolean;             // Whether the plugin is enabled
  init: (api: ServerPluginAPI) => void;
  cleanup?: () => void;          // Optional cleanup function
}

export interface ServerPluginAPI {
  addMessageHandler: (handler: (message: any) => any) => void;
  addRoute: (path: string, handler: any) => void;
  getIO: () => any;
  registerClientPlugin: (metadata: ClientPluginMetadata) => void;
  onMessage: (handler: (message: any) => void) => void;  // Alias for addMessageHandler
  sendMessage: (message: any) => void;
  modifyMessage: (messageId: string, modifiedMessage: any) => void;
  // Add more as needed
}

// Plugin categories for UI organization
export type PluginCategory =
  | 'helper'           // General helper tools
  | 'ai'               // AI-powered assistants
  | 'tools'            // Productivity and utility tools
  | 'enhancement'      // Message and content enhancement
  | 'message-type'     // Message type plugins (polls, embeds, etc.)
  | 'moderation'       // Moderation tools
  | 'entertainment'    // Games, fun features
  | 'productivity'     // Productivity tools
  | 'communication'    // Communication enhancements
  | 'custom';          // Custom category

// UI configuration for menu items
export interface PluginMenuItem {
  id: string;                    // Unique identifier for the menu item
  title: string;                 // Display title in the menu
  icon: string;                  // Icon identifier (emoji, icon name, or URL)
  description?: string;          // Optional description for tooltips
  shortcut?: string;             // Optional keyboard shortcut
  group?: string;                // Optional group name for menu organization
  order?: number;                // Optional display order (lower numbers first)
}

// UI display configuration
export interface PluginUIConfig {
  category: PluginCategory;      // Plugin category for UI organization
  menuItems?: PluginMenuItem[];  // Menu items this plugin provides
  toolbar?: {
    position: 'left' | 'right';  // Toolbar position
    items?: PluginMenuItem[];    // Toolbar items
  };
  sidebar?: {
    position: 'left' | 'right';  // Sidebar position
    title?: string;              // Sidebar title
    items?: PluginMenuItem[];    // Sidebar items
  };
  contextMenu?: boolean;         // Whether to add to context menus
  badge?: string;                // Optional badge text (e.g., "NEW", "BETA")
  color?: string;                // Optional theme color
  priority?: number;             // Display priority (higher = more prominent)
}

// Client plugin metadata that servers can provide
// NOTE: Client plugins are downloaded and executed by clients in their browsers
export interface ClientPluginMetadata {
  name: string;
  version: string;
  messageTypes: string[];
  downloadUrl: string;
  checksum: string; // SHA-256 hash for security
  description?: string;
  author?: string;
  enabled?: boolean; // Server controls enable/disable for server-provided plugins

  // UI Configuration - makes plugins flexible from a UI standpoint
  ui?: PluginUIConfig;
}