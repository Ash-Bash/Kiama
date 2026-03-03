import express, { RequestHandler } from 'express';
import { Server as SocketServer } from 'socket.io';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
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
  type: string;
  timestamp: Date;
  data?: any;
  serverId: string;
  channelId: string;
  replyTo?: { id: string; user: string; content: string };
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
  private emotes: Map<string, string> = new Map(); // name -> filename
  private channels: Map<string, Channel> = new Map();
  private sections: Map<string, ChannelSection> = new Map();
  private roles: Map<string, Role> = new Map();
  private messages: Map<string, TypedMessage[]> = new Map(); // channelId -> messages[]
  private messageHandlers: ((message: any) => any)[] = []; // Plugin message handlers
  private userRoles: Map<string, string> = new Map();        // username → role name
  private connectedUsers: Map<string, string> = new Map(); // socketId → username
  private systemStats: SystemStats | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private db: Database.Database;
  private e2eeEnabled = false;
  private backupManager: BackupManager;
  private botAccountManager: BotAccountManager;
  private initialConfigPath: string | undefined;
  private ownerUsername: string = '';
  private allowClaimOwnership: boolean = true;

  constructor(port: number, mode: 'public' | 'private', serverId?: string, adminToken?: string, initialConfig?: InitialServerConfig, initialConfigPath?: string) {
    this.port = port;
    this.mode = mode;
    this.serverId = serverId || uuidv4();
    this.serverName = initialConfig?.name || 'KIAMA Server';
    this.ownerUsername = initialConfig?.ownerUsername ?? '';
    this.allowClaimOwnership = initialConfig?.allowClaimOwnership ?? true;
    this.adminToken = (adminToken || process.env.KIAMA_ADMIN_TOKEN || '').toString().trim();
    this.dataRoot = process.env.KIAMA_DATA_DIR || path.join(__dirname, 'data');
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
    }, undefined, [path.join(__dirname, '../../server/plugins'), path.join(this.dataRoot, 'plugins')]);

    this.ensureDataLayout();
    this.db = new Database(path.join(this.dataRoot, 'kiama.db'));
    this.initializeDatabase();
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
        const status = Array.from(this.connectedUsers.values()).some(u => u === username) ? 'online' : 'offline';
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
    const emotesDir = path.join(__dirname, '../emotes');
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
      path.join(this.dataRoot, 'media')
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
        PRIMARY KEY (serverId, roleId)
      );
    `);
  }

  private storeMessage(message: TypedMessage) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, channelId, user, userRole, content, type, timestamp, data, serverId, mediaPath, replyToId, replyToUser, replyToContent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      message.replyTo ? message.replyTo.content : null
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
        mediaPath = COALESCE(?, mediaPath)
      WHERE id = ?
    `);
    stmt.run(
      modifiedMessage.user,
      modifiedMessage.userRole,
      modifiedMessage.content,
      modifiedMessage.type,
      modifiedMessage.data ? JSON.stringify(modifiedMessage.data) : null,
      (modifiedMessage.data && modifiedMessage.data.mediaPath) ? modifiedMessage.data.mediaPath : null,
      messageId
    );
  }

  private loadMessagesFromDB() {
    const stmt = this.db.prepare('SELECT * FROM messages ORDER BY timestamp ASC');
    const rows = stmt.all() as any[];
    for (const row of rows) {
      const message: TypedMessage = {
        id: row.id,
        channelId: row.channelId,
        user: row.user,
        userRole: row.userRole,
        content: row.content,
        type: row.type,
        timestamp: new Date(row.timestamp),
        data: row.data ? JSON.parse(row.data) : undefined,
        serverId: row.serverId,
        replyTo: row.replyToId ? { id: row.replyToId, user: row.replyToUser, content: row.replyToContent } : undefined
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
      this.applyInitialConfig(config);
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
          ownerUsername: this.ownerUsername || undefined,
          userRoles: this.userRoles.size > 0 ? Object.fromEntries(this.userRoles.entries()) : undefined,
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
        manageMessages: true
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
        manageMessages: false
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

  private applyInitialConfig(config: InitialServerConfig) {
    if (config.ownerUsername) this.ownerUsername = config.ownerUsername;
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
    this.app.use('/emotes', express.static(path.join(__dirname, '../emotes')));

    const upload = multer({ dest: path.join(__dirname, '../emotes') });

    this.app.post('/upload-emote', upload.single('emote'), (req, res) => {
      if (!req.file) {
        return res.status(400).send('No file uploaded');
      }
      const name = req.body.name || path.parse(req.file.originalname).name;
      const ext = path.extname(req.file.originalname);
      const filename = `${name}${ext}`;
      const filepath = path.join(__dirname, '../emotes', filename);
      fs.renameSync(req.file.path, filepath);
      this.emotes.set(name, filename);
      res.send({ name, url: `/emotes/${filename}` });
    });

    this.app.get('/emotes-list', (req, res) => {
      const list = Array.from(this.emotes.entries()).map(([name, filename]) => ({
        name,
        url: `/emotes/${filename}`
      }));
      res.send(list);
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
        serverPlugins: this.pluginManager.getEnabledPlugins().map(p => ({ name: p.name, enabled: p.enabled !== false })),
        clientPlugins: this.pluginManager.getEnabledClientPlugins().map(p => ({ name: p.name, enabled: p.enabled !== false }))
      });
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
        iconUrl: iconPath ? '/server/icon' : null,
        allowClaimOwnership: this.allowClaimOwnership !== false,
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
      const { username, token } = req.body;
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
      // Assign the owner the admin role so they get full permissions
      const adminRoleId = this.findAdminRoleId();
      if (adminRoleId) {
        this.userRoles.set(this.ownerUsername, adminRoleId);
      }
      this.saveToDisk();
      this.io.emit('member_role_updated', { username: this.ownerUsername, role: adminRoleId });
      res.json({ success: true, ownerUsername: this.ownerUsername });
    });

    // GET /members — list all known members with their roles and online status
    this.app.get('/members', (req, res) => {
      try {
        const stmt = this.db.prepare('SELECT username, role, status FROM members WHERE serverId = ?');
        const rows = stmt.all(this.serverId) as Array<{ username: string; role?: string; status?: string }>;
        const members = rows.map(r => ({ username: r.username, role: r.role, status: r.status || 'offline' }));
        // Include any online usernames not yet stored in members
        const onlineUsernames = Array.from(this.connectedUsers.values());
        const present = new Set(members.map(m => m.username));
        for (const username of onlineUsernames) {
          if (!present.has(username)) members.push({ username, role: undefined, status: 'online' });
        }
        res.json({ members });
      } catch (e) {
        // Fallback to in-memory representation on DB error
        const onlineUsernames = new Set(this.connectedUsers.values());
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
        permissions: permissions || { manageServer: false, manageChannels: false, manageRoles: false, viewChannels: true, sendMessages: true, manageMessages: false },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.roles.set(role.id, role);
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
      const message: TypedMessage = {
        id: uuidv4(),
        user,
        content: this.parseEmotes(content),
        type,
        timestamp: new Date(),
        data,
        serverId: this.serverId,
        channelId
      };
      this.storeMessage(message);
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

    // Download and reload plugins from a remote URL into the server plugins folder
    this.app.post('/admin/plugins/install', this.requireAdmin(async (req, res) => {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }

      try {
        const pluginDir = path.join(this.dataRoot, 'plugins');
        const urlPath = new URL(url);
        const filename = path.basename(urlPath.pathname) || `plugin-${Date.now()}.js`;
        const destPath = path.join(pluginDir, filename);

        const response = await fetch(url);
        if (!response.ok) {
          return res.status(400).json({ error: `Failed to download plugin: ${response.status} ${response.statusText}` });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(destPath, buffer, { mode: 0o600 });

        this.pluginManager.reloadExternalPlugins(pluginDir);

        res.json({ success: true, savedAs: destPath });
      } catch (error) {
        console.error('Plugin download failed:', error);
        res.status(500).json({ error: 'Failed to download or load plugin' });
      }
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
      if (!this.adminToken) {
        return res.status(403).json({ error: 'Admin token not configured on server' });
      }

      const tokenHeader = req.headers['x-admin-token'];
      const token = typeof tokenHeader === 'string'
        ? tokenHeader
        : Array.isArray(tokenHeader)
          ? tokenHeader[0]
          : (req.query.token as string) || (req.body?.token as string);

      if (!token || token !== this.adminToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return handler(req, res, next);
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

      socket.on('identify', (data: { username: string }) => {
        if (!data?.username) return;
        this.connectedUsers.set(socket.id, data.username);
        // Also register in userRoles if not present yet (keeps them in the member list)
        if (!this.userRoles.has(data.username)) {
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

      socket.on('message', (data) => {
        // Handle real-time messages with type and channel support
        const channelId = data.channelId || 'general';
        const channel = this.channels.get(channelId);

        if (!channel) {
          socket.emit('error', { message: 'Channel not found' });
          return;
        }

        // Check write permissions (simplified - no roles yet)
        if (!channel.permissions?.write) {
          socket.emit('error', { message: 'No write permission for this channel' });
          return;
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
          message.content = this.parseEmotes(message.content);
        }

        // Store message
        const channelMessages = this.messages.get(channelId) || [];
        channelMessages.push(message);
        this.messages.set(channelId, channelMessages);

        // Persist to database
        this.storeMessage(message);

        // Broadcast to channel room
        this.io.to(`channel_${channelId}`).emit('message', message);
      });

      socket.on('get_channels', () => {
        const channels = Array.from(this.channels.values());
        const sections = Array.from(this.sections.values());
        socket.emit('channels_list', { channels, sections, serverId: this.serverId });
      });

      socket.on('disconnect', () => {
        console.log('User disconnected');
        const username = this.connectedUsers.get(socket.id);
        this.connectedUsers.delete(socket.id);
        if (username) {
          const stillOnline = Array.from(this.connectedUsers.values()).some(u => u === username);
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
    for (const [name, filename] of this.emotes) {
      const regex = new RegExp(`:${name}:`, 'g');
      parsed = parsed.replace(regex, `<img src="/emotes/${filename}" alt="${name}" class="emote">`);
    }
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