import express from 'express';
import { Server as SocketServer } from 'socket.io';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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

export interface Role {
  id: string;
  name: string;
  color?: string;
  position: number;
  permissions: {
    manageServer: boolean;
    manageChannels: boolean;
    manageRoles: boolean;
    kickMembers: boolean;
    banMembers: boolean;
    sendMessages: boolean;
    viewChannels: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelMetrics {
  messageCount: number;
  mediaCount: number;
  lastActiveAt: Date | null;
  uniqueSenders: Set<string>;
}

export interface MediaEntry {
  id: string;
  channelId: string;
  user: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  type: 'image' | 'video' | 'other';
  url: string;
  uploadedAt: Date;
}

export interface ChannelPermissions {
  read: boolean;
  write: boolean;
  manage: boolean;
  roles?: string[]; // Legacy: roles that can both read/write
  readRoles?: string[]; // Roles that can read (if set)
  writeRoles?: string[]; // Roles that can write (if set)
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

/** Core KIAMA server implementation backed by Express and Socket.IO. */
export class Server {
  private app: express.Application;
  private server: http.Server;
  private io: SocketServer;
  private port: number;
  private mode: 'public' | 'private';
  private serverId: string;
  private serverPasswordHash?: string;
  private whitelist: Set<string> = new Set();
  private blacklist: Set<string> = new Set();
  private pluginManager: SecurePluginManager;
  private emotes: Map<string, { filename: string, serverId: string }> = new Map(); // name -> {filename, serverId}
  private mediaIndex: Map<string, MediaEntry[]> = new Map(); // channelId -> media entries
  private channels: Map<string, Channel> = new Map();
  private sections: Map<string, ChannelSection> = new Map();
  private messages: Map<string, TypedMessage[]> = new Map(); // channelId -> messages[]
  private channelMetrics: Map<string, ChannelMetrics> = new Map();
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, Set<string>> = new Map();
  private messageHandlers: ((message: any) => any)[] = []; // Plugin message handlers
  private systemStats: SystemStats | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private activeConnections = 0;

  /** Configure network listeners, plugin manager, and defaults. */
  constructor(port: number, mode: 'public' | 'private', serverId?: string, serverPassword?: string) {
    this.port = port;
    this.mode = mode;
    this.serverId = serverId || uuidv4();
    this.serverPasswordHash = serverPassword ? this.hashPassword(serverPassword) : undefined;
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
    });

    this.ensureEmotesDir();
    this.ensureMediaDir();
    this.initializeDefaultChannels();
    this.initializeDefaultRoles();
    this.setupRoutes();
    this.setupSocket();
    this.pluginManager.loadPlugins();
    this.startSystemMonitoring();
  }

  /** Create the emotes directory if it does not already exist. */
  private ensureEmotesDir() {
    const emotesDir = path.join(__dirname, '../emotes');
    if (!fs.existsSync(emotesDir)) {
      fs.mkdirSync(emotesDir, { recursive: true });
    }
  }

  /** Create the media directory if it does not already exist. */
  private ensureMediaDir() {
    const mediaDir = path.join(__dirname, '../media');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
  }

  /** Begin periodic system stats collection for the health endpoint. */
  private startSystemMonitoring() {
    // Update stats immediately
    this.updateSystemStats();

    // Update stats every 30 seconds
    this.statsInterval = setInterval(() => {
      this.updateSystemStats();
    }, 30000);
  }

  /** Collect CPU, memory, and storage stats for status reporting. */
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

  /**
   * Rough disk usage approximation. Replace with a richer implementation when
   * moving beyond demos.
   */
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

  /** Retrieve the latest cached system stats snapshot. */
  public getSystemStats(): SystemStats | null {
    return this.systemStats;
  }

  /** Seed the server with starter sections and channels. */
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
    this.ensureChannelMetrics(generalChannel.id);

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
    this.ensureChannelMetrics(announcementsChannel.id);
  }

  /** Seed default roles with an "everyone" baseline. */
  private initializeDefaultRoles() {
    const everyone: Role = {
      id: 'everyone',
      name: '@everyone',
      color: '#9ca3af',
      position: 0,
      permissions: {
        manageServer: false,
        manageChannels: false,
        manageRoles: false,
        kickMembers: false,
        banMembers: false,
        sendMessages: true,
        viewChannels: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.roles.set(everyone.id, everyone);
  }

  /** Wire up REST endpoints for media, plugins, channels, and moderation. */
  private setupRoutes() {
    this.app.use(express.json());
    this.app.use('/emotes', express.static(path.join(__dirname, '../emotes')));
    this.app.use('/media', express.static(path.join(__dirname, '../media')));

    const emoteUpload = multer({ dest: path.join(__dirname, '../emotes') });
    const mediaUpload = multer({ dest: path.join(__dirname, '../media') });

    this.app.post('/upload-emote', emoteUpload.single('emote'), (req, res) => {
      if (!req.file) {
        return res.status(400).send('No file uploaded');
      }
      const name = req.body.name || path.parse(req.file.originalname).name;
      const ext = path.extname(req.file.originalname);
      const filename = `${name}${ext}`;
      const filepath = path.join(__dirname, '../emotes', filename);
      fs.renameSync(req.file.path, filepath);
      this.emotes.set(name, { filename, serverId: this.serverId });
      res.send({ name, url: `/emotes/${filename}`, serverId: this.serverId });
    });

    this.app.get('/emotes-list', (req, res) => {
      const list = Array.from(this.emotes.entries()).map(([name, emoteData]) => ({
        name,
        url: `/emotes/${emoteData.filename}`,
        serverId: emoteData.serverId
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

    // Verify server join password (for pre-flight before socket connect)
    this.app.post('/server/password/verify', (req, res) => {
      const { password } = req.body;
      if (!this.serverPasswordHash) {
        return res.json({ required: false, valid: true });
      }
      if (typeof password !== 'string') {
        return res.status(400).json({ required: true, valid: false, error: 'Password missing' });
      }
      const valid = this.hashPassword(password) === this.serverPasswordHash;
      res.json({ required: true, valid });
    });

    // Server-level metrics (messages, media, connections)
    this.app.get('/metrics/server', (_req, res) => {
      const totalMessages = Array.from(this.messages.values()).reduce((acc, msgs) => acc + msgs.length, 0);
      const totalMedia = Array.from(this.mediaIndex.values()).reduce((acc, media) => acc + media.length, 0);
      res.json({
        serverId: this.serverId,
        totalChannels: this.channels.size,
        totalSections: this.sections.size,
        totalRoles: this.roles.size,
        totalUsersTracked: this.userRoles.size,
        activeConnections: this.activeConnections,
        totalMessages,
        totalMedia
      });
    });

    // Channel-level metrics for dashboards
    this.app.get('/metrics/channels', (_req, res) => {
      const metrics = Array.from(this.channelMetrics.entries()).map(([channelId, stats]) => ({
        channelId,
        messageCount: stats.messageCount,
        mediaCount: stats.mediaCount,
        lastActiveAt: stats.lastActiveAt,
        uniqueSenders: Array.from(stats.uniqueSenders)
      }));

      res.json({ serverId: this.serverId, metrics });
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
      this.ensureChannelMetrics(channel.id);

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
      this.channelMetrics.delete(channelId);
      this.mediaIndex.delete(channelId);

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

    // Role management (basic grouping support)
    this.app.get('/roles', (_req, res) => {
      const roles = Array.from(this.roles.values());
      const users = Array.from(this.userRoles.entries()).map(([user, rolesSet]) => ({ user, roles: Array.from(rolesSet) }));
      res.json({ serverId: this.serverId, roles, users });
    });

    this.app.post('/roles', (req, res) => {
      const { name, permissions, color } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Role name is required' });
      }

      const role: Role = {
        id: uuidv4(),
        name: name.trim(),
        color: color || undefined,
        position: this.roles.size,
        permissions: {
          manageServer: false,
          manageChannels: false,
          manageRoles: false,
          kickMembers: false,
          banMembers: false,
          sendMessages: true,
          viewChannels: true,
          ...permissions
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.roles.set(role.id, role);
      res.json(role);
    });

    this.app.patch('/roles/:roleId', (req, res) => {
      const { roleId } = req.params;
      const role = this.roles.get(roleId);
      if (!role || roleId === 'everyone') {
        return res.status(404).json({ error: 'Role not found or immutable' });
      }

      const updated: Role = {
        ...role,
        name: req.body.name ?? role.name,
        color: req.body.color ?? role.color,
        permissions: { ...role.permissions, ...(req.body.permissions || {}) },
        updatedAt: new Date()
      };

      this.roles.set(roleId, updated);
      res.json(updated);
    });

    this.app.delete('/roles/:roleId', (req, res) => {
      const { roleId } = req.params;
      if (roleId === 'everyone') {
        return res.status(403).json({ error: 'Cannot delete @everyone role' });
      }
      const deleted = this.roles.delete(roleId);
      if (!deleted) {
        return res.status(404).json({ error: 'Role not found' });
      }

      // Remove role from all users
      for (const [user, rolesSet] of this.userRoles) {
        rolesSet.delete(roleId);
      }

      res.json({ success: true });
    });

    this.app.post('/roles/:roleId/assign', (req, res) => {
      const { roleId } = req.params;
      const { user } = req.body;
      if (!user || typeof user !== 'string') {
        return res.status(400).json({ error: 'User is required' });
      }
      if (!this.roles.has(roleId)) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const rolesForUser = this.userRoles.get(user) || new Set<string>();
      rolesForUser.add(roleId);
      this.userRoles.set(user, rolesForUser);

      res.json({ user, roles: Array.from(rolesForUser) });
    });

    this.app.post('/roles/:roleId/unassign', (req, res) => {
      const { roleId } = req.params;
      const { user } = req.body;
      if (!user || typeof user !== 'string') {
        return res.status(400).json({ error: 'User is required' });
      }
      if (!this.roles.has(roleId)) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const rolesForUser = this.userRoles.get(user) || new Set<string>();
      rolesForUser.delete(roleId);
      this.userRoles.set(user, rolesForUser);

      res.json({ user, roles: Array.from(rolesForUser) });
    });

    // Channel permission overrides for role-based access
    this.app.patch('/channels/:channelId/permissions', (req, res) => {
      const { channelId } = req.params;
      const channel = this.channels.get(channelId);
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const updated: Channel = {
        ...channel,
        permissions: {
          ...channel.permissions,
          read: req.body.read ?? channel.permissions?.read ?? true,
          write: req.body.write ?? channel.permissions?.write ?? true,
          manage: req.body.manage ?? channel.permissions?.manage ?? false,
          roles: Array.isArray(req.body.roles) ? req.body.roles : channel.permissions?.roles,
          readRoles: Array.isArray(req.body.readRoles) ? req.body.readRoles : channel.permissions?.readRoles,
          writeRoles: Array.isArray(req.body.writeRoles) ? req.body.writeRoles : channel.permissions?.writeRoles
        },
        updatedAt: new Date()
      };

      this.channels.set(channelId, updated);
      res.json(updated);
    });

    // Media cache per-channel (image/video indexing)
    this.app.post('/channels/:channelId/media', mediaUpload.single('file'), (req, res) => {
      const { channelId } = req.params;
      const channel = this.channels.get(channelId);
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No media file provided' });
      }

      const originalExt = path.extname(req.file.originalname);
      const storedName = `${uuidv4()}${originalExt || ''}`;
      const targetPath = path.join(__dirname, '../media', storedName);
      fs.renameSync(req.file.path, targetPath);

      const type = req.file.mimetype.startsWith('image/')
        ? 'image'
        : req.file.mimetype.startsWith('video/')
          ? 'video'
          : 'other';

      const entry: MediaEntry = {
        id: uuidv4(),
        channelId,
        user: req.body.user || 'unknown',
        originalName: req.file.originalname,
        storedName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        type,
        url: `/media/${storedName}`,
        uploadedAt: new Date()
      };

      const mediaList = this.mediaIndex.get(channelId) || [];
      mediaList.push(entry);
      this.mediaIndex.set(channelId, mediaList);

      this.bumpMediaMetric(channelId);

      res.json(entry);
    });

    this.app.get('/channels/:channelId/media', (req, res) => {
      const { channelId } = req.params;
      const channel = this.channels.get(channelId);
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const filterType = (req.query.type as string) || 'all';
      const mediaList = this.mediaIndex.get(channelId) || [];
      const filtered = filterType === 'all' ? mediaList : mediaList.filter(m => m.type === filterType);

      res.json({ channelId, count: filtered.length, items: filtered });
    });

    // Moderation endpoints
    this.app.post('/moderate', (req, res) => {
      // Moderation actions
    });
  }

  /** Determine the next channel position within a section. */
  private getNextChannelPosition(sectionId?: string): number {
    const channelsInSection = Array.from(this.channels.values())
      .filter(channel => channel.sectionId === sectionId)
      .map(channel => channel.position);

    return channelsInSection.length > 0 ? Math.max(...channelsInSection) + 1 : 0;
  }

  /** Determine the next position when creating a new section. */
  private getNextSectionPosition(): number {
    const sectionPositions = Array.from(this.sections.values()).map(section => section.position);
    return sectionPositions.length > 0 ? Math.max(...sectionPositions) + 1 : 0;
  }

  /** Configure Socket.IO authentication and event handlers. */
  private setupSocket() {
    // Authentication middleware
    this.io.use((socket, next) => {
      if (this.serverPasswordHash) {
        const provided = socket.handshake.auth?.serverPassword;
        if (!provided || this.hashPassword(provided) !== this.serverPasswordHash) {
          return next(new Error('Authentication error: Invalid or missing server password'));
        }
      }

      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }
      try {
        const decoded = jwt.verify(token, 'kiama-test-secret-key-change-in-production') as any;
        (socket as any).user = decoded;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      this.activeConnections += 1;
      console.log('User connected:', (socket as any).user.username);

      const username = (socket as any).user?.username || 'Anonymous';

      socket.on('join_channel', (data: { channelId: string }) => {
        const channel = this.channels.get(data.channelId);
        if (channel) {
          if (!this.canUserAccessChannel(channel, username, 'read')) {
            socket.emit('error', { message: 'No permission to view this channel' });
            return;
          }

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

        // Check write permissions with roles
        if (!this.canUserAccessChannel(channel, username, 'write')) {
          socket.emit('error', { message: 'No write permission for this channel' });
          return;
        }

        const message: TypedMessage = {
          id: uuidv4(),
          user: (socket as any).user?.username || 'Anonymous',
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

        this.recordChannelActivity(channelId, username, message.type === 'media');

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
        this.activeConnections = Math.max(0, this.activeConnections - 1);
      });
    });
  }

  /** Swap :emote: tokens with actual emote image tags. */
  private parseEmotes(content: string): string {
    let parsed = content;
    for (const [name, emoteData] of this.emotes) {
      const regex = new RegExp(`:${name}:`, 'g');
      parsed = parsed.replace(regex, `<img src="/emotes/${emoteData.filename}" alt="${name}" class="emote">`);
    }
    return parsed;
  }

  /** Start listening for HTTP and Socket.IO traffic. */
  public start() {
    this.server.listen(this.port, () => {
      console.log(`KIAMA server running on port ${this.port} in ${this.mode} mode`);
    });
  }

  /** Add a username to the allowlist. */
  public addToWhitelist(user: string) {
    this.whitelist.add(user);
  }

  /** Add a username to the blocklist. */
  public addToBlacklist(user: string) {
    this.blacklist.add(user);
  }

  /** Hash a password for comparison without storing plaintext. */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /** Ensure metrics object exists for a channel. */
  private ensureChannelMetrics(channelId: string) {
    if (!this.channelMetrics.has(channelId)) {
      this.channelMetrics.set(channelId, {
        messageCount: 0,
        mediaCount: 0,
        lastActiveAt: null,
        uniqueSenders: new Set<string>()
      });
    }
    if (!this.mediaIndex.has(channelId)) {
      this.mediaIndex.set(channelId, []);
    }
  }

  /** Update metrics when a channel receives activity. */
  private recordChannelActivity(channelId: string, username: string, isMedia: boolean) {
    this.ensureChannelMetrics(channelId);
    const metrics = this.channelMetrics.get(channelId)!;
    metrics.messageCount += 1;
    if (isMedia) {
      metrics.mediaCount += 1;
    }
    metrics.lastActiveAt = new Date();
    metrics.uniqueSenders.add(username);
  }

  /** Bump media counters when files are uploaded directly. */
  private bumpMediaMetric(channelId: string) {
    this.ensureChannelMetrics(channelId);
    const metrics = this.channelMetrics.get(channelId)!;
    metrics.mediaCount += 1;
    metrics.lastActiveAt = new Date();
  }

  /** Resolve a user's roles including @everyone. */
  private getUserRoles(username: string): Set<string> {
    const roles = new Set<string>(['everyone']);
    const userRoles = this.userRoles.get(username);
    if (userRoles) {
      for (const role of userRoles) {
        roles.add(role);
      }
    }
    return roles;
  }

  /** Check channel access based on role assignments. */
  private canUserAccessChannel(channel: Channel, username: string, action: 'read' | 'write'): boolean {
    const perms = channel.permissions || { read: true, write: true, manage: false };
    const userRoles = this.getUserRoles(username);

    // Legacy role gating for both read/write
    if (perms.roles && perms.roles.length > 0) {
      const hasRole = perms.roles.some(roleId => userRoles.has(roleId));
      if (!hasRole) {
        return false;
      }
    }

    // Fine-grained per-action role gating
    if (action === 'read' && perms.readRoles && perms.readRoles.length > 0) {
      const hasReadRole = perms.readRoles.some(roleId => userRoles.has(roleId));
      if (!hasReadRole) {
        return false;
      }
    }

    if (action === 'write' && perms.writeRoles && perms.writeRoles.length > 0) {
      const hasWriteRole = perms.writeRoles.some(roleId => userRoles.has(roleId));
      if (!hasWriteRole) {
        return false;
      }
    }

    if (action === 'read') {
      return perms.read !== false;
    }

    // Write path
    if (perms.write === false) {
      return false;
    }

    // Respect role permission to send messages
    for (const roleId of userRoles) {
      const role = this.roles.get(roleId);
      if (role?.permissions.sendMessages) {
        return true;
      }
    }

    return false;
  }
}