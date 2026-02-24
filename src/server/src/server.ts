import express, { RequestHandler } from 'express';
import { Server as SocketServer } from 'socket.io';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import SecurePluginManager from './utils/PluginManager';
import { ClientPluginMetadata } from './types/plugin';

export interface TypedMessage {
  id: string;
  user: string;
  content: string;
  type: string;
  timestamp: Date;
  data?: any;
  serverId: string;
  channelId: string;
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
  roles?: string[]; // Role IDs that have access
}

export interface SectionPermissions {
  view: boolean;
  manage: boolean;
  roles?: string[]; // Role IDs that have access
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
  private systemStats: SystemStats | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(port: number, mode: 'public' | 'private', serverId?: string, adminToken?: string, initialConfig?: InitialServerConfig) {
    this.port = port;
    this.mode = mode;
    this.serverId = serverId || uuidv4();
    this.serverName = initialConfig?.name || 'KIAMA Server';
    this.adminToken = adminToken || process.env.KIAMA_ADMIN_TOKEN || '';
    this.dataRoot = process.env.KIAMA_DATA_DIR || path.join(__dirname, '../data');
    this.configFilePath = process.env.KIAMA_CONFIG_PATH || path.join(this.dataRoot, 'configs', `${this.serverId}.json`);
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
        // Also store in messages array
        if (!this.messages.has(message.channelId)) {
          this.messages.set(message.channelId, []);
        }
        this.messages.get(message.channelId)!.push(message);
      },
      modifyMessage: (messageId, modifiedMessage) => {
        // Find and modify message
        console.log('Plugin modifying message:', messageId);
        for (const [channelId, messages] of this.messages) {
          const messageIndex = messages.findIndex(msg => msg.id === messageId);
          if (messageIndex !== -1) {
            messages[messageIndex] = { ...messages[messageIndex], ...modifiedMessage };
            // Emit update to clients
            this.io.to(channelId).emit('message-update', { messageId, modifiedMessage });
            break;
          }
        }
      }
    }, undefined, [path.join(__dirname, '../../server/plugins'), path.join(this.dataRoot, 'plugins')]);

    this.ensureDataLayout();
    this.ensureEmotesDir();
    this.ensureAdminToken();
    this.initializeServerState(initialConfig);
    this.setupRoutes();
    this.setupSocket();
    this.pluginManager.loadPlugins();
    this.startSystemMonitoring();

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
      path.join(this.dataRoot, 'secrets')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
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
    if (initialConfig) {
      this.applyInitialConfig(initialConfig);
    } else {
      this.initializeDefaultChannels();
      this.initializeDefaultRoles();
    }
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
    const adminRole: Role = {
      id: 'admin',
      name: 'Admin',
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

    this.roles.set(adminRole.id, adminRole);
    this.roles.set(memberRole.id, memberRole);
  }

  private applyInitialConfig(config: InitialServerConfig) {
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
    } else {
      // If no channels provided, create a general channel under the first section
      const firstSectionId = this.sections.keys().next().value;
      const generalChannel: Channel = {
        id: 'general',
        name: 'general',
        type: 'text',
        sectionId: firstSectionId,
        position: 0,
        permissions: { read: true, write: true, manage: false },
        settings: { nsfw: false, slowMode: 0, allowPinning: true },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.channels.set(generalChannel.id, generalChannel);
      this.messages.set(generalChannel.id, []);
    }
  }

  public getSystemStats(): SystemStats | null {
    return this.systemStats;
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

    // Create default channels
    const generalChannel: Channel = {
      id: 'general',
      name: 'general',
      type: 'text',
      sectionId: 'general',
      position: 0,
      permissions: { read: true, write: true, manage: false },
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
      permissions: { read: true, write: false, manage: false }, // Read-only for regular users
      settings: { nsfw: false, slowMode: 0, allowPinning: true },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.channels.set(announcementsChannel.id, announcementsChannel);
    this.messages.set(announcementsChannel.id, []);
  }

  private setupRoutes() {
    this.app.use(express.json());
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

    // System stats endpoint
    this.app.get('/system/stats', (req, res) => {
      const stats = this.getSystemStats();
      if (!stats) {
        return res.status(503).json({ error: 'System stats not available' });
      }
      res.json(stats);
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

      const channel: Channel = {
        id: uuidv4(),
        name: name.trim(),
        type,
        sectionId,
        position: this.getNextChannelPosition(sectionId),
        permissions: { read: true, write: true, manage: false },
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
      res.json(channel);
    });

    this.app.post('/sections', (req, res) => {
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Section name is required' });
      }

      const section: ChannelSection = {
        id: uuidv4(),
        name: name.trim(),
        position: this.getNextSectionPosition(),
        permissions: { view: true, manage: false },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.sections.set(section.id, section);

      this.io.emit('section_created', section);
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

      // Move channels in this section to no section
      for (const channel of this.channels.values()) {
        if (channel.sectionId === sectionId) {
          channel.sectionId = undefined;
          channel.updatedAt = new Date();
        }
      }

      this.sections.delete(sectionId);

      this.io.emit('section_deleted', { sectionId });
      res.json({ success: true });
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
      const { user, content, media } = req.body;
      // Parse emotes in content
      const parsedContent = this.parseEmotes(content);
      // Encrypt and store
      res.send({ status: 'ok', parsedContent });
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
      roles: Array.from(this.roles.values())
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

      socket.on('join_channel', (data: { channelId: string }) => {
        const channel = this.channels.get(data.channelId);
        if (channel) {
          socket.join(`channel_${data.channelId}`);
          console.log(`User joined channel: ${channel.name}`);

          // Send recent messages for this channel
          const channelMessages = this.messages.get(data.channelId) || [];
          socket.emit('channel_history', {
            channelId: data.channelId,
            messages: channelMessages.slice(-50) // Last 50 messages
          });
        }
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
          id: uuidv4(),
          user: data.user || 'Anonymous',
          content: data.content || '',
          type: data.type || 'text',
          timestamp: new Date(),
          data: data.data,
          serverId: this.serverId,
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