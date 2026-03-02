/**
 * Account types for the Kiama client-side local account system.
 *
 * Phase 1: Local accounts only. Cloud accounts and transfers are reserved for a future update.
 */

export interface ServerEntry {
  id: string;
  name: string;
  icon?: string;  // Filename inside the media dir, or a data-URI
  url: string;
}

export interface ServerFolder {
  id: string;
  name: string;
  servers: ServerEntry[];
}

/**
 * A user's server list, mirroring the Discord-style sidebar layout.
 * `servers` holds top-level (unfiled) servers; `folders` holds grouped ones.
 */
export interface ServerList {
  servers: ServerEntry[];
  folders: ServerFolder[];
}

/**
 * A local (client-side) user account.
 * These are never transmitted to or stored on a remote server.
 */
export interface LocalAccount {
  id: string;               // UUID
  username: string;
  passwordHash: string;     // bcrypt hash – never store plain-text
  profilePic?: string;      // Filename in the account's media dir
  /** Per-server nicknames: serverId -> nickname */
  serverNicknames?: Record<string, string>;
  credentials: {
    token?: string;         // Reserved for future cloud auth
  };
  serverList: ServerList;
  isBot: false;
  isServerCreated: false;
  createdAt: string;        // ISO timestamp
  updatedAt: string;        // ISO timestamp
}

/**
 * A bot account stored server-side.
 * These are created by server owners or plugins and are never transferable to cloud.
 */
export interface BotAccount {
  id: string;
  username: string;
  passwordHash: string;
  botType: 'chat' | 'moderator' | 'custom';
  isBot: true;
  isServerCreated: true;
  linkedPlugin?: string;    // Plugin ID that owns this bot, if any
  preconfig: {
    chatStyle?: string;
    autoJoinServers?: string[];
    [key: string]: unknown;
  };
  serverList: ServerList;
  createdAt: string;
  updatedAt: string;
}

export type AnyAccount = LocalAccount | BotAccount;
