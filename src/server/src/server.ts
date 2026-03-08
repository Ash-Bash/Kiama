import express, { RequestHandler } from 'express';
import { Server as SocketServer } from 'socket.io';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as unzipper from 'unzipper';
import Database from 'better-sqlite3';
import SecurePluginManager from './utils/PluginManager';
import { ClientPluginMetadata } from './types/plugin';
import { BackupManager, BackupSchedule } from './utils/BackupManager';
import { BotAccountManager } from './utils/BotAccountManager';

export interface TypedMessage {
  id: string;
  user: string;
  userRole?: string; // Role name of the message sender
  content: string;
  renderedContent?: string; // Pre-rendered HTML with emotes
  type: string;
  timestamp: Date;
  data?: any;
  serverId: string;
  channelId: string;
  replyTo?: { id: string; user: string; content: string };
  pinned?: boolean;
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
  roles?: string[];      // legacy combined gate
  readRoles?: string[];  // roles that can view/read the channel (empty = everyone)
  writeRoles?: string[]; // roles that can write in the channel (empty = everyone)
}

export interface SectionPermissions {
  view: boolean;
  manage: boolean;
  roles?: string[];        // legacy combined gate
  viewRoles?: string[];    // roles that can see this section (empty = everyone)
  manageRoles?: string[];  // roles that can manage this section
}

export interface SystemStats {
  cpu: {
    usage: number; // Percentage
    cores: number;
    model: string;
  };
  memory: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    usage: number; // Percentage
  };
  storage: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    usage: number; // Percentage
  };
  uptime: number; // Seconds
  loadAverage: number[]; // 1, 5, 15 minute averages
}

export interface RolePermissions {
  manageServer?: boolean;
  manageChannels?: boolean;
  manageRoles?: boolean;
  viewChannels?: boolean;
  sendMessages?: boolean;
  manageMessages?: boolean;
  manageEmotes?: boolean;
}

export interface Role {
  id: string;
  name: string;
  color?: string;
  permissions: RolePermissions;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitialServerConfig {
  name: string;
  ownerUsername?: string; // Username of the server owner account
  ownerAccountId?: string; // Optional account ID of the server owner
  allowClaimOwnership?: boolean; // whether clients should prompt to claim ownership when no owner exists
  userRoles?: Record<string, string>; // username → role name
  sections?: Array<Pick<ChannelSection, 'id' | 'name' | 'position' | 'permissions'>>;
  channels?: Array<Pick<Channel, 'id' | 'name' | 'type' | 'sectionId' | 'position' | 'settings' | 'permissions'>>;
  roles?: Array<Pick<Role, 'id' | 'name' | 'color' | 'permissions'>>;
}

export interface PersistedServerConfig {
  serverId: string;
  name: string;
  mode: 'public' | 'private';
  dataRoot: string;
  configPath: string;
  adminTokenHash?: string;
  createdAt: string;
  updatedAt: string;
  sections: ChannelSection[];
  channels: Channel[];
  roles: Role[];
  initialConfig?: InitialServerConfig;
}

export class Server {
  private app: express.Application;
  private server: http.Server;
  private io: SocketServer;
  private port: number;
  private mode: 'public' | 'private';
  private serverId: string;
  private serverName: string;
  private adminToken: string;
  private dataRoot: string;
  private configFilePath: string;
  private whitelist: Set<string> = new Set();
  private blacklist: Set<string> = new Set();
  private pluginManager: SecurePluginManager;
  private emotes: Map<string, { filename: string; uploadedBy?: string }> = new Map(); // name -> emote data
  private channels: Map<string, Channel> = new Map();
  private sections: Map<string, ChannelSection> = new Map();
  private roles: Map<string, Role> = new Map();
  private messages: Map<string, TypedMessage[]> = new Map(); // channelId -> messages[]
  private messageHandlers: ((message: any) => any)[] = []; // Plugin message handlers
  private userRoles: Map<string, string> = new Map();        // username → role name
  private connectedUsers: Map<string, { username: string; accountId?: string }> = new Map(); // socketId → { username, accountId }
  private systemStats: SystemStats | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private db: Database.Database;
  private dbPath: string;
  private dbEncPath: string;
  private dbEncrypted: boolean = false;
  private dbPassphrase?: string;
  private e2eeEnabled = false;
  private backupManager: BackupManager;
  private botAccountManager: BotAccountManager;
  private lastMessageAt: Map<string, Map<string, number>> = new Map(); // channelId -> (username -> timestamp ms)
  private initialConfigPath: string | undefined;
  private ownerUsername: string = '';
  private ownerAccountId: string = '';
  private allowClaimOwnership: boolean = true;
  private serverPasswordHash: string = '';

  constructor(port: number, mode: 'public' | 'private', serverId?: string, adminToken?: string, initialConfig?: InitialServerConfig, initialConfigPath?: string) {
    this.port = port;
    this.mode = mode;

    // Determine data root first to locate persisted server-id
    this.dataRoot = process.env.KIAMA_DATA_DIR || path.join(__dirname, 'data');

    // Persist/restore server ID so ownership survives across restarts
    const serverIdPath = path.join(this.dataRoot, 'server-id');
    if (serverId) {
      this.serverId = serverId;
    } else if (fs.existsSync(serverIdPath)) {
      const storedId = fs.readFileSync(serverIdPath, 'utf-8').trim();
      this.serverId = storedId || uuidv4();
      console.log(`Restored serverId from ${serverIdPath}: ${this.serverId}`);
    } else {
      this.serverId = uuidv4();
      console.log(`Generated new serverId: ${this.serverId}`);
    }
    // Ensure server-id file exists so future restarts reuse the same ID
    try {
      if (!fs.existsSync(this.dataRoot)) fs.mkdirSync(this.dataRoot, { recursive: true });
      fs.writeFileSync(serverIdPath, this.serverId, 'utf-8');
    } catch (err) {
      console.warn('Failed to persist server-id file:', err);
    }

    this.serverName = initialConfig?.name || 'KIAMA Server';
    this.ownerUsername = initialConfig?.ownerUsername ?? '';
    this.ownerAccountId = initialConfig?.ownerAccountId ?? '';
    this.allowClaimOwnership = initialConfig?.allowClaimOwnership ?? true;
    this.adminToken = (adminToken || process.env.KIAMA_ADMIN_TOKEN || '').toString().trim();
    this.configFilePath = process.env.KIAMA_CONFIG_PATH || path.join(this.dataRoot, 'configs', `${this.serverId}.json`);
    this.initialConfigPath = initialConfigPath;

    // Auto-detect server.config.json sitting next to the bundle (dist/server/)
    // when no --config flag was passed. This is the primary persistence target.
    if (!this.initialConfigPath) {
      const autoPath = path.join(__dirname, 'server.config.json');
      if (fs.existsSync(autoPath)) {
        this.initialConfigPath = autoPath;
        console.log(`Auto-detected config: ${autoPath}`);
      }
    }
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketServer(this.server);
    this.pluginManager = new SecurePluginManager({
      addMessageHandler: (handler) => {
        // Store handlers with logging
        console.log('Plugin registered message handler');
        this.messageHandlers.push(handler);
      },
      addRoute: (path, handler) => {
        console.log(`Plugin registered route: ${path}`);
        this.app.use(path, handler);
      },
      getIO: () => {
        // Intentionally not provided for security
        throw new Error('Direct socket.io access not allowed for security');
      },
      registerClientPlugin: (metadata: ClientPluginMetadata) => {
        this.pluginManager.registerClientPlugin(metadata);
      },
      onMessage: (handler) => {
        // Alias for addMessageHandler
        console.log('Plugin registered message handler via onMessage');
        this.messageHandlers.push(handler);
      },
      sendMessage: (message) => {
        // Send message via socket.io
        console.log('Plugin sending message:', message);
        this.io.to(message.channelId).emit('message', message);
        // Store in DB
        this.storeMessage(message);
      },
      modifyMessage: (messageId, modifiedMessage) => {
        // Find and modify message
        console.log('Plugin modifying message:', messageId);
        // Update in DB
        this.updateMessage(messageId, modifiedMessage);
        // Emit update to clients
        this.io.emit('message-update', { messageId, modifiedMessage });
      }
    }, undefined, [path.join(__dirname, 'plugins'), path.join(this.dataRoot, 'plugins')]);

    this.ensureDataLayout();
    this.dbPath = path.join(this.dataRoot, 'kiama.db');
    this.dbEncPath = path.join(this.dataRoot, 'kiama.db.enc');

    // If an encrypted DB exists, prefer it. Decrypt using environment-provided key
    // or fail startup so admin can supply the passphrase. If no encrypted DB
    // exists, open the plain DB.
    const envKey = process.env.KIAMA_DB_KEY;
    if (fs.existsSync(this.dbEncPath) && !fs.existsSync(this.dbPath)) {
      if (!envKey) {
        throw new Error('Encrypted database detected but KIAMA_DB_KEY is not set. Set KIAMA_DB_KEY or remove the encrypted DB.');
      }
      try {
        this.decryptFile(this.dbEncPath, this.dbPath, envKey);
        this.dbEncrypted = true;
        this.dbPassphrase = envKey;
      } catch (e) {
        console.error('Failed to decrypt DB with provided KIAMA_DB_KEY:', e);
        throw e;
      }
    }

    this.db = new Database(this.dbPath);
    this.initializeDatabase();
    // Load persisted layout from DB if present (migrates from JSON to DB storage)
    try {
      this.loadStateFromDB();
    } catch (e) {
      console.warn('Failed to load state from DB:', e);
    }
    this.ensureEmotesDir();
    this.backupManager = new BackupManager(this.dataRoot, this.serverName || 'KIAMA_Server');
    this.botAccountManager = new BotAccountManager(this.dataRoot);
    this.ensureAdminToken();
    this.initializeServerState(initialConfig);
    // Migrate any in-memory userRoles into the DB so members are persisted.
    try {
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO members (serverId, username, nickname, role, status) VALUES (?, ?, ?, ?, ?)
      `);
      const updateStatus = this.db.prepare(`
        UPDATE members SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE serverId = ? AND username = ?
      `);
      for (const [username, role] of this.userRoles.entries()) {
        const status = Array.from(this.connectedUsers.values()).some(u => u.username === username) ? 'online' : 'offline';
        insert.run(this.serverId, username, null, role, status);
        updateStatus.run(role, status, this.serverId, username);
      }
    } catch (e) {
      console.warn('Failed to migrate user roles into DB:', e);
    }
    this.setupRoutes();
    this.setupSocket();
    this.pluginManager.loadPlugins();
    this.startSystemMonitoring();
    this.backupManager.startScheduler();

    // Persist effective configuration and layout after initialization
    this.persistConfigFile(initialConfig);
  }

  private ensureEmotesDir() {
    const emotesDir = path.join(this.dataRoot, 'emotes');
    if (!fs.existsSync(emotesDir)) {
      fs.mkdirSync(emotesDir, { recursive: true });
    }
  }

  private ensureDataLayout() {
    const dirs = [
      this.dataRoot,
      path.join(this.dataRoot, 'configs'),
      path.join(this.dataRoot, 'plugins'),
      path.join(this.dataRoot, 'uploads'),
      path.join(this.dataRoot, 'logs'),
      path.join(this.dataRoot, 'secrets'),
      path.join(this.dataRoot, 'media'),
      path.join(this.dataRoot, 'emotes')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channelId TEXT,
        user TEXT,
        userRole TEXT,
        content TEXT,
        type TEXT,
        timestamp TEXT,
        data TEXT,
        serverId TEXT,
        mediaPath TEXT,
        replyToId TEXT,
        replyToUser TEXT,
        replyToContent TEXT
        ,pinned INTEGER DEFAULT 0
      );
    `);
    // Ensure older databases get new reply columns added via ALTER TABLE
    try {
      const cols: any[] = this.db.prepare(`PRAGMA table_info('messages')`).all();
      const existing = new Set(cols.map(c => c.name));
      const additions: Array<{ name: string; def: string }> = [];
      if (!existing.has('replyToId')) additions.push({ name: 'replyToId', def: 'TEXT' });
      if (!existing.has('replyToUser')) additions.push({ name: 'replyToUser', def: 'TEXT' });
      if (!existing.has('replyToContent')) additions.push({ name: 'replyToContent', def: 'TEXT' });
      if (!existing.has('pinned')) additions.push({ name: 'pinned', def: 'INTEGER DEFAULT 0' });
      for (const col of additions) {
        try {
          this.db.exec(`ALTER TABLE messages ADD COLUMN ${col.name} ${col.def}`);
          console.log(`Added column ${col.name} to messages table`);
        } catch (e) {
          console.warn(`Failed to add column ${col.name}:`, e);
        }
      }
    } catch (e) {
      console.warn('Failed to migrate messages table for reply columns:', e);
    }
    // Members table stores per-server member records including role and nickname
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS members (
        serverId TEXT,
        username TEXT,
        nickname TEXT,
        role TEXT,
        status TEXT,
        PRIMARY KEY (serverId, username)
      );
    `);

    // Roles table (optional storage for server roles)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        serverId TEXT,
        roleId TEXT,
        name TEXT,
        color TEXT,
        permissions TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        PRIMARY KEY (serverId, roleId)
      );
    `);

    // Ensure older roles table has createdAt/updatedAt columns
    try {
      const cols: any[] = this.db.prepare(`PRAGMA table_info('roles')`).all();
      const names = new Set(cols.map(c => c.name));
      if (!names.has('createdAt')) {
        try {
          this.db.exec(`ALTER TABLE roles ADD COLUMN createdAt TEXT`);
          console.log('Added createdAt column to roles table');
        } catch (e) {
          console.warn('Failed to add createdAt to roles table:', e);
        }
      }
      if (!names.has('updatedAt')) {
        try {
          this.db.exec(`ALTER TABLE roles ADD COLUMN updatedAt TEXT`);
          console.log('Added updatedAt column to roles table');
        } catch (e) {
          console.warn('Failed to add updatedAt to roles table:', e);
        }
      }
    } catch (e) {
      // ignore
    }

    // Servers table: stores server-level metadata including owner info
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        serverId TEXT PRIMARY KEY,
        name TEXT,
        mode TEXT,
        dataRoot TEXT,
        configPath TEXT,
        adminTokenHash TEXT,
        ownerUsername TEXT,
        ownerAccountId TEXT,
        allowClaimOwnership INTEGER DEFAULT 1,
        dbEncrypted INTEGER DEFAULT 0,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);

    // Ensure older servers table gets dbEncrypted column if missing
    try {
      const cols: any[] = this.db.prepare(`PRAGMA table_info('servers')`).all();
      const names = new Set(cols.map(c => c.name));
      if (!names.has('dbEncrypted')) {
        try {
          this.db.exec(`ALTER TABLE servers ADD COLUMN dbEncrypted INTEGER DEFAULT 0`);
          console.log('Added dbEncrypted column to servers table');
        } catch (e) {
          console.warn('Failed to add dbEncrypted column to servers table:', e);
        }
      }
      if (!names.has('serverPasswordHash')) {
        try {
          this.db.exec(`ALTER TABLE servers ADD COLUMN serverPasswordHash TEXT`);
          console.log('Added serverPasswordHash column to servers table');
        } catch (e) {
          console.warn('Failed to add serverPasswordHash column to servers table:', e);
        }
      }
    } catch (e) {
      // ignore
    }

    // Sections table: channel sections
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sections (
        serverId TEXT,
        sectionId TEXT,
        name TEXT,
        position INTEGER,
        permissions TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        PRIMARY KEY (serverId, sectionId)
      );
    `);

    // Channels table: stores channel definitions (permissions/settings as JSON)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        serverId TEXT,
        channelId TEXT,
        name TEXT,
        type TEXT,
        sectionId TEXT,
        position INTEGER,
        permissions TEXT,
        settings TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        PRIMARY KEY (serverId, channelId)
      );
    `);

    // Emotes table: stores server-specific emotes mapping name -> filename
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emotes (
        serverId TEXT,
        name TEXT,
        filename TEXT,
        uploadedBy TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        PRIMARY KEY (serverId, name)
      );
    `);
    // Add uploadedBy column if it doesn't exist (migration)
    try {
      this.db.exec(`ALTER TABLE emotes ADD COLUMN uploadedBy TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Load persisted roles, sections, channels and server metadata from DB
  private loadStateFromDB() {
    try {
      const srv = this.db.prepare('SELECT * FROM servers WHERE serverId = ?').get(this.serverId) as any;
      if (srv) {
        this.serverName = srv.name || this.serverName;
        this.mode = (srv.mode as 'public' | 'private') || this.mode;
        this.ownerUsername = srv.ownerUsername || this.ownerUsername;
        this.ownerAccountId = srv.ownerAccountId || this.ownerAccountId;
        this.allowClaimOwnership = srv.allowClaimOwnership === 0 ? false : true;
        this.dbEncrypted = srv.dbEncrypted === 1 ? true : false;
        this.serverPasswordHash = srv.serverPasswordHash || '';
      }

      // Load roles
      const roleRows = this.db.prepare('SELECT * FROM roles WHERE serverId = ?').all(this.serverId) as any[];
      if (roleRows && roleRows.length > 0) {
        this.roles.clear();
        for (const r of roleRows) {
          try {
            const perms = r.permissions ? JSON.parse(r.permissions) : {};
            const role: Role = {
              id: r.roleId,
              name: r.name,
              color: r.color,
              permissions: perms,
              createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
              updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
            };
            this.roles.set(role.id, role);
          } catch (e) {
            console.warn('Failed to parse role permissions for', r.roleId, e);
          }
        }
      }

      // Load sections
      const secRows = this.db.prepare('SELECT * FROM sections WHERE serverId = ?').all(this.serverId) as any[];
      if (secRows && secRows.length > 0) {
        this.sections.clear();
        for (const s of secRows) {
          try {
            const perms = s.permissions ? JSON.parse(s.permissions) : undefined;
            const section: ChannelSection = {
              id: s.sectionId,
              name: s.name,
              position: s.position ?? 0,
              permissions: perms,
              createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
              updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
            };
            this.sections.set(section.id, section);
          } catch (e) {
            console.warn('Failed to parse section permissions for', s.sectionId, e);
          }
        }
      }

      // Load channels
      const chRows = this.db.prepare('SELECT * FROM channels WHERE serverId = ?').all(this.serverId) as any[];
      if (chRows && chRows.length > 0) {
        this.channels.clear();
        for (const c of chRows) {
          try {
            const perms = c.permissions ? JSON.parse(c.permissions) : undefined;
            const settings = c.settings ? JSON.parse(c.settings) : undefined;
            const channel: Channel = {
              id: c.channelId,
              name: c.name,
              type: (c.type as any) || 'text',
              sectionId: c.sectionId || undefined,
              position: c.position ?? 0,
              permissions: perms,
              settings: settings,
              createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
              updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
            };
            this.channels.set(channel.id, channel);
            this.messages.set(channel.id, []);
          } catch (e) {
            console.warn('Failed to parse channel permissions/settings for', c.channelId, e);
          }
        }
      }

      // Load user→role mappings from the members table so role assignments survive restarts
      try {
        const memberRows = this.db.prepare('SELECT username, role FROM members WHERE serverId = ? AND role IS NOT NULL').all(this.serverId) as any[];
        if (memberRows && memberRows.length > 0) {
          for (const m of memberRows) {
            if (m.username && m.role) {
              this.userRoles.set(m.username, m.role);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load user roles from members table:', e);
      }

      // Load emotes
      try {
        const emRows = this.db.prepare('SELECT * FROM emotes WHERE serverId = ?').all(this.serverId) as any[];
        console.log('[loadStateFromDB] Loading emotes for serverId:', this.serverId, '- found:', emRows?.length || 0, 'rows');
        if (emRows && emRows.length > 0) {
          this.emotes.clear();
          for (const er of emRows) {
            console.log('[loadStateFromDB] Loaded emote:', er.name, '->', er.filename);
            this.emotes.set(er.name, { filename: er.filename, uploadedBy: er.uploadedBy || undefined });
          }
        }
        console.log('[loadStateFromDB] Final emotes map size:', this.emotes.size);
      } catch (e) {
        console.warn('Failed to load emotes from DB:', e);
      }
    } catch (e) {
      console.warn('loadStateFromDB failed:', e);
    }
  }

  // Persist current roles, sections, channels and server metadata into DB
  private persistStateToDB() {
    try {
      const upsertServer = this.db.prepare(`
        INSERT INTO servers (serverId, name, mode, dataRoot, configPath, adminTokenHash, ownerUsername, ownerAccountId, allowClaimOwnership, dbEncrypted, serverPasswordHash, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(serverId) DO UPDATE SET
          name=excluded.name,
          mode=excluded.mode,
          dataRoot=excluded.dataRoot,
          configPath=excluded.configPath,
          adminTokenHash=excluded.adminTokenHash,
          ownerUsername=excluded.ownerUsername,
          ownerAccountId=excluded.ownerAccountId,
          allowClaimOwnership=excluded.allowClaimOwnership,
          dbEncrypted=excluded.dbEncrypted,
          serverPasswordHash=excluded.serverPasswordHash,
          updatedAt=excluded.updatedAt
      `);
      const now = new Date().toISOString();
      upsertServer.run(this.serverId, this.serverName, this.mode, this.dataRoot, this.configFilePath, this.adminToken ? this.hashAdminToken(this.adminToken) : null, this.ownerUsername || null, this.ownerAccountId || null, this.allowClaimOwnership ? 1 : 0, this.dbEncrypted ? 1 : 0, this.serverPasswordHash || null, now, now);

      const insertRole = this.db.prepare(`
        INSERT INTO roles (serverId, roleId, name, color, permissions, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(serverId, roleId) DO UPDATE SET
          name=excluded.name,
          color=excluded.color,
          permissions=excluded.permissions,
          updatedAt=excluded.updatedAt
      `);
      const deleteRoles = this.db.prepare(`DELETE FROM roles WHERE serverId = ?`);
      deleteRoles.run(this.serverId);
      for (const r of this.roles.values()) {
        insertRole.run(this.serverId, r.id, r.name, r.color || null, JSON.stringify(r.permissions || {}), r.createdAt.toISOString(), r.updatedAt.toISOString());
      }

      const insertSection = this.db.prepare(`
        INSERT INTO sections (serverId, sectionId, name, position, permissions, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(serverId, sectionId) DO UPDATE SET
          name=excluded.name,
          position=excluded.position,
          permissions=excluded.permissions,
          updatedAt=excluded.updatedAt
      `);
      const deleteSections = this.db.prepare(`DELETE FROM sections WHERE serverId = ?`);
      deleteSections.run(this.serverId);
      for (const s of this.sections.values()) {
        insertSection.run(this.serverId, s.id, s.name, s.position ?? 0, s.permissions ? JSON.stringify(s.permissions) : null, s.createdAt.toISOString(), s.updatedAt.toISOString());
      }

      const insertChannel = this.db.prepare(`
        INSERT INTO channels (serverId, channelId, name, type, sectionId, position, permissions, settings, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(serverId, channelId) DO UPDATE SET
          name=excluded.name,
          type=excluded.type,
          sectionId=excluded.sectionId,
          position=excluded.position,
          permissions=excluded.permissions,
          settings=excluded.settings,
          updatedAt=excluded.updatedAt
      `);
      const deleteChannels = this.db.prepare(`DELETE FROM channels WHERE serverId = ?`);
      deleteChannels.run(this.serverId);
      for (const c of this.channels.values()) {
        insertChannel.run(this.serverId, c.id, c.name, c.type, c.sectionId || null, c.position ?? 0, c.permissions ? JSON.stringify(c.permissions) : null, c.settings ? JSON.stringify(c.settings) : null, c.createdAt.toISOString(), c.updatedAt.toISOString());
      }

      // Persist emotes table for this server
      try {
        const deleteEmotes = this.db.prepare(`DELETE FROM emotes WHERE serverId = ?`);
        deleteEmotes.run(this.serverId);
        const insertEmote = this.db.prepare(`INSERT INTO emotes (serverId, name, filename, uploadedBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
        const nowIso = new Date().toISOString();
        for (const [name, data] of this.emotes.entries()) {
          insertEmote.run(this.serverId, name, data.filename, data.uploadedBy || null, nowIso, nowIso);
        }
      } catch (e) {
        console.warn('Failed to persist emotes to DB:', e);
      }
    } catch (e) {
      console.error('Failed to persist state to DB:', e);
    }
  }

  // Encrypt a file (AES-256-GCM) using a passphrase-derived key and write
  // out a small header followed by ciphertext+tag.
  private encryptFile(plainPath: string, destPath: string, passphrase: string) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(passphrase, salt, 200_000, 32, 'sha256');
    const data = fs.readFileSync(plainPath);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    const header = JSON.stringify({ salt: salt.toString('hex'), iv: iv.toString('hex'), taglen: tag.length });
    const headerBuf = Buffer.from(header, 'utf8');
    const hdrLen = Buffer.allocUnsafe(4);
    hdrLen.writeUInt32BE(headerBuf.length, 0);
    const out = Buffer.concat([hdrLen, headerBuf, ciphertext, tag]);
    fs.writeFileSync(destPath, out, { mode: 0o600 });
  }

  private decryptFile(encPath: string, destPath: string, passphrase: string) {
    const raw = fs.readFileSync(encPath);
    const hdrLen = raw.readUInt32BE(0);
    const headerBuf = raw.slice(4, 4 + hdrLen);
    const header = JSON.parse(headerBuf.toString('utf8')) as any;
    const salt = Buffer.from(header.salt, 'hex');
    const iv = Buffer.from(header.iv, 'hex');
    const tagLen = header.taglen || 16;
    const ciphertext = raw.slice(4 + hdrLen, raw.length - tagLen);
    const tag = raw.slice(raw.length - tagLen);
    const key = crypto.pbkdf2Sync(passphrase, salt, 200_000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    fs.writeFileSync(destPath, plain, { mode: 0o600 });
  }

  private storeMessage(message: TypedMessage) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, channelId, user, userRole, content, type, timestamp, data, serverId, mediaPath, replyToId, replyToUser, replyToContent, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      message.id,
      message.channelId,
      message.user,
      message.userRole || null,
      message.content,
      message.type,
      message.timestamp.toISOString(),
      message.data ? JSON.stringify(message.data) : null,
      message.serverId,
      (message.data && message.data.mediaPath) ? message.data.mediaPath : null,
      message.replyTo ? message.replyTo.id : null,
      message.replyTo ? message.replyTo.user : null,
      message.replyTo ? message.replyTo.content : null,
      message.pinned ? 1 : 0
    );
  }

  private updateMessage(messageId: string, modifiedMessage: Partial<TypedMessage>) {
    const stmt = this.db.prepare(`
      UPDATE messages SET
        user = COALESCE(?, user),
        userRole = COALESCE(?, userRole),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        data = COALESCE(?, data),
        mediaPath = COALESCE(?, mediaPath),
        pinned = COALESCE(?, pinned)
      WHERE id = ?
    `);
    stmt.run(
      modifiedMessage.user,
      modifiedMessage.userRole,
      modifiedMessage.content,
      modifiedMessage.type,
      modifiedMessage.data ? JSON.stringify(modifiedMessage.data) : null,
      (modifiedMessage.data && modifiedMessage.data.mediaPath) ? modifiedMessage.data.mediaPath : null,
      typeof modifiedMessage.pinned === 'boolean' ? (modifiedMessage.pinned ? 1 : 0) : null,
      messageId
    );
  }

  private loadMessagesFromDB() {
    const stmt = this.db.prepare('SELECT * FROM messages ORDER BY timestamp ASC');
    const rows = stmt.all() as any[];
    for (const row of rows) {
      const parsedContent = this.parseEmotes(row.content);
      const message: TypedMessage = {
        id: row.id,
        channelId: row.channelId,
        user: row.user,
        userRole: row.userRole,
        content: row.content,
        renderedContent: parsedContent !== row.content ? parsedContent : undefined,
        type: row.type,
        timestamp: new Date(row.timestamp),
        data: row.data ? JSON.parse(row.data) : undefined,
        serverId: row.serverId,
        replyTo: row.replyToId ? { id: row.replyToId, user: row.replyToUser, content: row.replyToContent } : undefined,
        pinned: !!row.pinned
      };
      if (!this.messages.has(row.channelId)) {
        this.messages.set(row.channelId, []);
      }
      this.messages.get(row.channelId)!.push(message);
    }
  }

  private startSystemMonitoring() {
    // Update stats immediately
    this.updateSystemStats();

    // Update stats every 30 seconds
    this.statsInterval = setInterval(() => {
      this.updateSystemStats();
    }, 30000);
  }

  private updateSystemStats() {
    try {
      // CPU Information
      const cpus = os.cpus();
      const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
      const totalTick = cpus.reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b), 0);
      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const cpuUsage = 100 - ~~(100 * idle / total);

      // Memory Information
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsage = (usedMemory / totalMemory) * 100;

      // Storage Information (simplified - using current directory's disk)
      const stats = fs.statSync('.');
      // Note: This is a simplified approach. For more accurate disk usage,
      // you might want to use a library like 'diskusage' or 'systeminformation'
      const diskUsage = this.getDiskUsage();

      this.systemStats = {
        cpu: {
          usage: cpuUsage,
          cores: cpus.length,
          model: cpus[0]?.model || 'Unknown'
        },
        memory: {
          total: totalMemory,
          used: usedMemory,
          free: freeMemory,
          usage: memoryUsage
        },
        storage: diskUsage,
        uptime: os.uptime(),
        loadAverage: os.loadavg()
      };
    } catch (error) {
      console.error('Error updating system stats:', error);
    }
  }

  private getDiskUsage(): { total: number; used: number; free: number; usage: number } {
    try {
      // This is a simplified implementation
      // In a real application, you'd use a proper disk usage library
      const total = 100 * 1024 * 1024 * 1024; // 100GB placeholder
      const free = 30 * 1024 * 1024 * 1024;   // 30GB placeholder
      const used = total - free;
      const usage = (used / total) * 100;

      return { total, used, free, usage };
    } catch (error) {
      console.error('Error getting disk usage:', error);
      return { total: 0, used: 0, free: 0, usage: 0 };
    }
  }

  private initializeServerState(initialConfig?: InitialServerConfig) {
    // If no initialConfig was passed in, try to load from the config file on disk.
    // This covers server restarts where --config is not re-specified.
    let config = initialConfig;
    if (!config && this.initialConfigPath && fs.existsSync(this.initialConfigPath)) {
      try {
        const raw = fs.readFileSync(this.initialConfigPath, 'utf-8');
        config = JSON.parse(raw) as InitialServerConfig;
        console.log(`Restored server state from ${this.initialConfigPath}`);
      } catch (e) {
        console.error('Failed to read config file, falling back to defaults:', e);
      }
    }
    if (config) {
      // Only apply initial JSON config when no DB-backed state exists
      if (this.channels.size === 0 && this.roles.size === 0 && this.sections.size === 0) {
        this.applyInitialConfig(config);
      } else {
        console.log('Skipping initial JSON config because DB-backed state was loaded');
      }
    } else {
      // Ensure roles exist before creating channels so default channel
      // permission gates can reference the member role id.
      this.initializeDefaultRoles();
      this.initializeDefaultChannels();
    }
    // Normalize channel permissions to populate readRoles/writeRoles for
    // existing persisted configs so the client UI shows toggles as expected.
    this.normalizeChannelPermissions();
    this.loadMessagesFromDB();
  }

  private isOwnerMatch(username?: string, accountId?: string): boolean {
    // If accountId provided and matches, it's the owner
    if (this.ownerAccountId && this.ownerAccountId.trim() && accountId) {
      if (accountId === this.ownerAccountId) return true;
    }
    // Fallback to username matching
    return !!(this.ownerUsername && username && username.toLowerCase() === this.ownerUsername.toLowerCase());
  }

  private persistConfigFile(initialConfig?: InitialServerConfig) {
    try {
      const snapshot = this.getConfigSnapshot();
      const payload: PersistedServerConfig = {
        serverId: this.serverId,
        name: this.serverName,
        mode: this.mode,
        dataRoot: this.dataRoot,
        configPath: this.configFilePath,
        adminTokenHash: this.adminToken ? this.hashAdminToken(this.adminToken) : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections: snapshot.sections,
        channels: snapshot.channels,
        roles: snapshot.roles,
        initialConfig
      };

      const configDir = path.dirname(this.configFilePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.configFilePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.chmodSync(this.configFilePath, 0o600);
      // Also persist the canonical server/roles/sections/channels into the DB
      try {
        this.persistStateToDB();
      } catch (e) {
        console.warn('Failed to persist state to DB during persistConfigFile:', e);
      }
    } catch (error) {
      console.error('Failed to persist server config:', error);
    }
  }

  /**
   * Write current state to the internal config file AND sync back to the
   * original --config file (server.config.json or equivalent) so changes
   * survive a server restart.
   */
  private saveToDisk(): void {
    try {
      this.persistConfigFile();

      // If the server was started with a --config file, write the current
      // sections/channels/roles back to it in InitialServerConfig format.
      if (this.initialConfigPath) {
        const snap = this.getConfigSnapshot();
        // Build a sanitized initial config for the external JSON file.
        // Sensitive fields (owner/account IDs and user->role mappings) are omitted.
        const initialCfg: InitialServerConfig = {
          name: this.serverName,
          sections: snap.sections.map(s => ({
            id: s.id,
            name: s.name,
            position: s.position,
            permissions: s.permissions,
          })),
          channels: snap.channels.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            sectionId: c.sectionId,
            position: c.position,
            settings: c.settings,
            permissions: c.permissions,
          })),
          roles: snap.roles.map(r => ({
            id: r.id,
            name: r.name,
            color: r.color,
            permissions: r.permissions,
          })),
          // Do NOT include ownerUsername, ownerAccountId or userRoles here —
          // those are considered sensitive and are persisted only in the DB.
        };
        const cfgDir = path.dirname(this.initialConfigPath);
        if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
        fs.writeFileSync(this.initialConfigPath, JSON.stringify(initialCfg, null, 2), 'utf-8');
      }
    } catch (error) {
      console.error('Failed to save config to disk:', error);
    }
  }

  private hashAdminToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private ensureAdminToken() {
    if (this.adminToken && this.adminToken.trim().length > 0) {
      return;
    }

    // Generate a random token and store it on disk with strict permissions
    const token = crypto.randomBytes(24).toString('hex');
    this.adminToken = token;

    const secretPath = path.join(this.dataRoot, 'secrets', 'admin.token');
    try {
      const secretDir = path.dirname(secretPath);
      if (!fs.existsSync(secretDir)) {
        fs.mkdirSync(secretDir, { recursive: true });
      }

      fs.writeFileSync(secretPath, token, { mode: 0o600 });
      fs.chmodSync(secretPath, 0o600);
      console.log(`Generated admin token and stored at ${secretPath} (mode 600). Keep it safe.`);
    } catch (error) {
      console.error('Failed to write generated admin token to disk:', error);
    }
  }

  private initializeDefaultRoles() {
    const ownerRole: Role = {
      id: 'owner',
      name: 'Server Owner',
      color: '#e5533d',
      permissions: {
        manageServer: true,
        manageChannels: true,
        manageRoles: true,
        viewChannels: true,
        sendMessages: true,
        manageMessages: true,
        manageEmotes: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const memberRole: Role = {
      id: 'member',
      name: 'Member',
      color: '#4a90e2',
      permissions: {
        manageServer: false,
        manageChannels: false,
        manageRoles: false,
        viewChannels: true,
        sendMessages: true,
        manageMessages: false,
        manageEmotes: false
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.roles.clear();
    this.roles.set(ownerRole.id, ownerRole);
    this.roles.set(memberRole.id, memberRole);
  }

  // Helper: find the role id that represents a regular member (lowest permissions)
  private findMemberRoleId(): string | null {
    // Prefer explicit ids/names
    if (this.roles.has('member')) return 'member';
    for (const r of this.roles.values()) {
      if (r.name && r.name.toLowerCase() === 'member') return r.id;
    }
    // Fallback: pick role with fewest granted permissions
    let best: Role | null = null;
    let bestScore = Infinity;
    for (const r of this.roles.values()) {
      const perms = r.permissions || {} as any;
      const score = Object.values(perms).filter(v => !!v).length;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best ? best.id : null;
  }

  // Helper: find the role id that represents an owner/admin (highest permissions)
  private findAdminRoleId(): string | null {
    if (this.roles.has('owner')) return 'owner';
    if (this.roles.has('admin')) return 'admin';
    for (const r of this.roles.values()) {
      if (r.name && r.name.toLowerCase() === 'owner') return r.id;
      if (r.name && r.name.toLowerCase() === 'admin') return r.id;
    }
    // Fallback: pick role with most granted permissions
    let best: Role | null = null;
    let bestScore = -1;
    for (const r of this.roles.values()) {
      const perms = r.permissions || {} as any;
      const score = Object.values(perms).filter(v => !!v).length;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best ? best.id : null;
  }

  private initializeDefaultChannels() {
    // Create default sections
    const generalSection: ChannelSection = {
      id: 'general',
      name: 'General',
      position: 0,
      permissions: { view: true, manage: false },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.sections.set(generalSection.id, generalSection);

    const memberRoleId = this.findMemberRoleId();

    // Create default channels
    const generalChannel: Channel = {
      id: 'general',
      name: 'general',
      type: 'text',
      sectionId: 'general',
      position: 0,
      permissions: {
        read: true,
        write: true,
        manage: false,
        readRoles: memberRoleId ? [memberRoleId] : [],
        writeRoles: memberRoleId ? [memberRoleId] : [],
      },
      settings: { nsfw: false, slowMode: 0, allowPinning: true },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.channels.set(generalChannel.id, generalChannel);
    this.messages.set(generalChannel.id, []);

    const announcementsChannel: Channel = {
      id: 'announcements',
      name: 'announcements',
      type: 'announcement',
      sectionId: 'general',
      position: 1,
      permissions: {
        read: true,
        write: false,
        manage: false,
        readRoles: memberRoleId ? [memberRoleId] : [],
        writeRoles: [],
      }, // Read-only for regular users
      settings: { nsfw: false, slowMode: 0, allowPinning: true },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.channels.set(announcementsChannel.id, announcementsChannel);
    this.messages.set(announcementsChannel.id, []);
  }

  // Ensure existing channels have explicit readRoles/writeRoles so the
  // client UI shows expected toggles. Prefer the member role when present.
  private normalizeChannelPermissions() {
    // Build canonical lists from defined roles: include roles that can view/send.
    const allReadableRoleIds = Array.from(this.roles.values())
      .filter(r => r.permissions?.viewChannels !== false)
      .map(r => r.id);
    const allWritableRoleIds = Array.from(this.roles.values())
      .filter(r => r.permissions?.sendMessages === true)
      .map(r => r.id);

    for (const [id, ch] of this.channels.entries()) {
      const perms = ch.permissions || { read: true, write: true, manage: false };

      const hasExplicitGates = (perms.roles !== undefined) || (perms.readRoles !== undefined) || (perms.writeRoles !== undefined);

      if (!hasExplicitGates) {
        ch.permissions = {
          ...perms,
          read: perms.read ?? true,
          write: perms.write ?? true,
          manage: perms.manage ?? false,
          readRoles: perms.read === false ? [] : allReadableRoleIds,
          writeRoles: perms.write === true ? allWritableRoleIds : [],
        };
      } else {
        ch.permissions = {
          ...perms,
          read: perms.read ?? true,
          write: perms.write ?? true,
          manage: perms.manage ?? false,
          readRoles: perms.readRoles !== undefined ? perms.readRoles : (perms.roles !== undefined ? perms.roles : allReadableRoleIds),
          writeRoles: perms.writeRoles !== undefined ? perms.writeRoles : (perms.roles !== undefined ? perms.roles : (perms.write ? allWritableRoleIds : [])),
        };
      }
      ch.updatedAt = new Date();
      this.channels.set(id, ch);
    }
  }

  private getServerIconPath(): string | null {
    const mediaDir = path.join(this.dataRoot, 'server_media');
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      const p = path.join(mediaDir, `servericon.${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private userHasPermission(username: string | undefined, permission: keyof RolePermissions): boolean {
    if (!username) return false;
    // Owner always has permissions
    if (this.isOwnerMatch(username, undefined)) return true;
    const userRoleName = this.userRoles.get(username) || '';
    const roleObj = Array.from(this.roles.values()).find(r => (r.name || '').toLowerCase() === (userRoleName || '').toLowerCase() || (r.id || '').toLowerCase() === (userRoleName || '').toLowerCase());
    if (!roleObj) return false;
    return !!(roleObj.permissions && (roleObj.permissions as any)[permission]);
  }

  private applyInitialConfig(config: InitialServerConfig) {
    if (config.ownerUsername) this.ownerUsername = config.ownerUsername;
    if (config.ownerAccountId) this.ownerAccountId = config.ownerAccountId;
    // If an owner is provided in initial config, ensure they have the admin role
    if (config.ownerUsername) {
      const adminRoleId = this.findAdminRoleId();
      if (adminRoleId) {
        this.userRoles.set(config.ownerUsername, adminRoleId);
      }
    }
    // User roles
    if (config.userRoles) {
      for (const [username, role] of Object.entries(config.userRoles)) {
        this.userRoles.set(username, role);
      }
    }
    // Roles
    if (config.roles && config.roles.length > 0) {

      config.roles.forEach((role, index) => {
        const id = role.id || `role-${index + 1}`;
        const roleRecord: Role = {
          id,
          name: role.name,
          color: role.color,
          permissions: role.permissions,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.roles.set(id, roleRecord);
      });
    } else {
      this.initializeDefaultRoles();
    }

    // Sections
    if (config.sections && config.sections.length > 0) {
      config.sections.forEach((section, index) => {
        const id = section.id || uuidv4();
        const sectionRecord: ChannelSection = {
          id,
          name: section.name,
          position: section.position ?? index,
          permissions: section.permissions ?? { view: true, manage: false },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.sections.set(id, sectionRecord);
      });
    } else {
      // Fallback if no sections provided
      this.initializeDefaultChannels();
      return;
    }

    // Channels
    if (config.channels && config.channels.length > 0) {
      config.channels.forEach((channel, index) => {
        const id = channel.id || uuidv4();
        const sectionId = channel.sectionId && this.sections.has(channel.sectionId)
          ? channel.sectionId
          : undefined;
        const channelRecord: Channel = {
          id,
          name: channel.name,
          type: channel.type || 'text',
          sectionId,
          position: channel.position ?? index,
          permissions: channel.permissions || { read: true, write: true, manage: false },
          settings: {
            nsfw: false,
            slowMode: 0,
            allowPinning: true,
            ...channel.settings
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.channels.set(id, channelRecord);
        this.messages.set(id, []);
      });
    } // else removed
  }

  public getSystemStats(): SystemStats | null {
    return this.systemStats;
  }

  private setupRoutes() {
    // Allow larger JSON payloads for image uploads (data URIs can be large).
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use('/emotes', express.static(path.join(this.dataRoot, 'emotes')));

    const upload = multer({ dest: path.join(this.dataRoot, 'emotes') });

    this.app.post('/upload-emote', upload.single('emote'), (req, res) => {
      // Permission check: allow if admin token, owner, or role has manageEmotes
      const tokenHeader = req.headers['x-admin-token'];
      const token = typeof tokenHeader === 'string' ? tokenHeader : Array.isArray(tokenHeader) ? tokenHeader[0] : undefined;
      const userHeader = req.headers['x-username'];
      const username = typeof userHeader === 'string' ? userHeader : Array.isArray(userHeader) ? userHeader[0] : (req.body?.username as string) || (req.query.username as string);

      if (!( (token && this.adminToken && token === this.adminToken) || this.userHasPermission(username, 'manageEmotes') )) {
        // Clean up multer temp file on permission failure
        if (req.file?.path) {
          try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        }
        return res.status(403).json({ error: 'Insufficient permission to upload emotes' });
      }

      if (!req.file) {
        return res.status(400).send('No file uploaded');
      }
      const name = req.body.name || path.parse(req.file.originalname).name;
      // Get extension from originalname, or infer from mimetype if missing
      let ext = path.extname(req.file.originalname);
      if (!ext && req.file.mimetype) {
        const mimeToExt: Record<string, string> = {
          'image/png': '.png',
          'image/jpeg': '.jpg',
          'image/gif': '.gif',
          'image/webp': '.webp',
        };
        ext = mimeToExt[req.file.mimetype] || '.png';
      }
      if (!ext) ext = '.png'; // fallback
      const filename = `${name}${ext}`;
      const filepath = path.join(this.dataRoot, 'emotes', filename);
      try {
        fs.renameSync(req.file.path, filepath);
      } catch (renameErr) {
        // Try copy + unlink as fallback (cross-device moves)
        try {
          fs.copyFileSync(req.file.path, filepath);
          fs.unlinkSync(req.file.path);
        } catch (copyErr) {
          console.error('Failed to save emote file:', copyErr);
          return res.status(500).json({ error: 'Failed to save emote file' });
        }
      }
      this.emotes.set(name, { filename, uploadedBy: username });
      try {
        const now = new Date().toISOString();
        const insert = this.db.prepare(`INSERT OR REPLACE INTO emotes (serverId, name, filename, uploadedBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
        insert.run(this.serverId, name, filename, username || null, now, now);
      } catch (e) {
        console.warn('Failed to persist emote to DB:', e);
      }
      res.send({ name, url: `/emotes/${filename}`, uploadedBy: username || null });
    });

    this.app.get('/emotes-list', (req, res) => {
      const list = Array.from(this.emotes.entries()).map(([name, data]) => ({
        name,
        url: `/emotes/${data.filename}`,
        uploadedBy: data.uploadedBy || null
      }));
      res.send(list);
    });

    this.app.delete('/emotes/:name', (req, res) => {
      const tokenHeader = req.headers['x-admin-token'];
      const token = typeof tokenHeader === 'string' ? tokenHeader : Array.isArray(tokenHeader) ? tokenHeader[0] : undefined;
      const userHeader = req.headers['x-username'];
      const username = typeof userHeader === 'string' ? userHeader : Array.isArray(userHeader) ? userHeader[0] : (req.query.username as string) || (req.body?.username as string);

      if (!( (token && this.adminToken && token === this.adminToken) || this.userHasPermission(username, 'manageEmotes') )) {
        return res.status(403).json({ error: 'Insufficient permission to delete emotes' });
      }

      const { name } = req.params;
      if (!name || !this.emotes.has(name)) return res.status(404).json({ error: 'Emote not found' });
      const emoteData = this.emotes.get(name)!;
      const filepath = path.join(this.dataRoot, 'emotes', emoteData.filename);
      try {
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      } catch (e) {
        console.warn('Failed to unlink emote file:', e);
      }
      try {
        const del = this.db.prepare('DELETE FROM emotes WHERE serverId = ? AND name = ?');
        del.run(this.serverId, name);
      } catch (e) {
        console.warn('Failed to delete emote from DB:', e);
      }
      this.emotes.delete(name);
      res.json({ success: true });
    });

    const mediaUpload = multer({ dest: path.join(this.dataRoot, 'media') });
    this.app.post('/upload-media', mediaUpload.single('media'), (req, res) => {
      if (!req.file) {
        return res.status(400).send('No file uploaded');
      }
      const filename = `${uuidv4()}-${req.file.originalname}`;
      const filepath = path.join(this.dataRoot, 'media', filename);
      fs.renameSync(req.file.path, filepath);
      res.send({ filename, url: `/media/${filename}` });
    });

    this.app.use('/media', express.static(path.join(this.dataRoot, 'media')));

    // Client plugins endpoint
    this.app.get('/client-plugins', (req, res) => {
      const plugins = this.pluginManager.getEnabledClientPlugins();
      res.json({
        serverId: this.serverId,
        plugins: plugins
      });
    });

    // Plugin UI configuration endpoint
    this.app.get('/plugin-ui-config', (req, res) => {
      const uiConfig = this.pluginManager.getPluginUIConfig();
      res.json({
        serverId: this.serverId,
        uiConfig: uiConfig
      });
    });

    // Plugin management endpoints
    this.app.post('/plugins/server/:pluginName/enable', (req, res) => {
      const { pluginName } = req.params;
      const success = this.pluginManager.setPluginEnabled(pluginName, true);
      res.json({ success, message: success ? `Enabled server plugin: ${pluginName}` : `Plugin not found: ${pluginName}` });
    });

    this.app.post('/plugins/server/:pluginName/disable', (req, res) => {
      const { pluginName } = req.params;
      const success = this.pluginManager.setPluginEnabled(pluginName, false);
      res.json({ success, message: success ? `Disabled server plugin: ${pluginName}` : `Plugin not found: ${pluginName}` });
    });

    this.app.post('/plugins/client/:pluginName/enable', (req, res) => {
      const { pluginName } = req.params;
      const success = this.pluginManager.setClientPluginEnabled(pluginName, true);
      res.json({ success, message: success ? `Enabled client plugin: ${pluginName}` : `Plugin not found: ${pluginName}` });
    });

    this.app.post('/plugins/client/:pluginName/disable', (req, res) => {
      const { pluginName } = req.params;
      const success = this.pluginManager.setClientPluginEnabled(pluginName, false);
      res.json({ success, message: success ? `Disabled client plugin: ${pluginName}` : `Plugin not found: ${pluginName}` });
    });

    // Get plugin status
    this.app.get('/plugins/status', (req, res) => {
      res.json({
        serverPlugins: this.pluginManager.getAllPlugins().map(p => ({
          name: p.name,
          version: p.version,
          description: p.description || null,
          author: p.author || null,
          enabled: p.enabled !== false,
          hasSettings: !!this.pluginManager.getPluginSettingsSchema(p.name),
        })),
        clientPlugins: this.pluginManager.getAllClientPlugins().map(p => ({
          name: p.name,
          version: p.version,
          description: p.description || null,
          author: p.author || null,
          enabled: p.enabled !== false,
          hasSettings: false,
        }))
      });
    });

    // Get settings schema + current values for a plugin
    this.app.get('/plugins/:pluginName/settings', (req, res) => {
      const { pluginName } = req.params;
      const schema = this.pluginManager.getPluginSettingsSchema(pluginName);
      if (!schema) {
        return res.status(404).json({ error: 'Plugin has no settings or was not found' });
      }
      const values = this.pluginManager.getPluginSettings(pluginName);
      res.json({ schema, values });
    });

    // Save settings for a plugin
    this.app.put('/plugins/:pluginName/settings', express.json(), (req, res) => {
      const { pluginName } = req.params;
      const schema = this.pluginManager.getPluginSettingsSchema(pluginName);
      if (!schema) {
        return res.status(404).json({ error: 'Plugin has no settings or was not found' });
      }
      const values = req.body;
      if (!values || typeof values !== 'object') {
        return res.status(400).json({ error: 'Request body must be a JSON object of setting values' });
      }
      const success = this.pluginManager.setPluginSettings(pluginName, values);
      if (!success) {
        return res.status(500).json({ error: 'Failed to save settings' });
      }
      res.json({ success: true });
    });

    // Emergency plugin shutdown (kill switch)
    this.app.post('/plugins/emergency-shutdown', (req, res) => {
      console.log('EMERGENCY PLUGIN SHUTDOWN REQUESTED');
      this.pluginManager.emergencyShutdown();
      res.json({ success: true, message: 'All plugins have been disabled for security' });
    });

    // ── Server info & icon ────────────────────────────────────────────────────

    // Public endpoint: basic info about this server (name, owner, icon).
    this.app.get('/info', (_req, res) => {
      const iconPath = this.getServerIconPath();
      res.json({
        id: this.serverId,
        name: this.serverName,
        ownerUsername: this.ownerUsername || null,
        ownerAccountId: this.ownerAccountId || null,
        iconUrl: iconPath ? '/server/icon' : null,
        allowClaimOwnership: this.allowClaimOwnership !== false,
        passwordRequired: !!this.serverPasswordHash,
      });
    });

    // Server icon: anyone can upload (gated by UI; only owner sees the option).
    this.app.post('/server/icon', (req, res) => {
      const { dataUri } = req.body;
      try {
        const size = req.headers['content-length'] || '<unknown>';
        console.debug('[Server] POST /server/icon received, content-length=', size);
      } catch (e) {
        // ignore
      }
      if (typeof dataUri !== 'string') {
        return res.status(400).json({ error: 'dataUri is required' });
      }
      const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!match) return res.status(400).json({ error: 'Invalid data URI format' });
      const ext  = match[1] === 'jpeg' ? 'jpg' : match[1];
      const data = Buffer.from(match[2], 'base64');
      // Ensure server media directory exists and remove any previous icons.
      const mediaDir = path.join(this.dataRoot, 'server_media');
      try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (e) { /* ignore */ }
      for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
        const old = path.join(mediaDir, `servericon.${e}`);
        if (fs.existsSync(old)) { try { fs.unlinkSync(old); } catch {} }
      }
      const iconPath = path.join(mediaDir, `servericon.${ext}`);
      fs.writeFileSync(iconPath, data);
      // Notify connected clients that the server icon changed so they can reload it.
      try {
        this.io.emit('server_info_updated', { serverId: this.serverId, iconUrl: '/server/icon' });
      } catch (e) {
        console.error('[Server] Failed to emit server_info_updated', e);
      }
      res.json({ success: true, iconUrl: '/server/icon' });
    });

    // Serve the server icon file.
    this.app.get('/server/icon', (_req, res) => {
      const iconPath = this.getServerIconPath();
      if (!iconPath) return res.status(404).json({ error: 'No server icon set' });
      // Prevent aggressive caching so clients can fetch updates when the icon changes.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(iconPath));
    });

    // Claim owner: sets ownerUsername when no owner is assigned yet.
    // If an admin token is configured on the server, it must be provided in
    // X-Admin-Token header or body.token.  Without an admin token configured
    // (e.g. first-time setup), any connecting client may claim ownership.
    this.app.post('/server/claim-owner', (req, res) => {
      const { username, token, accountId } = req.body;
      if (!username || typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ error: 'username is required' });
      }
      // If a token is configured, validate it.
      if (this.adminToken && this.adminToken.trim()) {
        const suppliedRaw = (req.headers['x-admin-token'] as string) || token as string;
        const supplied = suppliedRaw ? suppliedRaw.toString().trim() : suppliedRaw;
        // Debug: log hashed comparison to help diagnose 401s without printing raw tokens
        try {
          const storedHash = this.hashAdminToken(this.adminToken);
          const suppliedHash = supplied ? this.hashAdminToken(supplied) : '<none>';
          console.debug('[claim-owner] admin token present; comparing hashes', { storedHash, suppliedHash });
        } catch (e) {
          console.debug('[claim-owner] admin token hash compare failed', e);
        }
        if (!supplied || supplied !== this.adminToken) {
          return res.status(401).json({
            error: 'Admin token required to claim ownership',
            requiresToken: true,
          });
        }
      }
      // Overwrite only if no owner set (or admin token was verified = transfer).
      this.ownerUsername = username.trim();
      if (accountId && typeof accountId === 'string' && accountId.trim()) {
        this.ownerAccountId = accountId.trim();
      }
      // Assign the owner the admin role so they get full permissions
      const adminRoleId = this.findAdminRoleId();
      if (adminRoleId) {
        this.userRoles.set(this.ownerUsername, adminRoleId);
      }
      this.saveToDisk();
      this.io.emit('member_role_updated', { username: this.ownerUsername, role: adminRoleId });
      res.json({ success: true, ownerUsername: this.ownerUsername, ownerAccountId: this.ownerAccountId || null });
    });

    // ── Server password management ──────────────────────────────────────────
    // POST /server/password/verify — check if a password is required and/or verify a supplied password.
    this.app.post('/server/password/verify', (req, res) => {
      const { password } = req.body;
      const hasPassword = !!this.serverPasswordHash;
      if (!hasPassword) {
        return res.json({ required: false, valid: true });
      }
      // A password is set — if none supplied, tell the caller it's required.
      if (typeof password !== 'string' || password.length === 0) {
        return res.json({ required: true, valid: false });
      }
      const hash = crypto.pbkdf2Sync(password, this.serverId, 100000, 64, 'sha512').toString('hex');
      const valid = hash === this.serverPasswordHash;
      return res.json({ required: true, valid });
    });

    // POST /server/password/set — owner-only: set, change or remove the server join password.
    this.app.post('/server/password/set', (req, res) => {
      const { password, username, accountId } = req.body;
      // Only the server owner (or admin-token holder) may change the password.
      if (!this.isOwnerMatch(username, accountId)) {
        const tokenHeader = req.headers['x-admin-token'];
        const token = typeof tokenHeader === 'string' ? tokenHeader : undefined;
        if (!token || !this.adminToken || token !== this.adminToken) {
          return res.status(403).json({ error: 'Only the server owner can change the server password.' });
        }
      }
      if (typeof password === 'string' && password.length > 0) {
        this.serverPasswordHash = crypto.pbkdf2Sync(password, this.serverId, 100000, 64, 'sha512').toString('hex');
      } else {
        // Remove the password
        this.serverPasswordHash = '';
      }
      this.saveToDisk();
      res.json({ success: true, passwordRequired: !!this.serverPasswordHash });
    });

    // GET /members — list all known members with their roles and online status
    this.app.get('/members', (req, res) => {
      try {
        const stmt = this.db.prepare('SELECT username, role, status FROM members WHERE serverId = ?');
        const rows = stmt.all(this.serverId) as Array<{ username: string; role?: string; status?: string }>;
        const members = rows.map(r => ({ username: r.username, role: r.role, status: r.status || 'offline' }));
        // Include any online usernames not yet stored in members
        const onlineUsernames = Array.from(this.connectedUsers.values()).map(v => v.username);
        const present = new Set(members.map(m => m.username));
        for (const username of onlineUsernames) {
          if (!present.has(username)) members.push({ username, role: undefined, status: 'online' });
        }
        res.json({ members });
      } catch (e) {
        // Fallback to in-memory representation on DB error
        const onlineUsernames = new Set(Array.from(this.connectedUsers.values()).map(v => v.username));
        const seen = new Set<string>();
        const members: Array<{ username: string; role?: string; status: string }> = [];
        for (const [username, role] of this.userRoles.entries()) {
          seen.add(username);
          members.push({ username, role, status: onlineUsernames.has(username) ? 'online' : 'offline' });
        }
        for (const username of onlineUsernames) {
          if (!seen.has(username)) members.push({ username, status: 'online' });
        }
        res.json({ members });
      }
    });

    // PATCH /members/:username/role — assign a role to a user
    this.app.patch('/members/:username/role', (req, res) => {
      const { username } = req.params;
      const { role } = req.body as { role?: string };
      if (typeof role !== 'string') return res.status(400).json({ error: 'role must be a string' });
      try {
        if (role.trim()) {
          const stmt = this.db.prepare(`INSERT OR REPLACE INTO members (serverId, username, nickname, role, status) VALUES (?, ?, COALESCE((SELECT nickname FROM members WHERE serverId = ? AND username = ?), NULL), ?, COALESCE((SELECT status FROM members WHERE serverId = ? AND username = ?), 'offline'))`);
          stmt.run(this.serverId, username, this.serverId, username, role.trim(), this.serverId, username);
          this.userRoles.set(username, role.trim());
        } else {
          const stmt = this.db.prepare(`UPDATE members SET role = NULL WHERE serverId = ? AND username = ?`);
          stmt.run(this.serverId, username);
          this.userRoles.delete(username);
        }
        this.saveToDisk();
        this.io.emit('member_role_updated', { username, role: role.trim() || null });
        res.json({ username, role: role.trim() || null });
      } catch (e) {
        // Fallback to in-memory behavior
        if (role.trim()) {
          this.userRoles.set(username, role.trim());
        } else {
          this.userRoles.delete(username);
        }
        this.saveToDisk();
        this.io.emit('member_role_updated', { username, role: role.trim() || null });
        res.json({ username, role: role.trim() || null });
      }
    });

    // System stats endpoint
    this.app.get('/system/stats', (req, res) => {
      const stats = this.getSystemStats();
      if (!stats) {
        return res.status(503).json({ error: 'System stats not available' });
      }
      res.json(stats);
    });

    // Role management endpoints
    this.app.get('/roles', (_req, res) => {
      try {
        const roles = Array.from(this.roles.values());
        console.log(`[Server] GET /roles -> count=${roles.length}`);
        return res.json({ roles });
      } catch (e) {
        console.error('[Server] Error handling GET /roles', e);
        return res.status(500).json({ roles: [] });
      }
    });

    this.app.post('/roles', (req, res) => {
      const { name, color, permissions } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Role name is required' });
      }
      const role: Role = {
        id: uuidv4(),
        name: name.trim(),
        color,
        permissions: permissions || { manageServer: false, manageChannels: false, manageRoles: false, viewChannels: true, sendMessages: true, manageMessages: false, manageEmotes: false },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.roles.set(role.id, role);
      this.saveToDisk();
      // Notify connected clients that roles changed
      this.io.emit('roles_updated', { roles: Array.from(this.roles.values()) });
      res.json(role);
    });

    this.app.patch('/roles/:roleId', (req, res) => {
      const { roleId } = req.params;
      const existing = this.roles.get(roleId);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }
      const { name, color, permissions } = req.body;
      const updated: Role = {
        ...existing,
        name: (name && typeof name === 'string') ? name.trim() : existing.name,
        color: color !== undefined ? color : existing.color,
        permissions: permissions || existing.permissions,
        updatedAt: new Date()
      };
      this.roles.set(roleId, updated);
      this.saveToDisk();
      // Notify connected clients that roles changed
      this.io.emit('roles_updated', { roles: Array.from(this.roles.values()) });
      res.json(updated);
    });

    this.app.delete('/roles/:roleId', (req, res) => {
      const { roleId } = req.params;
      if (!this.roles.has(roleId)) {
        return res.status(404).json({ error: 'Role not found' });
      }

      // Prevent deletion of the canonical default roles
      if (roleId === 'owner' || roleId === 'member') {
        return res.status(400).json({ error: 'Default role cannot be deleted' });
      }

      // Remove role from roles map
      this.roles.delete(roleId);

      // Remove role references from user role assignments
      for (const [username, r] of Array.from(this.userRoles.entries())) {
        if (r === roleId) this.userRoles.delete(username);
      }

      // Strip role references from channel permissions
      for (const channel of Array.from(this.channels.values())) {
        const perms = { ...(channel.permissions || {}) } as ChannelPermissions;
        if (perms.roles) perms.roles = perms.roles.filter(r => r !== roleId);
        if (perms.readRoles) perms.readRoles = perms.readRoles.filter(r => r !== roleId);
        if (perms.writeRoles) perms.writeRoles = perms.writeRoles.filter(r => r !== roleId);
        channel.permissions = perms;
        this.channels.set(channel.id, channel);
      }

      // Strip role references from section permissions
      for (const section of Array.from(this.sections.values())) {
        const perms = { ...(section.permissions || {}) } as SectionPermissions;
        if (perms.roles) perms.roles = perms.roles.filter(r => r !== roleId);
        if (perms.viewRoles) perms.viewRoles = perms.viewRoles.filter(r => r !== roleId);
        if (perms.manageRoles) perms.manageRoles = perms.manageRoles.filter(r => r !== roleId);
        section.permissions = perms;
        this.sections.set(section.id, section);
      }

      this.saveToDisk();
      // Notify connected clients that roles changed
      this.io.emit('roles_updated', { roles: Array.from(this.roles.values()) });
      res.json({ success: true });
    });

    // Channel management endpoints
    this.app.get('/channels', (req, res) => {
      const channels = Array.from(this.channels.values()).map(channel => ({
        ...channel,
        messageCount: this.messages.get(channel.id)?.length || 0
      }));
      res.json({ channels, serverId: this.serverId });
    });

    this.app.get('/sections', (req, res) => {
      const sections = Array.from(this.sections.values());
      res.json({ sections, serverId: this.serverId });
    });

    this.app.post('/channels', (req, res) => {
      const { name, type = 'text', sectionId, settings } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Channel name is required' });
      }

      const { permissions: permissionsBody } = req.body;
      const channel: Channel = {
        id: uuidv4(),
        name: name.trim(),
        type,
        sectionId,
        position: this.getNextChannelPosition(sectionId),
        permissions: permissionsBody
          ? { read: true, write: true, manage: false, ...permissionsBody }
          : { read: true, write: true, manage: false },
        settings: {
          nsfw: false,
          slowMode: 0,
          allowPinning: true,
          ...settings // Allow overriding defaults
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.channels.set(channel.id, channel);
      this.messages.set(channel.id, []);

      this.io.emit('channel_created', channel);
      this.saveToDisk();
      res.json(channel);
    });

    this.app.post('/sections', (req, res) => {
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Section name is required' });
      }

      const { permissions: sectionPermsBody } = req.body;
      const section: ChannelSection = {
        id: uuidv4(),
        name: name.trim(),
        position: this.getNextSectionPosition(),
        permissions: sectionPermsBody
          ? { view: true, manage: false, ...sectionPermsBody }
          : { view: true, manage: false },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.sections.set(section.id, section);

      this.io.emit('section_created', section);
      this.saveToDisk();
      res.json(section);
    });

    this.app.delete('/channels/:channelId', (req, res) => {
      const { channelId } = req.params;

      if (!this.channels.has(channelId)) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Don't allow deleting the default general channel
      if (channelId === 'general') {
        return res.status(403).json({ error: 'Cannot delete default channel' });
      }

      this.channels.delete(channelId);
      this.messages.delete(channelId);

      this.io.emit('channel_deleted', { channelId });
      this.saveToDisk();
      res.json({ success: true });
    });

    this.app.delete('/sections/:sectionId', (req, res) => {
      const { sectionId } = req.params;

      if (!this.sections.has(sectionId)) {
        return res.status(404).json({ error: 'Section not found' });
      }

      // Don't allow deleting the default general section
      if (sectionId === 'general') {
        return res.status(403).json({ error: 'Cannot delete default section' });
      }

      // Find the best destination section: pick the section with the lowest position
      // that isn't the one being deleted (so channels always stay sectioned).
      const fallbackSection = [...this.sections.values()]
        .filter(s => s.id !== sectionId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];

      // Move channels in this section to the fallback section and notify clients
      for (const channel of this.channels.values()) {
        if (channel.sectionId === sectionId) {
          channel.sectionId = fallbackSection?.id ?? undefined;
          channel.updatedAt = new Date();
          // Emit channel_updated so every client immediately reflects the move
          this.io.emit('channel_updated', channel);
        }
      }

      this.sections.delete(sectionId);

      this.io.emit('section_deleted', { sectionId });
      this.saveToDisk();
      res.json({ success: true });
    });

    // ── Channel & section PATCH (rename / reorder / move) ────────────────────

    this.app.patch('/channels/:channelId', (req, res) => {
      const { channelId } = req.params;
      const existing = this.channels.get(channelId);
      if (!existing) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      const { name, type, sectionId, position, settings, permissions } = req.body;
      const updated: Channel = {
        ...existing,
        name:        (name && typeof name === 'string') ? name.trim() : existing.name,
        type:        type || existing.type,
        sectionId:   sectionId !== undefined ? (sectionId ?? undefined) : existing.sectionId,
        position:    position  !== undefined ? Number(position)          : existing.position,
        settings:    settings  !== undefined ? { ...existing.settings, ...settings }       : existing.settings,
        permissions: permissions !== undefined ? { ...existing.permissions, ...permissions } : existing.permissions,
        updatedAt:   new Date(),
      };
      this.channels.set(channelId, updated);
      this.io.emit('channel_updated', updated);
      this.saveToDisk();
      res.json(updated);
    });

    this.app.patch('/sections/:sectionId', (req, res) => {
      const { sectionId } = req.params;
      const existing = this.sections.get(sectionId);
      if (!existing) {
        return res.status(404).json({ error: 'Section not found' });
      }
      const { name, position, permissions } = req.body;
      const updated: ChannelSection = {
        ...existing,
        name:        (name && typeof name === 'string') ? name.trim() : existing.name,
        position:    position    !== undefined ? Number(position)     : existing.position,
        permissions: permissions !== undefined ? { ...existing.permissions, ...permissions } : existing.permissions,
        updatedAt:   new Date(),
      };
      this.sections.set(sectionId, updated);
      this.io.emit('section_updated', updated);
      this.saveToDisk();
      res.json(updated);
    });

    // ── Dedicated permissions PATCH endpoints ─────────────────────────────────
    // These are thin wrappers that forward to the main PATCH handlers above,
    // exposed as separate routes for clarity and backward compatibility.

    this.app.patch('/channels/:channelId/permissions', (req, res) => {
      const { channelId } = req.params;
      const existing = this.channels.get(channelId);
      if (!existing) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      const { readRoles, writeRoles, roles } = req.body;
      // Debug logging: record incoming permission updates to help trace
      // intermittent issues where permissions appear to be cleared or
      // channels unexpectedly change after saving from the client.
      console.debug && console.debug(`[permissions] PATCH /channels/${channelId}/permissions`, { readRoles, writeRoles, roles });
      const updated: Channel = {
        ...existing,
        permissions: {
          ...existing.permissions,
          read: existing.permissions?.read ?? true,
          write: existing.permissions?.write ?? true,
          manage: existing.permissions?.manage ?? false,
          ...(roles !== undefined && { roles }),
          ...(readRoles !== undefined && { readRoles }),
          ...(writeRoles !== undefined && { writeRoles }),
        },
        updatedAt: new Date(),
      };
      console.debug && console.debug(`[permissions] Updated channel ${channelId}`, updated);
      this.channels.set(channelId, updated);
      this.io.emit('channel_updated', updated);
      this.saveToDisk();
      res.json(updated);
    });

    this.app.patch('/sections/:sectionId/permissions', (req, res) => {
      const { sectionId } = req.params;
      const existing = this.sections.get(sectionId);
      if (!existing) {
        return res.status(404).json({ error: 'Section not found' });
      }
      const { viewRoles, manageRoles, roles } = req.body;
      console.debug && console.debug(`[permissions] PATCH /sections/${sectionId}/permissions`, { viewRoles, manageRoles, roles });
      const updated: ChannelSection = {
        ...existing,
        permissions: {
          ...existing.permissions,
          view: viewRoles ? viewRoles.length === 0 : (existing.permissions?.view ?? true),
          manage: existing.permissions?.manage ?? false,
          ...(roles !== undefined && { roles }),
          ...(viewRoles !== undefined && { viewRoles }),
          ...(manageRoles !== undefined && { manageRoles }),
        },
        updatedAt: new Date(),
      };
      console.debug && console.debug(`[permissions] Updated section ${sectionId}`, updated);
      this.sections.set(sectionId, updated);
      this.io.emit('section_updated', updated);
      this.saveToDisk();
      res.json(updated);
    });

    // Serve client plugin files
    this.app.get('/plugins/:pluginName', (req, res) => {
      const pluginName = req.params.pluginName;
      const pluginPath = path.join(__dirname, 'plugins', pluginName);

      // Security check - only serve .js files
      if (!pluginName.endsWith('.js')) {
        return res.status(403).send('Forbidden');
      }

      res.sendFile(pluginPath, (err) => {
        if (err) {
          res.status(404).send('Plugin not found');
        }
      });
    });

    this.app.post('/message', (req, res) => {
      // Handle message posting
      const { user, content, channelId, type = 'text', data } = req.body;
      if (!user || !content || !channelId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      // Enforce slow mode if configured on the channel
      const channel = this.channels.get(channelId);
      const slow = channel?.settings?.slowMode ? Number(channel!.settings!.slowMode || 0) : 0;

      const username = typeof user === 'string' ? user : (user.username || user.id || String(user));
      const accountId = typeof user === 'string' ? undefined : (user.id || user.accountId || undefined);

      // Helper: determine if user has server/channel manage permissions
      const userRoleName = this.userRoles.get(username) || '';
      const roleObj = Array.from(this.roles.values()).find(r => (r.name || '').toLowerCase() === (userRoleName || '').toLowerCase() || (r.id || '').toLowerCase() === (userRoleName || '').toLowerCase());
      const isOwner = this.isOwnerMatch(username, accountId);
      const bypassSlow = !!(isOwner || roleObj?.permissions?.manageServer || roleObj?.permissions?.manageChannels || roleObj?.permissions?.manageMessages);

      if (slow > 0 && !bypassSlow) {
        const now = Date.now();
        let channelMap = this.lastMessageAt.get(channelId);
        if (!channelMap) {
          channelMap = new Map();
          this.lastMessageAt.set(channelId, channelMap);
        }
        const last = channelMap.get(username) || 0;
        const elapsed = Math.max(0, Math.floor((now - last) / 1000));
        if (last && (now - last) < slow * 1000) {
          const wait = slow - elapsed;
          return res.status(429).json({ error: 'Slow mode: please wait before sending another message', retryAfter: wait });
        }
        // record now (will be updated again when stored)
        channelMap.set(username, now);
      }

      const parsedContent = this.parseEmotes(content);
      const message: TypedMessage = {
        id: uuidv4(),
        user,
        content,
        renderedContent: parsedContent !== content ? parsedContent : undefined,
        type,
        timestamp: new Date(),
        data,
        serverId: this.serverId,
        channelId
      };
      this.storeMessage(message);
      // update last message timestamp to the stored time to be precise
      try {
        const uname = typeof user === 'string' ? user : (user.username || user.id || String(user));
        const channelMap = this.lastMessageAt.get(channelId) ?? new Map();
        channelMap.set(uname, Date.now());
        this.lastMessageAt.set(channelId, channelMap);
      } catch (e) {}
      this.io.to(channelId).emit('message', message);
      res.json({ status: 'ok', message });
    });

    // Moderation endpoints
    this.app.post('/moderate', (req, res) => {
      // Moderation actions
    });

    // Administrative endpoints protected by an admin token
    this.app.post('/admin/notify', this.requireAdmin((req, res) => {
      const { message, channelIds, type = 'maintenance' } = req.body || {};
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const result = this.broadcastSystemMessage(type, message, Array.isArray(channelIds) ? channelIds : undefined);
      res.json({ success: true, notice: result });
    }));

    this.app.post('/admin/shutdown', this.requireAdmin((req, res) => {
      const { message, delayMs = 500 } = req.body || {};
      const delay = Number(delayMs) || 500;
      if (message) {
        this.broadcastSystemMessage('shutdown', message);
      }

      res.json({ success: true, shuttingDown: true, delayMs: delay });

      setTimeout(() => {
        this.stop(message).catch((error) => {
          console.error('Error during shutdown:', error);
        });
      }, delay);
    }));

    this.app.post('/admin/restart', this.requireAdmin((req, res) => {
      const { message, delayMs = 1000 } = req.body || {};
      const delay = Number(delayMs) || 1000;
      if (message) {
        this.broadcastSystemMessage('restart', message);
      }

      res.json({ success: true, restarting: true, delayMs: delay });

      setTimeout(() => {
        this.restart(message, !!message).catch((error) => {
          console.error('Error during restart:', error);
        });
      }, delay);
    }));

    this.app.post('/admin/enable-e2ee', this.requireAdmin((req, res) => {
      this.e2eeEnabled = true;
      res.json({ success: true, message: 'E2EE enabled' });
    }));

    // Enable DB encryption: create encrypted copy of current DB. Does not
    // remove the plain DB by default; pass `removePlain: true` to delete it.
    this.app.post('/admin/db/encryption/enable', this.requireAdmin((req, res) => {
      const { passphrase, removePlain } = req.body || {};
      if (!passphrase || typeof passphrase !== 'string' || passphrase.length === 0) {
        return res.status(400).json({ error: 'passphrase is required' });
      }
      try {
        if (!fs.existsSync(this.dbPath)) return res.status(400).json({ error: 'Plain DB file not found' });
        if (fs.existsSync(this.dbEncPath)) return res.status(400).json({ error: 'Encrypted DB already exists' });
        this.encryptFile(this.dbPath, this.dbEncPath, passphrase);
        this.dbEncrypted = true;
        // Persist flag so future restarts know DB is encrypted
        this.persistStateToDB();
        if (removePlain) {
          try { fs.unlinkSync(this.dbPath); } catch (e) { /* ignore */ }
        }
        res.json({ success: true, encryptedPath: this.dbEncPath });
      } catch (e) {
        console.error('Failed to enable DB encryption:', e);
        res.status(500).json({ error: 'Failed to enable DB encryption', detail: String(e) });
      }
    }));

    // Disable DB encryption: decrypt encrypted DB back to plain file. Does
    // not remove the encrypted file by default; pass `removeEnc: true` to delete it.
    this.app.post('/admin/db/encryption/disable', this.requireAdmin((req, res) => {
      const { passphrase, removeEnc } = req.body || {};
      if (!passphrase || typeof passphrase !== 'string' || passphrase.length === 0) {
        return res.status(400).json({ error: 'passphrase is required' });
      }
      try {
        if (!fs.existsSync(this.dbEncPath)) return res.status(400).json({ error: 'Encrypted DB not found' });
        this.decryptFile(this.dbEncPath, this.dbPath, passphrase);
        this.dbEncrypted = false;
        this.persistStateToDB();
        if (removeEnc) {
          try { fs.unlinkSync(this.dbEncPath); } catch (e) { /* ignore */ }
        }
        res.json({ success: true, dbPath: this.dbPath });
      } catch (e) {
        console.error('Failed to disable DB encryption:', e);
        res.status(500).json({ error: 'Failed to disable DB encryption', detail: String(e) });
      }
    }));

    // Upload and install a plugin from a zip file containing a plugin folder
    const pluginUpload = multer({ dest: path.join(os.tmpdir(), 'kiama-plugin-uploads') });
    this.app.post('/admin/plugins/install', pluginUpload.single('plugin'), this.requireAdmin(async (req, res) => {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: 'A plugin zip file is required' });
      }

      try {
        const pluginDir = path.join(this.dataRoot, 'plugins');

        // Extract zip to a temporary directory first for validation
        const tmpExtract = path.join(os.tmpdir(), `kiama-plugin-${Date.now()}`);
        fs.mkdirSync(tmpExtract, { recursive: true });

        await fs.createReadStream(file.path)
          .pipe(unzipper.Extract({ path: tmpExtract }))
          .promise();

        // Determine the actual plugin root: either tmpExtract itself or a single
        // subdirectory inside it (zip files typically wrap everything in one folder).
        let pluginRoot = tmpExtract;
        const topEntries = fs.readdirSync(tmpExtract);
        if (topEntries.length === 1) {
          const single = path.join(tmpExtract, topEntries[0]);
          if (fs.statSync(single).isDirectory()) {
            pluginRoot = single;
          }
        }

        // Validate: must contain plugin.manifest.json
        const manifestPath = path.join(pluginRoot, 'plugin.manifest.json');
        if (!fs.existsSync(manifestPath)) {
          // Clean up
          fs.rmSync(tmpExtract, { recursive: true, force: true });
          fs.unlinkSync(file.path);
          return res.status(400).json({ error: 'Invalid plugin: missing plugin.manifest.json' });
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.name || !manifest.main) {
          fs.rmSync(tmpExtract, { recursive: true, force: true });
          fs.unlinkSync(file.path);
          return res.status(400).json({ error: 'Invalid manifest: name and main fields are required' });
        }

        // Sanitize the folder name to the manifest name
        const safeName = manifest.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const destDir = path.join(pluginDir, safeName);

        // Remove previous version if it exists
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true });
        }

        // Move plugin root to the final destination
        fs.renameSync(pluginRoot, destDir);

        // Clean up temp files
        if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true, force: true });
        fs.unlinkSync(file.path);

        // Reload plugins so the new one gets picked up
        this.pluginManager.reloadExternalPlugins(pluginDir);

        res.json({ success: true, name: manifest.name, version: manifest.version });
      } catch (error) {
        console.error('Plugin install failed:', error);
        try { fs.unlinkSync(file.path); } catch (_) {}
        res.status(500).json({ error: 'Failed to install plugin' });
      }
    }));

    // Uninstall a plugin (remove from memory and delete from disk)
    this.app.delete('/admin/plugins/:pluginName', this.requireAdmin((req, res) => {
      const { pluginName } = req.params;

      // Remove from in-memory registries
      const removedServer = this.pluginManager.removePlugin(pluginName);
      const removedClient = this.pluginManager.removeClientPlugin(pluginName);

      if (!removedServer && !removedClient) {
        return res.status(404).json({ error: `Plugin not found: ${pluginName}` });
      }

      // Delete the plugin folder from disk if it exists
      const safeName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const pluginDir = path.join(this.dataRoot, 'plugins', safeName);
      if (fs.existsSync(pluginDir) && fs.statSync(pluginDir).isDirectory()) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }

      res.json({ success: true, message: `Uninstalled plugin: ${pluginName}` });
    }));

    // Reload plugins from the data plugins directory without downloading
    this.app.post('/admin/plugins/reload', this.requireAdmin((_req, res) => {
      const pluginDir = path.join(this.dataRoot, 'plugins');
      this.pluginManager.reloadExternalPlugins(pluginDir);
      res.json({ success: true, reloadedFrom: pluginDir });
    }));

    this.app.get('/admin/config', this.requireAdmin((_req, res) => {
      res.json(this.getConfigSnapshot());
    }));

    // ── Backup endpoints ─────────────────────────────────────────────────────

    // List all backups
    this.app.get('/admin/backups', this.requireAdmin((_req, res) => {
      const backups = this.backupManager.listBackups();
      const config  = this.backupManager.getConfig();
      res.json({ backups, config });
    }));

    // Get backup schedule / config
    this.app.get('/admin/backups/config', this.requireAdmin((_req, res) => {
      res.json(this.backupManager.getConfig());
    }));

    // Set backup schedule / config
    this.app.post('/admin/backups/config', this.requireAdmin((req, res) => {
      const { schedule, maxBackups } = req.body || {};
      const validSchedules: BackupSchedule[] = ['manual', 'daily', 'weekly', 'monthly'];
      if (schedule !== undefined && !validSchedules.includes(schedule)) {
        return res.status(400).json({ error: `Invalid schedule. Valid values: ${validSchedules.join(', ')}` });
      }
      this.backupManager.setConfig({
        ...(schedule !== undefined ? { schedule } : {}),
        ...(maxBackups !== undefined ? { maxBackups: Number(maxBackups) } : {})
      });
      res.json({ success: true, config: this.backupManager.getConfig() });
    }));

    // Trigger a manual backup
    this.app.post('/admin/backups/create', this.requireAdmin(async (_req, res) => {
      try {
        const entry = await this.backupManager.createBackup();
        res.json({ success: true, backup: entry });
      } catch (error) {
        console.error('Backup creation failed:', error);
        res.status(500).json({ error: 'Backup creation failed', detail: String(error) });
      }
    }));

    // Restore from a backup
    this.app.post('/admin/backups/restore/:filename', this.requireAdmin(async (req, res) => {
      const { filename } = req.params;
      try {
        await this.backupManager.restoreBackup(filename);
        res.json({ success: true, message: `Restored from ${filename}. Restart the server to apply changes.` });
      } catch (error) {
        console.error('Backup restore failed:', error);
        res.status(500).json({ error: 'Restore failed', detail: String(error) });
      }
    }));

    // Delete a backup
    this.app.delete('/admin/backups/:filename', this.requireAdmin((req, res) => {
      const { filename } = req.params;
      const deleted = this.backupManager.deleteBackup(filename);
      if (!deleted) {
        return res.status(404).json({ error: 'Backup not found or invalid filename' });
      }
      res.json({ success: true });
    }));

    // Download a backup zip
    this.app.get('/admin/backups/download/:filename', this.requireAdmin((req, res) => {
      const { filename } = req.params;
      if (filename.includes('/') || filename.includes('..') || !filename.endsWith('.zip')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const backupsDir = path.join(this.dataRoot, 'Backups');
      const filePath = path.join(backupsDir, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup not found' });
      }
      res.download(filePath, filename);
    }));

    // ── Bot account endpoints (admin-only) ───────────────────────────────────

    // List all bot accounts
    this.app.get('/admin/accounts/bots', this.requireAdmin((_req, res) => {
      const bots = this.botAccountManager.listAll().map(b => ({
        id: b.id,
        username: b.username,
        botType: b.botType,
        isBot: b.isBot,
        isServerCreated: b.isServerCreated,
        linkedPlugin: b.linkedPlugin,
        preconfig: b.preconfig,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));
      res.json({ bots });
    }));

    // Create a bot account
    this.app.post('/admin/accounts/bots', this.requireAdmin((req, res) => {
      const { username, password, botType = 'chat', linkedPlugin, preconfig } = req.body || {};
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'password must be at least 6 characters' });
      }
      const validTypes = ['chat', 'moderator', 'custom'];
      if (!validTypes.includes(botType)) {
        return res.status(400).json({ error: `botType must be one of: ${validTypes.join(', ')}` });
      }
      try {
        // Hash the password using a simple PBKDF2 (no native bcrypt dependency required).
        const passwordHash = crypto
          .pbkdf2Sync(password, this.serverId, 100_000, 32, 'sha256')
          .toString('hex');
        const bot = this.botAccountManager.createBotAccount({
          username: username.trim(),
          passwordHash,
          botType,
          linkedPlugin,
          preconfig,
        });
        res.status(201).json({ success: true, bot: { id: bot.id, username: bot.username, botType: bot.botType, linkedPlugin: bot.linkedPlugin } });
      } catch (err) {
        res.status(409).json({ error: String(err) });
      }
    }));

    // Delete a bot account
    this.app.delete('/admin/accounts/bots/:username', this.requireAdmin((req, res) => {
      const { username } = req.params;
      const deleted = this.botAccountManager.delete(username);
      if (!deleted) {
        return res.status(404).json({ error: `Bot account "${username}" not found` });
      }
      res.json({ success: true });
    }));

    // Update a bot account (reset password and/or change type)
    this.app.patch('/admin/accounts/bots/:username', this.requireAdmin((req, res) => {
      const { username } = req.params;
      const { password, botType } = req.body || {};
      const account = this.botAccountManager.load(username);
      if (!account) {
        return res.status(404).json({ error: `Bot account "${username}" not found` });
      }
      if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 6) {
          return res.status(400).json({ error: 'password must be at least 6 characters' });
        }
        account.passwordHash = crypto
          .pbkdf2Sync(password, this.serverId, 100_000, 32, 'sha256')
          .toString('hex');
      }
      if (botType !== undefined) {
        const validTypes = ['chat', 'moderator', 'custom'];
        if (!validTypes.includes(botType)) {
          return res.status(400).json({ error: `botType must be one of: ${validTypes.join(', ')}` });
        }
        account.botType = botType;
      }
      this.botAccountManager.save(account);
      res.json({ success: true, account: { id: account.id, username: account.username, botType: account.botType } });
    }));
  }

  private getNextChannelPosition(sectionId?: string): number {
    const channelsInSection = Array.from(this.channels.values())
      .filter(channel => channel.sectionId === sectionId)
      .map(channel => channel.position);

    return channelsInSection.length > 0 ? Math.max(...channelsInSection) + 1 : 0;
  }

  private getNextSectionPosition(): number {
    const sectionPositions = Array.from(this.sections.values()).map(section => section.position);
    return sectionPositions.length > 0 ? Math.max(...sectionPositions) + 1 : 0;
  }

  private requireAdmin(handler: RequestHandler): RequestHandler {
    return (req, res, next) => {
      // Accept admin access either by the configured admin token OR by the server owner account.
      // The client may supply the admin token via `X-Admin-Token` header, `token` query param or body.token.
      // The client may supply the username via `X-Username` header, `username` query param or body.username.

      const tokenHeader = req.headers['x-admin-token'];
      const token = typeof tokenHeader === 'string'
        ? tokenHeader
        : Array.isArray(tokenHeader)
          ? tokenHeader[0]
          : (req.query.token as string) || (req.body?.token as string);

      const userHeader = req.headers['x-username'];
      const username = typeof userHeader === 'string'
        ? userHeader
        : Array.isArray(userHeader)
          ? userHeader[0]
          : (req.query.username as string) || (req.body?.username as string);

      // If an admin token is configured, accept it or the owner username.
      if (this.adminToken && this.adminToken.trim()) {
        if (token && token === this.adminToken) {
          return handler(req, res, next);
        }
        if (username && this.ownerUsername && username.toLowerCase() === this.ownerUsername.toLowerCase()) {
          return handler(req, res, next);
        }
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // No admin token configured: allow only if the request is from the server owner account.
      if (username && this.ownerUsername && username.toLowerCase() === this.ownerUsername.toLowerCase()) {
        return handler(req, res, next);
      }

      return res.status(403).json({ error: 'Admin token not configured on server' });
    };
  }

  private broadcastSystemMessage(type: string, content: string, channelIds?: string[]) {
    const targets = channelIds && channelIds.length > 0
      ? channelIds.filter(id => this.channels.has(id))
      : Array.from(this.channels.keys());

    const timestamp = new Date();

    targets.forEach(channelId => {
      const message: TypedMessage = {
        id: uuidv4(),
        user: this.serverName,
        content,
        type: 'system',
        timestamp,
        data: { subtype: type },
        serverId: this.serverId,
        channelId
      };

      if (!this.messages.has(channelId)) {
        this.messages.set(channelId, []);
      }
      this.messages.get(channelId)!.push(message);
      this.io.to(`channel_${channelId}`).emit('message', message);
    });

    this.io.emit('server_notice', {
      type,
      content,
      serverId: this.serverId,
      at: timestamp.toISOString()
    });

    return { type, content, channels: targets };
  }

  private getConfigSnapshot() {
    return {
      serverId: this.serverId,
      name: this.serverName,
      sections: Array.from(this.sections.values()),
      channels: Array.from(this.channels.values()),
      roles: Array.from(this.roles.values()),
      allowClaimOwnership: this.allowClaimOwnership !== false
    };
  }

  public async stop(reason?: string) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    if (reason) {
      console.log(`Stopping server: ${reason}`);
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this.backupManager.stopScheduler();

    await new Promise<void>((resolve) => this.io.close(() => resolve()));
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) return reject(error);
        return resolve();
      });
    });
  }

  public async restart(reason?: string, skipBroadcast?: boolean) {
    const message = reason || 'Restarting server';
    if (!skipBroadcast) {
      this.broadcastSystemMessage('restart', message);
    }
    await this.stop(message);
    process.exit(0);
  }

  private setupSocket() {
    this.io.on('connection', (socket) => {
      console.log('User connected');

      socket.on('identify', (data: { username: string; accountId?: string }) => {
        if (!data?.username) return;
        this.connectedUsers.set(socket.id, { username: data.username, accountId: data.accountId });

        // If the connecting user is the server owner, ensure they always have the admin/owner role
        if (this.isOwnerMatch(data.username, data.accountId)) {
          const adminRoleId = this.findAdminRoleId();
          if (adminRoleId && this.userRoles.get(data.username) !== adminRoleId) {
            this.userRoles.set(data.username, adminRoleId);
            this.saveToDisk();
            this.io.emit('member_role_updated', { username: data.username, role: adminRoleId });
          }
        } else if (!this.userRoles.has(data.username)) {
          // Assign the default lowest-permission role (e.g., Member) so new joiners get sensible access
          const memberRoleId = this.findMemberRoleId();
          if (memberRoleId) {
            this.userRoles.set(data.username, memberRoleId);
            this.saveToDisk();
            this.io.emit('member_role_updated', { username: data.username, role: memberRoleId });
          }
        }
        this.io.emit('user_online', { username: data.username });
        // Persist online status to DB members table
        try {
          const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO members (serverId, username, nickname, role, status) VALUES (?, ?, ?, ?, ?)
          `);
          const update = this.db.prepare(`
            UPDATE members SET status = ?, role = COALESCE(?, role) WHERE serverId = ? AND username = ?
          `);
          const role = this.userRoles.get(data.username) ?? null;
          stmt.run(this.serverId, data.username, null, role, 'online');
          update.run('online', role, this.serverId, data.username);
        } catch (e) {
          console.warn('Failed to persist member online status:', e);
        }
      });

      socket.on('join_channel', (data: { channelId: string, nsfwAck?: boolean }) => {
        const channel = this.channels.get(data.channelId);
        if (!channel) return;

        // If the channel is marked NSFW, require client acknowledgement before
        // allowing the socket to join and receive history. Clients may pass
        // `nsfwAck: true` when they have confirmed age; otherwise emit a
        // `nsfw_required` event so the client can prompt the user.
        if (channel.settings?.nsfw) {
          if (!data.nsfwAck) {
            socket.emit('nsfw_required', { channelId: data.channelId });
            console.log(`NSFW acknowledgement required for channel: ${channel.name}`);
            return;
          }
        }

        socket.join(`channel_${data.channelId}`);
        console.log(`User joined channel: ${channel.name}`);

        // Send recent messages for this channel
        const channelMessages = this.messages.get(data.channelId) || [];
        socket.emit('channel_history', {
          channelId: data.channelId,
          messages: channelMessages.slice(-50) // Last 50 messages
        });
      });

      socket.on('leave_channel', (data: { channelId: string }) => {
        socket.leave(`channel_${data.channelId}`);
        console.log(`User left channel: ${data.channelId}`);
      });

      socket.on('message', (data, ack) => {
        // Handle real-time messages with type and channel support
        const channelId = data.channelId || 'general';
        const channel = this.channels.get(channelId);

        if (!channel) {
          if (typeof ack === 'function') ack({ ok: false, reason: 'channel_not_found' });
          else socket.emit('error', { message: 'Channel not found' });
          return;
        }

        // Check write permissions (simplified - no roles yet)
        if (!channel.permissions?.write) {
          if (typeof ack === 'function') ack({ ok: false, reason: 'no_write_permission' });
          else socket.emit('error', { message: 'No write permission for this channel' });
          return;
        }

        // Enforce slow mode per-channel unless user has manage permissions
        const slow = channel?.settings?.slowMode ? Number(channel!.settings!.slowMode || 0) : 0;
        const username = typeof data.user === 'string' ? data.user : (data.user?.username || data.user?.id || String(data.user));
        const accountId = typeof data.user === 'string' ? undefined : (data.user?.id || data.user?.accountId || undefined);
        const userRoleName = this.userRoles.get(username) || '';
        const roleObj = Array.from(this.roles.values()).find(r => (r.name || '').toLowerCase() === (userRoleName || '').toLowerCase() || (r.id || '').toLowerCase() === (userRoleName || '').toLowerCase());
        const isOwner = this.isOwnerMatch(username, accountId);
        const bypassSlow = !!(isOwner || roleObj?.permissions?.manageServer || roleObj?.permissions?.manageChannels || roleObj?.permissions?.manageMessages);
        if (slow > 0 && !bypassSlow) {
          const now = Date.now();
          let channelMap = this.lastMessageAt.get(channelId);
          if (!channelMap) {
            channelMap = new Map();
            this.lastMessageAt.set(channelId, channelMap);
          }
          const last = channelMap.get(username) || 0;
          if (last && (now - last) < slow * 1000) {
            const elapsed = Math.floor((now - last) / 1000);
            const wait = Math.max(1, slow - elapsed);
            if (typeof ack === 'function') {
              ack({ ok: false, reason: 'slow_mode', retryAfter: wait });
            } else {
              socket.emit('message_rejected', { reason: 'slow_mode', retryAfter: wait });
            }
            return;
          }
          // provisional record
          channelMap.set(username, now);
        }

        const message: TypedMessage = {
          id: data.id || uuidv4(),
          user: data.user || 'Anonymous',
          userRole: data.userRole,
          content: data.content || '',
          type: data.type || 'text',
          timestamp: new Date(),
          data: data.data,
          serverId: this.serverId,
          replyTo: data.replyTo ? { id: data.replyTo.id, user: data.replyTo.user, content: data.replyTo.content } : undefined,
          channelId: channelId
        };

        // Parse emotes in content for text messages
        if (message.type === 'text') {
          const parsedContent = this.parseEmotes(message.content);
          if (parsedContent !== message.content) {
            message.renderedContent = parsedContent;
          }
        }

        // Store message
        const channelMessages = this.messages.get(channelId) || [];
        channelMessages.push(message);
        this.messages.set(channelId, channelMessages);

        // Persist to database
        this.storeMessage(message);

        // update last message timestamp (precise)
        try {
          const uname = typeof data.user === 'string' ? data.user : (data.user?.username || data.user?.id || String(data.user));
          const channelMap = this.lastMessageAt.get(channelId) ?? new Map();
          channelMap.set(uname, Date.now());
          this.lastMessageAt.set(channelId, channelMap);
        } catch (e) {}

        // Broadcast to channel room
        this.io.to(`channel_${channelId}`).emit('message', message);

        if (typeof ack === 'function') ack({ ok: true, message });
      });

      // Pin or unpin a message (requires manageMessages/manageChannels or owner)
      socket.on('pin_message', (data: { messageId: string; channelId: string; pin: boolean }, ack) => {
        try {
          const { messageId, channelId, pin } = data || {} as any;
          if (!messageId || !channelId) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'invalid_args' });
            return;
          }
          const channel = this.channels.get(channelId);
          if (!channel) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'channel_not_found' });
            return;
          }
          // Check if channel allows pinning
          if (!channel.settings?.allowPinning) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'pinning_disabled' });
            return;
          }

          // Permission check: ensure requester is allowed to manage messages or channel
          const conn = this.connectedUsers.get(socket.id);
          const username = conn?.username || '';
          const accountId = conn?.accountId;
          const userRoleName = this.userRoles.get(username) || '';
          const roleObj = Array.from(this.roles.values()).find(r => (r.name || '').toLowerCase() === (userRoleName || '').toLowerCase() || (r.id || '').toLowerCase() === (userRoleName || '').toLowerCase());
          const isOwner = this.isOwnerMatch(username, accountId);
          const allowed = !!(isOwner || roleObj?.permissions?.manageMessages || roleObj?.permissions?.manageChannels);
          if (!allowed) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'no_permission' });
            return;
          }

          // Find and update the message in memory
          const channelMessages = this.messages.get(channelId) || [];
          const idx = channelMessages.findIndex(m => m.id === messageId);
          if (idx === -1) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'message_not_found' });
            return;
          }
          const old = channelMessages[idx];
          const updated = { ...old, pinned: !!pin };
          channelMessages[idx] = updated;
          this.messages.set(channelId, channelMessages);

          // Persist change
          this.updateMessage(messageId, { pinned: !!pin });

          // Broadcast update to channel
          this.io.to(`channel_${channelId}`).emit('message-update', { messageId, modifiedMessage: { pinned: !!pin } });

          if (typeof ack === 'function') ack({ ok: true, messageId, pinned: !!pin });
        } catch (e) {
          console.warn('Error handling pin_message:', e);
          if (typeof ack === 'function') ack({ ok: false, reason: 'internal_error' });
        }
      });

      socket.on('get_channels', () => {
        const channels = Array.from(this.channels.values());
        const sections = Array.from(this.sections.values());
        socket.emit('channels_list', { channels, sections, serverId: this.serverId });
      });

      socket.on('disconnect', () => {
        console.log('User disconnected');
        const conn = this.connectedUsers.get(socket.id);
        const username = conn?.username;
        this.connectedUsers.delete(socket.id);
        if (username) {
          const stillOnline = Array.from(this.connectedUsers.values()).some(u => u.username === username);
          if (!stillOnline) this.io.emit('user_offline', { username });
          // Update DB status to offline if no sockets remain for this username
          try {
            if (!stillOnline) {
              const upd = this.db.prepare(`UPDATE members SET status = ? WHERE serverId = ? AND username = ?`);
              upd.run('offline', this.serverId, username);
            }
          } catch (e) {
            console.warn('Failed to persist member offline status:', e);
          }
        }
      });
    });
  }

  private parseEmotes(content: string): string {
    let parsed = content;
    console.log('[parseEmotes] emotes count:', this.emotes.size, 'content:', content);
    for (const [name, data] of this.emotes) {
      const regex = new RegExp(`:${name}:`, 'g');
      const replacement = `<img src="/emotes/${data.filename}" alt="${name}" class="emote">`;
      if (regex.test(content)) {
        console.log('[parseEmotes] Found emote:', name, '-> replacing with', replacement);
      }
      parsed = parsed.replace(regex, replacement);
    }
    console.log('[parseEmotes] result:', parsed);
    return parsed;
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`${this.serverName} running on port ${this.port} in ${this.mode} mode (id: ${this.serverId})`);
    });
  }

  public addToWhitelist(user: string) {
    this.whitelist.add(user);
  }

  public addToBlacklist(user: string) {
    this.blacklist.add(user);
  }
}