import React, { useState, useEffect, useRef } from 'react';
import * as os from 'os';
import * as path from 'path';
import io from 'socket.io-client';
import CryptoJS from 'crypto-js';
import PluginManager from './utils/PluginManager';
import { sharedAccountManager as appAccountManager } from './utils/sharedAccountManager';
import { TypedMessage, Channel, ChannelSection } from './types/plugin';
import { ModalProvider, useModal } from './components/Modal';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { SurfaceProvider } from './utils/SurfaceContext';
import AddServerPanel from './panels/AddServerPanel';
import LoadingScreen from './components/LoadingScreen';
import Login from './components/Login';
import TitleBar from './components/TitleBar';
import HomePage from './pages/HomePage';
import ServerPage from './pages/ServerPage';
import SettingsPage from './pages/SettingsPage';
import ServerSettingsPage from './pages/ServerSettingsPage';
import ChannelSettingsPage from './pages/ChannelSettingsPage';
import SectionSettingsPage from './pages/SectionSettingsPage';
import Select from './components/Select';
import Button from './components/Button';
import TextField from './components/TextField';
import ModalPanel from './components/ModalPanel';
import ContextMenu, { ContextMenuItemDef } from './components/ContextMenu';
import './styles/App.scss';
import './styles/components/ChannelSettings.scss';
import UserProfilePopover from './components/UserProfilePopover';
import { getPortalContainer } from './utils/portalRoot';

// ---------------------------------------------------------------------------
// Global error boundary — catches React render errors and shows the message

// instead of a blank white screen, making it much easier to debug.
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; componentStack: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Kiama ErrorBoundary]', error, info);
    // Record the component stack for the UI and also snapshot some DOM containers
    const componentStack = info.componentStack || '';
    try {
      const bodyCount = document.body ? document.body.childElementCount : -1;
      const ctx = document.getElementById('kiama-context-menu-root');
      const pop = document.getElementById('kiama-popover-root');
      const prof = document.getElementById('kiama-profile-popover-root');
      console.error('[Kiama ErrorBoundary] DOM snapshot:', {
        bodyCount,
        contextChildren: ctx ? ctx.childElementCount : null,
        popoverChildren: pop ? pop.childElementCount : null,
        profileChildren: prof ? prof.childElementCount : null,
      });
    } catch (e) {
      console.error('[Kiama ErrorBoundary] Failed to snapshot DOM:', e);
    }
    this.setState({ componentStack: componentStack, error });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#e53935', background: '#1e1e1e', minHeight: '100vh', overflow: 'auto' }}>
          <h2 style={{ marginBottom: 16 }}>⚠ Render error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13 }}>
            {this.state.error?.stack || String(this.state.error)}
          </pre>
          {this.state.componentStack && (
            <>
              <h3 style={{ marginTop: 20, marginBottom: 8, color: '#ff9800' }}>Component stack</h3>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, color: '#ff9800' }}>
                {this.state.componentStack}
              </pre>
            </>
          )}
          <button
            style={{ marginTop: 24, padding: '8px 16px', cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, error: null, componentStack: '' })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }

}

const SERVER_URL = 'http://localhost:3000';

const SERVER_ID = 'default-server'; // In production, get from server handshake

interface Message extends TypedMessage {}

interface Server {
  id: string;
  name: string;
  icon?: string;
  url: string;
}

interface Role {
  id: string;
  name: string;
  color?: string;
  permissions?: RolePermissions;
}

interface RolePermissions {
  manageServer: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  sendMessages: boolean;
  viewChannels: boolean;
}

interface User {
  id: string;
  name: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  avatar?: string;
  role?: string; // e.g., owner, mod, or custom group name
  accessibleChannels?: string[];
}

interface MemberEntry {
  username: string;
  role?: string;
  status: 'online' | 'offline';
}

type ActiveView = 'home' | 'server' | 'settings' | 'server-settings' | 'channel-settings' | 'section-settings';

// Main renderer shell that wires sockets, plugins, and page layout together.
function AppContent({ token, user, onLogout }: { token: string; user: any; onLogout: () => void }) {
  const { openModal, closeModal } = useModal();
  const {
    currentMode,
    setMode,
    availableThemes,
    currentThemeId,
    setThemeById,
    availableFonts,
    currentFontId,
    setFontById,
  } = useTheme();
  const socketRef = React.useRef<any>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Map<string, Message[]>>(() => new Map([
    ['test-general', [
      { id: 't1', user: 'Test Bot', content: 'Welcome to the Test Server!', type: 'text', timestamp: new Date(), serverId: 'test-server', channelId: 'test-general' },
      { id: 't2', user: user?.name || 'You', content: 'This is where channel and user sidebars live.', type: 'text', timestamp: new Date(), serverId: 'test-server', channelId: 'test-general' }
    ]],
    ['test-random', [
      { id: 't3', user: 'Alice', content: 'Drop anything fun here.', type: 'text', timestamp: new Date(), serverId: 'test-server', channelId: 'test-random' }
    ]]
  ]));
  const [currentChannelId, setCurrentChannelId] = useState<string>('test-general');
  const [channels, setChannels] = useState<Channel[]>([
    { id: 'test-general', name: 'general', type: 'text', position: 0, serverId: 'test-server', sectionId: 'test-text-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'test-random', name: 'random', type: 'text', position: 1, serverId: 'test-server', sectionId: 'test-text-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'test-announcements', name: 'announcements', type: 'announcement', position: 2, serverId: 'test-server', sectionId: 'test-text-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'test-general-voice', name: 'General', type: 'voice', position: 0, serverId: 'test-server', sectionId: 'test-voice-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'test-music', name: 'Music', type: 'voice', position: 1, serverId: 'test-server', sectionId: 'test-voice-channels', createdAt: new Date(), updatedAt: new Date() }
  ]);
  const [sections, setSections] = useState<ChannelSection[]>([
    { id: 'test-text-channels', name: 'TEXT CHANNELS', serverId: 'test-server', position: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: 'test-voice-channels', name: 'VOICE CHANNELS', serverId: 'test-server', position: 1, createdAt: new Date(), updatedAt: new Date() }
  ]);
  const [currentServer, setCurrentServer] = useState<string>(SERVER_ID);
  const [servers, setServers] = useState<Server[]>([
    { id: 'home', name: 'Home', url: SERVER_URL },
    { id: 'test-server', name: 'Test Server', url: SERVER_URL }
  ]);
  const [currentServerId, setCurrentServerId] = useState<string>('home');
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      name: 'You',
      status: 'online',
      role: 'owner',
      accessibleChannels: ['test-general', 'test-random', 'test-announcements', 'test-general-voice', 'test-music']
    },
    {
      id: '2',
      name: 'Alice',
      status: 'online',
      role: 'mod',
      accessibleChannels: ['test-general', 'test-random']
    },
    {
      id: '3',
      name: 'Bob',
      status: 'idle',
      role: 'Support',
      accessibleChannels: ['test-general']
    },
    {
      id: '4',
      name: 'Charlie',
      status: 'dnd',
      role: 'mod',
      accessibleChannels: ['test-general', 'test-general-voice', 'test-music']
    },
    {
      id: '5',
      name: 'Diana',
      status: 'offline',
      role: 'Members',
      accessibleChannels: ['test-general']
    }
  ]);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [userListWidth, setUserListWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userListCollapsed, setUserListCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingUserList, setIsResizingUserList] = useState(false);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [soft3DEnabled, setSoft3DEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('soft3d-enabled');
    if (stored === null) return true;
    return stored === 'true';
  });
  const [settingsThemeMode, setSettingsThemeMode] = useState<'light' | 'dark'>(currentMode);
  const [settingsSelectedTheme, setSettingsSelectedTheme] = useState<string>(currentThemeId);
  const [settingsFontId, setSettingsFontId] = useState<string>(currentFontId);
  // Pre-initialize portal containers at mount time so they exist before any portal renders.
  useEffect(() => {
    ['kiama-context-menu-root', 'kiama-popover-root', 'kiama-profile-popover-root'].forEach(id => {
      const el = getPortalContainer(id);
      console.debug('[Kiama] Ensured portal container', id, 'childCount=', el.childElementCount);
    });
  }, []);

  // Profile picture for the currently logged-in local account.
  const [userAvatar, setUserAvatar] = useState<string | undefined>(() => {
    if (user?.profilePic) return `file://${appAccountManager.getMediaFilePath(user.profilePic)}`;
    return undefined;
  });
  useEffect(() => {
    if (user?.profilePic) {
      setUserAvatar(`file://${appAccountManager.getMediaFilePath(user.profilePic)}`);
    } else {
      setUserAvatar(undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profilePic]);

  // Hydrate server list from the saved account data on login.
  useEffect(() => {
    if (!user?.serverList?.servers?.length) return;
    setServers(prev => {
      const incoming: Server[] = user.serverList.servers.map((s: any) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        icon: s.icon ? `file://${appAccountManager.getMediaFilePath(s.icon)}` : undefined
      }));
      // Merge: always keep 'home', use account entries for non-home servers
      const homeEntry = prev.find(s => s.id === 'home') || { id: 'home', name: 'Home', url: SERVER_URL };
      return [homeEntry, ...incoming];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1920);
  const [showMobileServerList, setShowMobileServerList] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileUserList, setShowMobileUserList] = useState(false);
  const [activeAddMenu, setActiveAddMenu] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'section' | 'channel';
    id: string;
    x: number;
    y: number;
  } | null>(null);
  // ── Drag-and-drop state ─────────────────────────────────────────────────────
  const dndDragRef = useRef<{ type: 'section' | 'channel'; id: string } | null>(null);
  const [dndDraggingId, setDndDraggingId] = useState<string | null>(null);
  const [dndOverSectionId, setDndOverSectionId] = useState<string | null>(null);
  const [dndOverChannelId, setDndOverChannelId] = useState<string | null>(null);
  const [userSidebarTab, setUserSidebarTab] = useState<'members' | 'metrics'>('members');
  const [serverRoles, setServerRoles] = useState<Role[]>([
    { id: 'role-owner', name: 'owner', color: '#f59e0b', permissions: { manageServer: true, manageChannels: true, manageRoles: true, kickMembers: true, banMembers: true, sendMessages: true, viewChannels: true } },
    { id: 'role-mod', name: 'mod', color: '#10b981', permissions: { manageServer: false, manageChannels: true, manageRoles: false, kickMembers: true, banMembers: false, sendMessages: true, viewChannels: true } },
    { id: 'role-support', name: 'Support', color: '#3b82f6', permissions: { manageServer: false, manageChannels: false, manageRoles: false, kickMembers: false, banMembers: false, sendMessages: true, viewChannels: true } },
    { id: 'role-members', name: 'Members', color: '#9ca3af', permissions: { manageServer: false, manageChannels: false, manageRoles: false, kickMembers: false, banMembers: false, sendMessages: true, viewChannels: true } },
  ]);
  const [serverSettingsChannelId, setServerSettingsChannelId] = useState<string>('');
  const [channelSettingsChannelId, setChannelSettingsChannelId] = useState<string | null>(null);
  const [sectionSettingsSectionId, setSectionSettingsSectionId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [reactToMessageId, setReactToMessageId] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [localReactions, setLocalReactions] = useState<Map<string, { emoji: string; users: string[] }[]>>(new Map());
  const [serverSettingsServerId, setServerSettingsServerId] = useState<string | null>(null);
  const [serverSettingsLoading, setServerSettingsLoading] = useState(false);
  const [serverPasswordRequired, setServerPasswordRequired] = useState<boolean | null>(null);
  // Per-server info (owner username + icon URL) fetched via GET /info.
  const [serverInfoCache, setServerInfoCache] = useState<Map<string, { ownerUsername: string | null; iconUrl: string | null }>>(new Map());
  // Per-server member list (username → role + online status) fetched via GET /members.
  const [serverMembers, setServerMembers] = useState<Map<string, MemberEntry[]>>(new Map());
  // Controls the Discord-style user profile popover.
  const [profilePopover, setProfilePopover] = useState<{ member: MemberEntry; rect: DOMRect } | null>(null);
  const [e2eeEnabled, setE2eeEnabled] = useState(false);

  // Tracks which client-side serverId to tag the next channels_list response with.
  const pendingChannelServerIdRef = useRef<string>(currentServerId);
  // Always holds the latest currentServerId so socket handlers avoid stale closures.
  const currentServerIdRef = useRef<string>(currentServerId);
  useEffect(() => { currentServerIdRef.current = currentServerId; }, [currentServerId]);

  // Sync settings with current values
  React.useEffect(() => {
    setSettingsThemeMode(currentMode);
    setSettingsSelectedTheme(currentThemeId);
    setSettingsFontId(currentFontId);
  }, [currentMode, currentThemeId, currentFontId]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('soft3d-enabled', soft3DEnabled ? 'true' : 'false');
  }, [soft3DEnabled]);

  useEffect(() => {
    if (viewportWidth > 768) {
      setShowMobileServerList(false);
      setShowMobileSidebar(false);
      setShowMobileUserList(false);
    }
  }, [viewportWidth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.section-menu') && !target.closest('.section-plus-btn')) {
        setActiveAddMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveAddMenu(null);
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setShowServerMenu(false);
  }, [currentServerId]);

  const toggleServerMenu = () => setShowServerMenu(prev => !prev);
  const closeServerMenu = () => setShowServerMenu(false);

  // Generate compact server initials for the sidebar badges.
  const generateServerInitials = (serverName: string): string => {
    if (!serverName || serverName.trim() === '') {
      return '?'; // Fallback for empty names
    }

    const words = serverName.trim().split(/\s+/);
    const initials = words
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2) // Limit to 2 characters max
      .join('');

    return initials;
  };

  // Minimal HTML escape to avoid unsafe rendering.
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Prefer plugin-rendered markup, otherwise sanitize raw content.
  const toSafeHtml = (msg: Message) =>
    msg.renderedContent ? msg.renderedContent : escapeHtml(msg.content).replace(/\n/g, '<br>');

  // Initialize a single PluginManager instance bound to this renderer.
  const [pluginManager] = useState(() => new PluginManager({
    addMessageHandler: (handler) => {
      // Store handlers
    },
    addUIComponent: (component) => {
      // Add to UI
    },
    getSocket: () => socketRef.current,
    registerMessageType: (type: string, component: React.ComponentType) => {
      pluginManager.registerMessageTypeComponent(type, component);
    },
    addMessageInputButton: (button) => {
      pluginManager.addMessageInputButton(button);
    }
  }));

  useEffect(() => {
    // Initialize socket with auth
    socketRef.current = io('http://localhost:3000', {
      auth: {
        token: token
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token]);

  useEffect(() => {
    pluginManager.loadPlugins();

    // Discover and install server plugins
    pluginManager.discoverServerPlugins(SERVER_URL, currentServer);

    // Join default channel
    if (socketRef.current) {
      socketRef.current.emit('join_channel', { channelId: 'general' });
    }
  }, [pluginManager, currentServer, token]);

  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      loadChannelsAndSections();
      // Announce who we are so the server can track presence
      if (user?.username) {
        socketRef.current.emit('identify', { username: user.username });
      }
    });

    socketRef.current.on('message', (msg: Message) => {
      let processedMessage = { ...msg };
      if (e2eeEnabled) {
        processedMessage.content = CryptoJS.AES.decrypt(msg.content, 'secret-key').toString(CryptoJS.enc.Utf8);
      }
      processedMessage = pluginManager.processMessage(processedMessage);

      // Add message or replace optimistic duplicate (same id means sender already added it locally)
      setMessages(prev => {
        const newMessages = new Map(prev);
        const channelMessages = newMessages.get(processedMessage.channelId) || [];
        const existingIdx = channelMessages.findIndex(m => m.id === processedMessage.id);
        if (existingIdx >= 0) {
          // Replace the optimistic copy with the server-confirmed version
          const updated = [...channelMessages];
          updated[existingIdx] = processedMessage;
          newMessages.set(processedMessage.channelId, updated);
        } else {
          newMessages.set(processedMessage.channelId, [...channelMessages, processedMessage]);
        }
        return newMessages;
      });
    });

    socketRef.current.on('channel_history', (data: { channelId: string, messages: Message[] }) => {
      const processedMessages = data.messages.map(msg => {
        let processed = { ...msg };
        if (e2eeEnabled) {
          processed.content = CryptoJS.AES.decrypt(msg.content, 'secret-key').toString(CryptoJS.enc.Utf8);
        }
        return pluginManager.processMessage(processed);
      });

      setMessages(prev => {
        const newMessages = new Map(prev);
        newMessages.set(data.channelId, processedMessages);
        return newMessages;
      });
    });

    socketRef.current.on('channels_list', (data: { channels: Channel[], sections: ChannelSection[], serverId: string }) => {
      const targetServerId = pendingChannelServerIdRef.current;

      // Determine the first channel to auto-select for the incoming server
      const sortedIncoming = [...data.channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const firstChannelId = sortedIncoming[0]?.id || '';

      setChannels(prev => {
        // Keep channels that belong to other servers, replace only those for this server
        const others = prev.filter(c => c.serverId !== targetServerId);
        const incoming = data.channels.map(c => ({ ...c, serverId: targetServerId }));
        return [...others, ...incoming];
      });
      setSections(prev => {
        const others = prev.filter(s => s.serverId !== targetServerId);
        const incoming = data.sections.map(s => ({ ...s, serverId: targetServerId }));
        return [...others, ...incoming];
      });

      // Auto-select the first channel when loading a server's channels
      if (firstChannelId) {
        setCurrentChannelId(firstChannelId);
        if (socketRef.current) {
          socketRef.current.emit('join_channel', { channelId: firstChannelId });
        }
      }
    });

    socketRef.current.on('channel_created', (channel: Channel) => {
      // Guard against duplicates (e.g. reconnect races)
      setChannels(prev =>
        prev.some(c => c.id === channel.id)
          ? prev
          : [...prev, { ...channel, serverId: pendingChannelServerIdRef.current }]
      );
    });

    socketRef.current.on('channel_updated', (channel: Channel) => {
      setChannels(prev => prev.map(c => c.id === channel.id ? { ...channel, serverId: c.serverId } : c));
    });

    socketRef.current.on('channel_deleted', (data: { channelId: string }) => {
      setChannels(prev => prev.filter(c => c.id !== data.channelId));
      setMessages(prev => {
        const newMessages = new Map(prev);
        newMessages.delete(data.channelId);
        return newMessages;
      });
    });

    socketRef.current.on('section_created', (section: ChannelSection) => {
      setSections(prev => [...prev, { ...section, serverId: pendingChannelServerIdRef.current }]);
    });

    socketRef.current.on('section_updated', (section: ChannelSection) => {
      setSections(prev => prev.map(s => s.id === section.id ? { ...section, serverId: s.serverId } : s));
    });

    socketRef.current.on('section_deleted', (data: { sectionId: string }) => {
      setSections(prev => prev.filter(s => s.id !== data.sectionId));
      // Clear sectionId from any channels that were in this section so they
      // don't get orphaned invisibly in client state.
      setChannels(prev => prev.map(c =>
        c.sectionId === data.sectionId ? { ...c, sectionId: undefined } : c
      ));
    });

    // Member presence / role events
    socketRef.current.on('member_role_updated', (data: { username: string; role: string | null }) => {
      const sid = currentServerIdRef.current;
      setServerMembers(prev => {
        const next = new Map(prev);
        const list = (next.get(sid) || []).map(m =>
          m.username === data.username ? { ...m, role: data.role ?? undefined } : m
        );
        next.set(sid, list);
        return next;
      });
    });

    socketRef.current.on('user_online', (data: { username: string }) => {
      const sid = currentServerIdRef.current;
      setServerMembers(prev => {
        const next = new Map(prev);
        const list = next.get(sid) || [];
        const exists = list.some(m => m.username === data.username);
        const updated = exists
          ? list.map(m => m.username === data.username ? { ...m, status: 'online' as const } : m)
          : [...list, { username: data.username, status: 'online' as const }];
        next.set(sid, updated);
        return next;
      });
    });

    socketRef.current.on('user_offline', (data: { username: string }) => {
      const sid = currentServerIdRef.current;
      setServerMembers(prev => {
        const next = new Map(prev);
        const list = (next.get(sid) || []).map(m =>
          m.username === data.username ? { ...m, status: 'offline' as const } : m
        );
        next.set(sid, list);
        return next;
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('message');
        socketRef.current.off('channel_history');
        socketRef.current.off('channels_list');
        socketRef.current.off('channel_created');
        socketRef.current.off('channel_updated');
        socketRef.current.off('channel_deleted');
        socketRef.current.off('section_created');
        socketRef.current.off('section_updated');
        socketRef.current.off('section_deleted');
        socketRef.current.off('member_role_updated');
        socketRef.current.off('user_online');
        socketRef.current.off('user_offline');
      }
    };
  }, [pluginManager, token]);

  // Ask the server for the latest channel + section list for the active server.
  const loadChannelsAndSections = (forServerId?: string) => {
    if (socketRef.current) {
      pendingChannelServerIdRef.current = forServerId !== undefined ? forServerId : currentServerId;
      socketRef.current.emit('get_channels');
    }
  };

  // Move the active socket subscription to a new channel room.
  const joinChannel = (channelId: string) => {
    if (socketRef.current) {
      // Leave current channel
      socketRef.current.emit('leave_channel', { channelId: currentChannelId });

      // Join new channel
      socketRef.current.emit('join_channel', { channelId });
    }
    setCurrentChannelId(channelId);

    if (viewportWidth <= 768) {
      setShowMobileSidebar(false);
    }
  };

  // Open the server settings view and preload roles + the first channel.
  const openServerSettings = async () => {
    const server = servers.find(s => s.id === currentServerId && s.id !== 'home');
    if (!server) return;

    const serverChannels = channels.filter(c => c.serverId === server.id);
    setServerSettingsChannelId(serverChannels[0]?.id || '');
    setServerSettingsServerId(server.id);
    setActiveView('server-settings');
    setServerSettingsLoading(true);

    try {
      const res = await fetch(`${server.url}/roles`);
      if (res.ok) {
        const data = await res.json();
        // Merge fetched roles with existing ones: server roles take precedence for
        // shared names, but local roles whose names aren't on the server are preserved
        // so that previously-resolved role colors in chat don't disappear.
        setServerRoles(prev => {
          const incoming: Role[] = data.roles || [];
          const incomingNames = new Set(incoming.map(r => r.name));
          const preserved = prev.filter(r => !incomingNames.has(r.name));
          return [...incoming, ...preserved];
        });
      }
      // On non-OK or error, leave serverRoles untouched to avoid breaking existing colors.
    } catch (error) {
      console.error('Failed to load roles', error);
    }

    try {
      const res = await fetch(`${server.url}/server/password/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: '' })
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.required === 'boolean') {
          setServerPasswordRequired(data.required);
        }
      } else {
        setServerPasswordRequired(null);
      }
    } catch (error) {
      console.warn('Could not determine password requirement', error);
      setServerPasswordRequired(null);
    }

    setServerSettingsLoading(false);
  };

  // Fetch the server's /info endpoint to get ownerUsername and iconUrl.
  // Called every time we switch to a real server (not 'home').
  const fetchServerInfo = async (server: Server) => {
    if (!server.url || server.id === 'home') return;
    try {
      const res = await fetch(`${server.url}/info`);
      if (!res.ok) return;
      const info = await res.json();
      setServerInfoCache(prev => {
        const next = new Map(prev);
        next.set(server.url, {
          ownerUsername: info.ownerUsername ?? null,
          iconUrl: info.iconUrl ?? null,
        });
        return next;
      });
      // If the server advertises an icon, use the server-hosted URL directly so
      // all clients (not just the uploader) see the same icon.
      if (info.iconUrl) {
        const serverIconUrl = `${server.url}/server/icon?t=${Date.now()}`;
        setServers(prev => prev.map(s => s.id === server.id ? { ...s, icon: serverIconUrl } : s));
      }
    } catch (e) {
      // Server may not have the /info endpoint yet — silently ignore.
    }
  };

  // Claim (or transfer) ownership of the current real server.
  const claimOwner = async (
    ownerUsername: string,
    adminToken?: string,
  ): Promise<{ success: boolean; requiresToken?: boolean; error?: string }> => {
    const targetServerId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === targetServerId);
    if (!server || server.id === 'home' || !server.url) {
      return { success: false, error: 'Ownership can only be set on real servers.' };
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminToken) headers['X-Admin-Token'] = adminToken;
      const res = await fetch(`${server.url}/server/claim-owner`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: ownerUsername, token: adminToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, requiresToken: data.requiresToken === true, error: data.error };
      }
      // Update the cache so the UI reflects the new owner immediately.
      setServerInfoCache(prev => {
        const next = new Map(prev);
        const existing = prev.get(server.url) || { iconUrl: null };
        next.set(server.url, { ...existing, ownerUsername: data.ownerUsername });
        return next;
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  };

  // Fetch the member list from the current real server's /members endpoint.
  const fetchServerMembers = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || server.id === 'home' || !server.url) return;
    try {
      const res = await fetch(`${server.url}/members`);
      if (!res.ok) return;
      const body = await res.json();
      // Server returns { members: [...] }
      const data: MemberEntry[] = Array.isArray(body) ? body : (body.members ?? []);
      setServerMembers(prev => {
        const next = new Map(prev);
        next.set(serverId, data);
        return next;
      });
    } catch (e) {
      // Server may not support /members yet — silently ignore.
    }
  };

  // Assign (or clear) a role for a member on the current real server.
  const assignMemberRole = async (username: string, roleName: string): Promise<void> => {
    const server = servers.find(s => s.id === currentServerId);
    if (!server || server.id === 'home' || !server.url) return;
    try {
      await fetch(`${server.url}/members/${encodeURIComponent(username)}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: roleName || null }),
      });
    } catch (e) {
      console.warn('Failed to assign role', e);
    }
  };

  const closeServerSettings = () => {
    setActiveView('server');
  };

  // Persist channel permission changes to the server and update local state.
  const saveChannelPermissions = async (channelId: string, readRoles: string[], writeRoles: string[]) => {
    const serverId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    try {
      const res = await fetch(`${server.url}/channels/${channelId}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readRoles, writeRoles })
      });

      if (!res.ok) {
        console.error('Failed to update channel permissions');
      }

      setChannels(prev => prev.map(channel => {
        if (channel.id !== channelId) return channel;
        const basePerms = channel.permissions || { read: true, write: true, manage: false };
        return {
          ...channel,
          permissions: {
            ...basePerms,
            readRoles,
            writeRoles
          }
        };
      }));
    } catch (error) {
      console.error('Error updating channel permissions', error);
    }
  };

  // Persist section permission changes (viewRoles / manageRoles) to the server.
  const saveSectionPermissions = async (sectionId: string, viewRoles: string[], manageRoles: string[]) => {
    const server = servers.find(s => s.id === currentServerId);
    if (!server) return;
    try {
      const res = await fetch(`${server.url}/sections/${sectionId}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewRoles, manageRoles })
      });
      if (!res.ok) throw new Error('Failed to update section permissions');
      setSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          permissions: {
            ...s.permissions,
            view: viewRoles.length === 0,
            manage: s.permissions?.manage ?? false,
            viewRoles,
            manageRoles,
          }
        };
      }));
    } catch (error) {
      console.error('Error saving section permissions:', error);
    }
  };

  // Create a new server role with server-wide permission flags and merge into local state.
  const createServerRole = async (input: { name: string; color?: string; permissions: RolePermissions }) => {
    const serverId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    try {
      const res = await fetch(`${server.url}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!res.ok) {
        console.error('Failed to create role');
        return;
      }

      const created = await res.json();
      setServerRoles(prev => [...prev, created]);
    } catch (error) {
      console.error('Failed to create role', error);
    }
  };

  // Update an existing server role and reflect changes locally.
  const updateServerRole = async (id: string, input: { name: string; color?: string; permissions: RolePermissions }) => {
    const serverId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    // Optimistic local update so the UI reflects immediately.
    setServerRoles(prev => prev.map(r => r.id === id ? { ...r, ...input } : r));

    try {
      await fetch(`${server.url}/roles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
    } catch (error) {
      console.error('Failed to update role', error);
    }
  };

  const leaveServer = (serverId: string) => {
    setServers(prev => {
      const updated = prev.filter(s => s.id !== serverId);
      // Persist to account
      if (user?.username) {
        const nonHome = updated.filter(s => s.id !== 'home');
        appAccountManager.updateServerList(user.username,
          nonHome.map(s => ({ id: s.id, name: s.name, url: s.url }))
        ).catch(() => {});
      }
      return updated;
    });

    if (serverId === currentServerId) {
      setCurrentServerId('home');
      setActiveView('home');
      setCurrentChannelId('');
      closeMobileDrawers();
    }
  };

  // Choose the first channel in a server to act as the default target.
  const getDefaultChannelIdForServer = (serverId: string) => {
    const serverChannels = channels
      .filter(c => c.serverId === serverId)
      .sort((a, b) => a.position - b.position);
    return serverChannels[0]?.id || '';
  };

  // Swap to a different server, showing a brief loading state while reconnecting.
  const switchServer = (serverId: string) => {
    console.debug('[Kiama] switchServer START', { serverId, currentServerId });
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    if (serverId === 'home') {
      setActiveView('home');
      setCurrentServerId('home');
      setCurrentServer(SERVER_ID);

      if (viewportWidth <= 768) {
        setShowMobileServerList(false);
        setShowMobileSidebar(false);
        setShowMobileUserList(false);
      }
      return;
    }

    if (serverId === currentServerId && activeView !== 'server') {
      setActiveView('server');
      if (viewportWidth <= 768) {
        setShowMobileServerList(false);
        setShowMobileSidebar(false);
        setShowMobileUserList(false);
      }
      return;
    }

    if (serverId === currentServerId && activeView === 'server') return;

  setActiveView('server');

    const nextChannelId = getDefaultChannelIdForServer(serverId);

    console.debug('[Kiama] switchServer about to set currentServerId ->', serverId);
    setCurrentServerId(serverId);
    setCurrentServer(server.id === 'home' ? SERVER_ID : server.id);
    setCurrentChannelId(nextChannelId || currentChannelId); // Reset to first channel for that server

    if (viewportWidth <= 768) {
      setShowMobileServerList(false);
      setShowMobileSidebar(false);
      setShowMobileUserList(false);
    }

    // Reload channels for the newly selected server
    loadChannelsAndSections(serverId);

    // Fetch owner / icon info from the real server
    fetchServerInfo(server);

    // Fetch member list (roles + presence) from the real server
    fetchServerMembers(serverId);

    // Announce this client's identity so presence tracking works immediately
    if (socketRef.current && user?.username) {
      socketRef.current.emit('identify', { username: user.username });
    }

  };

  // Quick-add a server — delegates UI to AddServerPanel.
  const addServer = () => {
    openModal(
      <AddServerPanel
        onAdd={(server) => {
          setServers(prev => {
            const updated = [...prev, server];
            if (user?.username) {
              const nonHome = updated.filter(s => s.id !== 'home');
              appAccountManager.updateServerList(user.username,
                nonHome.map(s => ({ id: s.id, name: s.name, url: s.url }))
              ).catch(() => {});
            }
            return updated;
          });
        }}
        onClose={closeModal}
      />,
      { size: 'small' }
    );
  };

  // Join a server via invite/URL prompts.
  const joinServer = () => {
    const invite = prompt('Enter invite link or server URL:');
    if (!invite) return;

    const serverName = prompt('Name this server:') || 'New Server';
    const newServer: Server = {
      id: `server-${Date.now()}`,
      name: serverName,
      url: invite
    };

    setServers(prev => {
      const updated = [...prev, newServer];
      if (user?.username) {
        const nonHome = updated.filter(s => s.id !== 'home');
        appAccountManager.updateServerList(user.username,
          nonHome.map(s => ({ id: s.id, name: s.name, url: s.url }))
        ).catch(() => {});
      }
      return updated;
    });
  };

  // Begin dragging the channel sidebar resize handle.
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    setIsResizingSidebar(true);
    e.preventDefault();
  };

  // Begin dragging the member list resize handle.
  const handleUserListResizeStart = (e: React.MouseEvent) => {
    setIsResizingUserList(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(200, Math.min(400, e.clientX - 72)); // Min 200px, max 400px
        setSidebarWidth(newWidth);
      } else if (isResizingUserList) {
        const newWidth = Math.max(200, Math.min(400, window.innerWidth - e.clientX));
        setUserListWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingUserList(false);
    };

    if (isResizingSidebar || isResizingUserList) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingUserList]);

  // Toggle collapsed state for the channel sidebar on desktop.
  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Toggle collapsed state for the member list on desktop.
  const toggleUserList = () => {
    setUserListCollapsed(!userListCollapsed);
  };

  // Send a message over the socket, defaulting to plain text.
  const sendMessage = (type: string = 'text', data?: any) => {
    if (!message.trim() && type === 'text' && !data) return;
    // For real servers, look up the authenticated user's role from the live member list.
    // Fall back to the mock 'users' array only for the home/test server.
    const senderRole = (() => {
      if (currentServerId !== 'home') {
        const memberList = serverMembers.get(currentServerId) || [];
        const myUsername = user?.username ?? user?.name;
        const member = memberList.find(m => m.username === myUsername);
        return member?.role;
      }
      return users.find(u => u.name === 'You')?.role;
    })();
    let content = message;
    if (e2eeEnabled) {
      content = CryptoJS.AES.encrypt(message, 'secret-key').toString();
    }
    const messageData: Partial<Message> = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      user: user?.name || 'You',
      userRole: senderRole,
      content,
      type,
      data,
      serverId: currentServer,
      channelId: currentChannelId,
      timestamp: new Date(),
      replyTo: replyingTo
        ? { id: replyingTo.id, user: replyingTo.user, content: replyingTo.content }
        : undefined,
    };

    // Add optimistically to local state so it shows immediately.
    setMessages(prev => {
      const newMessages = new Map(prev);
      const channelMessages = newMessages.get(currentChannelId) || [];
      newMessages.set(currentChannelId, [...channelMessages, messageData as Message]);
      return newMessages;
    });

    if (socketRef.current) {
      socketRef.current.emit('message', messageData);
    }
    setMessage('');
    setReplyingTo(null);
  };

  // Shortcut helper for sending a demo poll payload.
  const sendPollMessage = () => {
    const pollData = {
      question: message,
      options: ['Option 1', 'Option 2', 'Option 3']
    };
    sendMessage('poll', pollData);
    setShowMessageOptions(false);
  };

  // Open a file picker and stream attachments to the current channel.
  const handleFileUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append('media', file);
          try {
            const res = await fetch(`${SERVER_URL}/upload-media`, {
              method: 'POST',
              body: formData
            });
            if (res.ok) {
              const { filename, url } = await res.json();
              sendMessage('file', { name: file.name, size: file.size, type: file.type, mediaPath: filename });
            }
          } catch (error) {
            console.error('Upload failed', error);
          }
        }
      }
    };
    input.click();
    setShowMessageOptions(false);
  };

  // Upload a single image and send it as a message payload.
  const handleImageUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const formData = new FormData();
        formData.append('media', file);
        try {
          const res = await fetch(`${SERVER_URL}/upload-media`, {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            const { filename, url } = await res.json();
            sendMessage('image', { name: file.name, size: file.size, type: file.type, mediaPath: filename });
          }
        } catch (error) {
          console.error('Upload failed', error);
        }
      }
    };
    input.click();
    setShowMessageOptions(false);
  };

  // Toggle the emoji picker while hiding other trays.
  const openEmojiPicker = (anchor?: DOMRect) => {
    setPickerAnchor(anchor ? { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height } : null);
    setShowGifPicker(false);
    setShowMessageOptions(false);
    setShowEmotePicker(prev => !prev);
  };

  // Toggle the GIF picker while hiding other trays.
  const openGifPicker = () => {
    setShowEmotePicker(false);
    setShowMessageOptions(false);
    setShowGifPicker(prev => !prev);
  };

  // Hide emoji picker overlay.
  const closeEmotePicker = () => {
    setShowEmotePicker(false);
    setPickerAnchor(null);
  };

  // Hide GIF picker overlay.
  const closeGifPicker = () => {
    setShowGifPicker(false);
  };

  // Open/close the attachment options menu.
  const toggleMessageOptions = () => {
    setShowMessageOptions(prev => !prev);
    setShowEmotePicker(false);
    setShowGifPicker(false);
    setPickerAnchor(null);
  };

  // Insert a selected emoji or emote token into the composer text.
  const handleEmoteSelect = (emote: { name: string; unicode?: string }) => {
    const insert = emote.unicode || `:${emote.name}:`;
    setMessage(prev => prev + insert);
    setShowEmotePicker(false);
  };

  // Send the selected GIF as a message payload.
  const handleGifSelect = (gif: { url: string; title: string }) => {
    sendMessage('gif', { url: gif.url, title: gif.title });
    setShowGifPicker(false);
  };

  // Show account/theme settings modal with persisted values prefilled.
  const openAccountSettings = () => {
    setSettingsThemeMode(currentMode); // Reset to current
    setSettingsSelectedTheme(currentThemeId); // Reset to current
    setSettingsFontId(currentFontId); // Reset to current
    setActiveView('settings');
    setShowMobileServerList(false);
    setShowMobileSidebar(false);
    setShowMobileUserList(false);
  };

  const saveSettingsView = () => {
    setMode(settingsThemeMode);
    setThemeById(settingsSelectedTheme);
    setFontById(settingsFontId);
  };

  const handleChangePassword = async (
    currentPw: string,
    newPw: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.name) return { success: false, error: 'No active account.' };
    try {
      await appAccountManager.rotateKey(user.name, currentPw, newPw);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to change password.' };
    }
  };

  const handleUpdateProfilePic = async (
    dataUri: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.name) return { success: false, error: 'No active account.' };
    try {
      const filePath = await appAccountManager.saveProfilePic(user.name, dataUri);
      setUserAvatar(`file://${filePath}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to update profile picture.' };
    }
  };

  const handleUpdateServerIcon = async (
    serverId: string,
    dataUri: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const filePath = await appAccountManager.saveServerIcon(serverId, dataUri);
      const iconUrl = `file://${filePath}`;
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, icon: iconUrl } : s));

      // Also upload to the server so all clients share the same icon.
      const srvr = servers.find(s => s.id === serverId);
      if (srvr && srvr.url && srvr.id !== 'home') {
        try {
          const uploadRes = await fetch(`${srvr.url}/server/icon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUri }),
          });
          if (uploadRes.ok) {
            // Update the server icon to use the server-hosted URL so it is visible to all clients.
            const serverIconUrl = `${srvr.url}/server/icon?t=${Date.now()}`;
            setServers(prev => prev.map(s => s.id === serverId ? { ...s, icon: serverIconUrl } : s));
            // Refresh server info cache iconUrl
            setServerInfoCache(prev => {
              const next = new Map(prev);
              const existing = prev.get(srvr.url) || { ownerUsername: null };
              next.set(srvr.url, { ...existing, iconUrl: serverIconUrl });
              return next;
            });
          }
        } catch (_e) {
          // Server upload failed — local icon is still saved; silently ignore.
        }
      }

      // Persist icon reference and server info to the account's server list
      if (user?.username) {
        const iconFilename = filePath.split('/').pop() || '';
        await appAccountManager.updateServerList(user.username, [{
          id: serverId,
          name: srvr?.name || serverId,
          url: srvr?.url || '',
          icon: iconFilename
        }]);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to save server icon.' };
    }
  };

  // Render a ModalPanel-based prompt to create a channel in an optional section.
  const openCreateChannelModal = (sectionId?: string) => {
    const CreateChannelModal = () => {
      const [name, setName] = React.useState('');
      const [type, setType] = React.useState<'text' | 'voice' | 'announcement'>('text');
      const [busy, setBusy] = React.useState(false);

      const submit = async () => {
        if (!name.trim()) return;
        setBusy(true);
        await createChannel(name.trim(), type, sectionId);
        closeModal();
        loadChannelsAndSections();
      };

      return (
        <ModalPanel
          title="Create Channel"
          description="Add a new channel to this server."
          icon={<i className="fas fa-hashtag" />}
          tone="accent"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={closeModal} disabled={busy}>Cancel</Button>
              <Button
                variant="primary"
                onClick={submit}
                disabled={busy || !name.trim()}
                iconLeft={<i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-plus'} />}
              >
                {busy ? 'Creating…' : 'Create Channel'}
              </Button>
            </div>
          }
        >
          <div className="channel-create-modal">
            <TextField
              label="Channel name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new-channel"
              autoFocus
              disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
            <label className="field">
              <span>Channel type</span>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as 'text' | 'voice' | 'announcement')}
                disabled={busy}
              >
                <option value="text">Text Channel</option>
                <option value="voice">Voice Channel</option>
                <option value="announcement">Announcement Channel</option>
              </Select>
            </label>
          </div>
        </ModalPanel>
      );
    };
    openModal(<CreateChannelModal />, { size: 'small', closable: true });
  };

  // Render a ModalPanel-based prompt to create a new section.
  const openCreateSectionModal = () => {
    const CreateSectionModal = () => {
      const [name, setName] = React.useState('');
      const [busy, setBusy] = React.useState(false);

      const submit = async () => {
        if (!name.trim()) return;
        setBusy(true);
        await createSection(name.trim());
        closeModal();
        loadChannelsAndSections();
      };

      return (
        <ModalPanel
          title="Create Section"
          description="Sections group related channels together."
          icon={<i className="fas fa-folder-plus" />}
          tone="accent"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={closeModal} disabled={busy}>Cancel</Button>
              <Button
                variant="primary"
                onClick={submit}
                disabled={busy || !name.trim()}
                iconLeft={<i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-plus'} />}
              >
                {busy ? 'Creating…' : 'Create Section'}
              </Button>
            </div>
          }
        >
          <div className="section-create-modal">
            <TextField
              label="Section name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New Section"
              autoFocus
              disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
          </div>
        </ModalPanel>
      );
    };
    openModal(<CreateSectionModal />, { size: 'small', closable: true });
  };

  // Persist a new channel on the server and rely on socket events to refresh state.
  // New channels default to visible only for roles with manageChannels permission,
  // so they don't appear for regular users until explicitly made public.
  const createChannel = async (name: string, type: 'text' | 'voice' | 'announcement' = 'text', sectionId?: string) => {
    const managedRoleIds = serverRoles
      .filter(r => r.permissions?.manageChannels === true || r.name?.toLowerCase() === 'owner')
      .map(r => r.id);
    try {
      const response = await fetch(`${SERVER_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type, sectionId,
          permissions: {
            read: true, write: true, manage: false,
            readRoles: managedRoleIds,
            writeRoles: managedRoleIds,
          }
        })
      });
      if (!response.ok) throw new Error('Failed to create channel');
    } catch (error) {
      console.error('Error creating channel:', error);
    }
  };

  // Persist a new section and refresh the sidebar listings.
  // New sections default to visible only for roles with manageChannels permission.
  const createSection = async (name: string) => {
    const managedRoleIds = serverRoles
      .filter(r => r.permissions?.manageChannels === true || r.name?.toLowerCase() === 'owner')
      .map(r => r.id);
    try {
      const response = await fetch(`${SERVER_URL}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          permissions: { view: false, manage: false, viewRoles: managedRoleIds }
        })
      });
      if (!response.ok) throw new Error('Failed to create section');
    } catch (error) {
      console.error('Error creating section:', error);
    }
  };

  // Delete a channel from the server; the socket event handles local state.
  const deleteChannel = async (channelId: string) => {
    const serverChannels = channels.filter(c => c.serverId === currentServerId);
    if (serverChannels.length <= 1) return; // must keep at least one channel
    try {
      const response = await fetch(`${SERVER_URL}/channels/${channelId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete channel');
      // Optimistic removal while waiting for socket confirmation
      setChannels(prev => prev.filter(c => c.id !== channelId));
      setMessages(prev => { const m = new Map(prev); m.delete(channelId); return m; });
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

  // Delete a section; channels inside will become unsectioned via the server.
  const deleteSection = async (sectionId: string) => {
    const serverSections = sections.filter(s => s.serverId === currentServerId);
    if (serverSections.length <= 1) return; // must keep at least one section
    // Block if this is the only section that contains channels — deleting it would
    // strand all channels unsectioned while leaving the other section(s) empty.
    const serverChannels = channels.filter(c => c.serverId === currentServerId);
    const channelsInOtherSections = serverChannels.filter(c => c.sectionId && c.sectionId !== sectionId).length;
    const channelsInThisSection   = serverChannels.filter(c => c.sectionId === sectionId).length;
    if (channelsInThisSection > 0 && channelsInOtherSections === 0) return;
    try {
      const response = await fetch(`${SERVER_URL}/sections/${sectionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete section');
      setSections(prev => prev.filter(s => s.id !== sectionId));
    } catch (error) {
      console.error('Error deleting section:', error);
    }
  };

  // Rename an existing channel.
  const renameChannel = async (channelId: string, name: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Failed to rename channel');
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, name } : c));
    } catch (error) {
      console.error('Error renaming channel:', error);
    }
  };

  // Rename an existing section.
  const renameSection = async (sectionId: string, name: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Failed to rename section');
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, name } : s));
    } catch (error) {
      console.error('Error renaming section:', error);
    }
  };

  // Move a channel to a different section (or remove it from any section).
  const moveChannelToSection = async (channelId: string, sectionId: string | undefined) => {
    try {
      const response = await fetch(`${SERVER_URL}/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: sectionId ?? null })
      });
      if (!response.ok) throw new Error('Failed to move channel');
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, sectionId } : c));
    } catch (error) {
      console.error('Error moving channel:', error);
    }
  };

  // ── Drag-and-drop reorder helpers ──────────────────────────────────────────

  const reorderSections = async (orderedIds: string[]) => {
    setSections(prev => prev.map(s => {
      const idx = orderedIds.indexOf(s.id);
      return idx >= 0 ? { ...s, position: idx } : s;
    }));
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      try {
        await fetch(`${SERVER_URL}/sections/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: i }),
        });
      } catch (e) { console.error('Error reordering section:', e); }
    }
  };

  const reorderChannels = async (updates: Array<{ id: string; position: number; sectionId?: string }>) => {
    setChannels(prev => prev.map(c => {
      const u = updates.find(x => x.id === c.id);
      if (!u) return c;
      return { ...c, position: u.position, ...(u.sectionId !== undefined ? { sectionId: u.sectionId } : {}) };
    }));
    for (const { id, position, sectionId } of updates) {
      try {
        const body: Record<string, unknown> = { position };
        if (sectionId !== undefined) body.sectionId = sectionId ?? null;
        await fetch(`${SERVER_URL}/channels/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) { console.error('Error reordering channel:', e); }
    }
  };

  const dndClearState = () => {
    dndDragRef.current = null;
    setDndDraggingId(null);
    setDndOverSectionId(null);
    setDndOverChannelId(null);
  };

  const handleSectionDrop = (targetSectionId: string) => {
    const drag = dndDragRef.current;
    if (!drag || drag.type !== 'section' || drag.id === targetSectionId) return;
    const ordered = sections
      .filter(s => s.serverId === currentServerId)
      .sort((a, b) => a.position - b.position);
    const fromIdx = ordered.findIndex(s => s.id === drag.id);
    const toIdx   = ordered.findIndex(s => s.id === targetSectionId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...ordered];
    const [item] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, item);
    reorderSections(reordered.map(s => s.id));
  };

  const handleChannelDrop = (targetChannelId: string) => {
    const drag = dndDragRef.current;
    if (!drag || drag.type !== 'channel' || drag.id === targetChannelId) return;
    const dragChannel   = channels.find(c => c.id === drag.id);
    const targetChannel = channels.find(c => c.id === targetChannelId);
    if (!dragChannel || !targetChannel) return;

    if (dragChannel.sectionId === targetChannel.sectionId) {
      // Same section — reorder.
      const inSection = channels
        .filter(c => c.sectionId === dragChannel.sectionId && c.serverId === currentServerId)
        .sort((a, b) => a.position - b.position);
      const from = inSection.findIndex(c => c.id === drag.id);
      const to   = inSection.findIndex(c => c.id === targetChannelId);
      if (from < 0 || to < 0) return;
      const reordered = [...inSection];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      reorderChannels(reordered.map((c, i) => ({ id: c.id, position: i })));
    } else {
      // Cross-section — move and insert before target.
      const destList = channels
        .filter(c => c.sectionId === targetChannel.sectionId && c.serverId === currentServerId && c.id !== drag.id)
        .sort((a, b) => a.position - b.position);
      const insertAt = destList.findIndex(c => c.id === targetChannelId);
      const destOrdered = [...destList];
      destOrdered.splice(insertAt >= 0 ? insertAt : destOrdered.length, 0, dragChannel);
      const destUpdates = destOrdered.map((c, i) => ({
        id: c.id, position: i, sectionId: targetChannel.sectionId,
      }));
      // Reposition source section after removal.
      const srcUpdates = channels
        .filter(c => c.sectionId === dragChannel.sectionId && c.serverId === currentServerId && c.id !== drag.id)
        .sort((a, b) => a.position - b.position)
        .map((c, i) => ({ id: c.id, position: i }));
      reorderChannels([...destUpdates, ...srcUpdates]);
    }
  };

  const handleChannelDropToSection = (targetSectionId: string) => {
    const drag = dndDragRef.current;
    if (!drag || drag.type !== 'channel') return;
    const dragChannel = channels.find(c => c.id === drag.id);
    if (!dragChannel || dragChannel.sectionId === targetSectionId) return;
    const inDest = channels
      .filter(c => c.sectionId === targetSectionId && c.serverId === currentServerId)
      .sort((a, b) => a.position - b.position);
    reorderChannels([{ id: drag.id, position: inDest.length, sectionId: targetSectionId }]);
  };

  // Persist channel settings (NSFW, slow mode, topic, pinning).
  const updateChannelSettings = async (
    channelId: string,
    settings: { nsfw: boolean; slowMode: number; topic: string; allowPinning: boolean }
  ) => {
    try {
      const response = await fetch(`${SERVER_URL}/channels/${channelId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Failed to update channel settings');
      setChannels(prev => prev.map(c =>
        c.id === channelId ? { ...c, settings: { ...c.settings, ...settings } } : c
      ));
    } catch (error) {
      console.error('Error updating channel settings:', error);
    }
  };

  // Open the channel settings view for the given channel.
  const openChannelSettings = (channelId: string) => {
    setChannelSettingsChannelId(channelId);
    setActiveView('channel-settings');
  };

  // Close channel settings and return to the server view.
  const closeChannelSettings = () => {
    setChannelSettingsChannelId(null);
    setActiveView('server');
  };

  // Open the section settings view for the given section.
  const openSectionSettings = (sectionId: string) => {
    setSectionSettingsSectionId(sectionId);
    setActiveView('section-settings');
  };

  // Close section settings and return to the server view.
  const closeSectionSettings = () => {
    setSectionSettingsSectionId(null);
    setActiveView('server');
  };

  // Open a ModalPanel-based prompt to rename a section.
  const openRenameSectionModal = (section: ChannelSection) => {
    let nameValue = section.name;
    const handleConfirm = async () => {
      if (nameValue.trim()) {
        await renameSection(section.id, nameValue.trim());
        closeModal();
      }
    };
    const ModalContent = () => {
      const [val, setVal] = React.useState(section.name);
      nameValue = val; // keep outer ref for confirm handler
      return (
        <ModalPanel
          title="Rename Section"
          description="Enter a new name for this section."
          icon={<i className="fas fa-folder-open" />}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!val.trim()}
                onClick={async () => {
                  if (val.trim()) {
                    await renameSection(section.id, val.trim());
                    closeModal();
                  }
                }}
              >
                Rename
              </Button>
            </div>
          }
        >
          <div className="rename-modal">
            <TextField
              label="Section name"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={section.name}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) { renameSection(section.id, val.trim()); closeModal(); } } }}
            />
          </div>
        </ModalPanel>
      );
    };
    openModal(<ModalContent />, { size: 'small', closable: true });
  };

  // Toggle a reaction emoji for the current user on a specific message.
  const handleLocalReaction = (messageId: string, emoji: string) => {
    setLocalReactions(prev => {
      const newMap = new Map(prev);
      const reactions = (newMap.get(messageId) || []).map(r => ({ ...r, users: [...r.users] }));
      const existing = reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.users.includes('You')) {
          existing.users = existing.users.filter(u => u !== 'You');
          newMap.set(messageId, reactions.filter(r => r.users.length > 0));
        } else {
          existing.users.push('You');
          newMap.set(messageId, reactions);
        }
      } else {
        newMap.set(messageId, [...reactions, { emoji, users: ['You'] }]);
      }
      return newMap;
    });
    setReactToMessageId(null);
  };

  // Handle emote selected from the reaction picker overlay.
  const handleReactionEmoteSelect = (emote: { name: string; url: string; unicode?: string }) => {
    if (!reactToMessageId) return;
    const emoji = emote.unicode || emote.url;
    handleLocalReaction(reactToMessageId, emoji);
    setPickerAnchor(null);
  };

  // Optimistically drop a message from local state; real deletion would call the API.
  const deleteMessage = (messageId: string) => {
    // In a real implementation, you'd send a delete request to the server
    // For now, we'll just remove it from local state
    setMessages(prev => {
      const newMessages = new Map(prev);
      const channelMessages = newMessages.get(currentChannelId) || [];
      newMessages.set(currentChannelId, channelMessages.filter(msg => msg.id !== messageId));
      return newMessages;
    });
  };

  // Render a message with plugin overrides, falling back to sanitized HTML.
  const renderMessage = (msg: Message, index?: number, arr?: Message[]) => {
    const processedMessage = pluginManager.processMessage(msg);
    const userMeta = users.find(u => u.name === processedMessage.user);

    // Check if there's a custom component for this message type
    const MessageComponent = pluginManager.getMessageTypeComponent(processedMessage.type);

    if (MessageComponent) {
      // Check if the plugin for this message type is enabled
      const plugin = pluginManager.getEnabledPluginForMessage(processedMessage);
      if (!plugin) {
        // Plugin is disabled, render as plain text
        return (
          <div key={processedMessage.id} className="message">
            <span className="username">{processedMessage.user}:</span>
            <span className="content" dangerouslySetInnerHTML={{ __html: toSafeHtml(processedMessage) }} />
            <span className="message-type">[{processedMessage.type} - disabled]</span>
          </div>
        );
      }

      try {
        const componentResult = (MessageComponent as any)({ message: processedMessage });
        if (componentResult && componentResult.type) {
          return renderJSXLike(componentResult, processedMessage.id);
        }
      } catch (error) {
        console.error('Error rendering plugin component:', error);
      }

      const Component = MessageComponent as React.ComponentType<{ message: Message; key?: string }>;
      return React.createElement(Component, { key: processedMessage.id, message: processedMessage });
    }

    const safeContent = toSafeHtml(processedMessage);
    const resolvedRole = processedMessage.userRole || userMeta?.role;
    const roleColor = getRoleColor(resolvedRole);
    const msgReactions = localReactions.get(processedMessage.id) || [];
    // First message in a channel OR first message from a new author → extra top margin
    const isGroupStart = index == null || index === 0 || !arr || arr[index - 1].user !== processedMessage.user;

    // Avatar: use provided avatar URL or generate 1-2 letter initials
    const avatarInitials = processedMessage.user
      .split(' ')
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() || '')
      .join('');

    // Deterministic pastel background for the avatar circle
    const AVATAR_COLORS = ['#5865f2','#eb459e','#57f287','#fee75c','#ed4245','#3ba55d','#faa61a','#9c27b0','#00b0f4','#ff7043'];
    const avatarBg = AVATAR_COLORS[
      [...processedMessage.user].reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length
    ];

    // Compact timestamp — HH:MM
    const formatTime = (value?: Date | string) => {
      if (!value) return '';
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    return (
      <div
        key={processedMessage.id}
        className={`message${isGroupStart ? ' message--group-start' : ''}`}
        onContextMenu={(e) => {
          if (processedMessage.user === 'You') {
            e.preventDefault();
            if (confirm('Delete this message?')) deleteMessage(processedMessage.id);
          }
        }}
      >
        {/* Hover action toolbar — floats top-right on hover */}
        <div className="message-actions">
          <button
            className="message-action-btn"
            title="Add Reaction"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setPickerAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
              setReactToMessageId(prev =>
                prev === processedMessage.id ? null : processedMessage.id
              );
            }}
          >
            <i className="far fa-smile-beam" />
          </button>
          <button
            className="message-action-btn"
            title="Reply"
            onClick={() => setReplyingTo(processedMessage as Message)}
          >
            <i className="fas fa-reply" />
          </button>
          <button
            className="message-action-btn"
            title="Forward"
          >
            <i className="fas fa-share" />
          </button>
          <button
            className="message-action-btn"
            title="More options"
            onClick={(e) => {
              if (processedMessage.user === 'You') {
                e.preventDefault();
                if (confirm('Delete this message?')) deleteMessage(processedMessage.id);
              }
            }}
          >
            <i className="fas fa-ellipsis-h" />
          </button>
        </div>

        {/* Reply reference shown above (greyed banner) */}
        {processedMessage.replyTo && (
          <div className="message-reply-context">
            <div className="reply-context-line" />
            <i className="fas fa-reply reply-context-icon" />
            <span
              className="reply-context-name"
              style={(() => {
                const refMeta = users.find(u => u.name === processedMessage.replyTo!.user);
                const refColor = getRoleColor(refMeta?.role);
                return refColor ? { color: refColor } : undefined;
              })()}
            >
              {processedMessage.replyTo.user}
            </span>
            <span className="reply-context-content">
              {processedMessage.replyTo.content.length > 80
                ? processedMessage.replyTo.content.slice(0, 80) + '…'
                : processedMessage.replyTo.content}
            </span>
          </div>
        )}

        {/* Main message row: avatar + content column */}
        <div className="message-row">
          {/* Avatar */}
          <div className="message-avatar" style={userMeta?.avatar ? undefined : { background: avatarBg }}>
            {userMeta?.avatar
              ? <img src={userMeta.avatar} alt={processedMessage.user} />
              : <span className="avatar-initials">{avatarInitials}</span>
            }
          </div>

          {/* Content column */}
          <div className="message-main">
            {/* Header: username, role badge, timestamp */}
            <div className="message-header">
              <span
                className="message-username"
                style={roleColor ? { color: roleColor } : undefined}
              >
                {processedMessage.user}
              </span>
              {resolvedRole && (
                <span className="message-role-badge" style={roleColor ? { color: roleColor, borderColor: roleColor } : undefined}>
                  {resolvedRole}
                </span>
              )}
              <span className="message-timestamp">
                {formatTime(processedMessage.timestamp)}
              </span>
            </div>

            {/* Content */}
            <div className="message-content">
              <span dangerouslySetInnerHTML={{ __html: safeContent }} />
              {processedMessage.type !== 'text' && (
                <span className="message-type-tag">[{processedMessage.type}]</span>
              )}
              {processedMessage.embeds && processedMessage.embeds.map((embed, j) => {
                const EmbedComp = embed.component;
                return <EmbedComp key={j} {...embed} />;
              })}
            </div>

            {/* Reactions row */}
            {msgReactions.length > 0 && (
              <div className="message-reactions">
                {msgReactions.map(reaction => (
                  <button
                    key={reaction.emoji}
                    className={`reaction-chip ${reaction.users.includes('You') ? 'reaction-chip--active' : ''}`}
                    onClick={() => handleLocalReaction(processedMessage.id, reaction.emoji)}
                    title={reaction.users.join(', ')}
                  >
                    {reaction.emoji.startsWith('http') ? (
                      <img src={reaction.emoji} alt="emote" className="reaction-img" />
                    ) : (
                      <span className="reaction-emoji">{reaction.emoji}</span>
                    )}
                    <span className="reaction-count">{reaction.users.length}</span>
                  </button>
                ))}
                <button
                  className="reaction-chip reaction-chip--add"
                  title="Add Reaction"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setPickerAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                    setReactToMessageId(prev =>
                      prev === processedMessage.id ? null : processedMessage.id
                    );
                  }}
                >
                  <i className="far fa-smile" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Helper function to render JSX-like structures
  // Render a lightweight JSX-like structure produced by plugins.
  const renderJSXLike = (element: any, key: string): React.ReactElement => {
    if (!element || typeof element !== 'object') {
      return <span key={key}>{String(element)}</span>;
    }

    const { type, props = {} } = element;
    const { children, ...otherProps } = props;

    // Convert children
    let renderedChildren: React.ReactNode[] = [];
    if (Array.isArray(children)) {
      renderedChildren = children.map((child, index) => renderJSXLike(child, `${key}-${index}`));
    } else if (children) {
      renderedChildren = [renderJSXLike(children, `${key}-child`)];
    }

    return React.createElement(type, { ...otherProps, key }, ...renderedChildren);
  };

  // Format timestamps that may arrive as strings or Date instances.
  const formatTimestamp = (value?: Date | string) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  };

  // Collect media-friendly payloads for a specific channel to power the media cache UI.
  const collectMediaItemsForChannel = (channelId: string) => {
    const channelMessages = messages.get(channelId) || [];

    return channelMessages
      .filter(msg => ['image', 'gif', 'file', 'video'].includes(msg.type))
      .map(msg => {
        const data = msg.data || {};
        const mimeType = (data.type as string) || '';
        const isImage = msg.type === 'image' || msg.type === 'gif' || mimeType.startsWith('image/');
        const isVideo = msg.type === 'video' || mimeType.startsWith('video/');

        return {
          id: msg.id,
          type: msg.type,
          name: data.title || data.name || msg.content || msg.type,
          url: data.url || data.data || '',
          mimeType,
          size: data.size,
          isImage,
          isVideo,
          timestamp: msg.timestamp
        };
      });
  };

  const isMobile = viewportWidth <= 768;
  const isHomeView = activeView === 'home';
  const isSettingsView = activeView === 'settings';
  const isServerView = activeView === 'server';
  const isServerSettingsView = activeView === 'server-settings';
  const isChannelSettingsView = activeView === 'channel-settings';
  const isSectionSettingsView = activeView === 'section-settings';

  // Determine whether the current user has permission to manage channels/sections.
  const currentUserData = users.find(u => u.name === (user?.name ?? '')) || users.find(u => u.name === 'You');
  const currentUserRoleObj = serverRoles.find(r =>
    r.name?.toLowerCase() === currentUserData?.role?.toLowerCase()
  );
  // For real servers, compare against ownerUsername from /info.  Fall back to
  // the legacy in-memory role for local/test servers.
  const currentServerForOwner = servers.find(s => s.id === currentServerId);
  const cachedServerInfo = currentServerForOwner ? serverInfoCache.get(currentServerForOwner.url) : null;
  const isCurrentUserServerOwner = cachedServerInfo?.ownerUsername
    ? user?.username?.toLowerCase() === cachedServerInfo.ownerUsername.toLowerCase()
    : currentUserData?.role?.toLowerCase() === 'owner';
  const canManageChannels =
    isCurrentUserServerOwner ||
    currentUserRoleObj?.permissions?.manageChannels === true;

  // Visibility helpers — determine whether the current user's role can see a section/channel.
  // Managers always bypass restrictions; empty role-list means public (everyone can see).
  const canUserViewSection = React.useCallback((section: ChannelSection): boolean => {
    if (canManageChannels) return true;
    const viewRoles = section.permissions?.viewRoles ?? section.permissions?.roles ?? [];
    if (viewRoles.length === 0) return true;
    return viewRoles.some((rid: string) => {
      const role = serverRoles.find(r => r.id === rid);
      return role?.name?.toLowerCase() === currentUserData?.role?.toLowerCase();
    });
  }, [canManageChannels, serverRoles, currentUserData]);

  const canUserReadChannel = React.useCallback((channel: Channel): boolean => {
    if (canManageChannels) return true;
    const readRoles = channel.permissions?.readRoles ?? channel.permissions?.roles ?? [];
    if (readRoles.length === 0) return true;
    return readRoles.some((rid: string) => {
      const role = serverRoles.find(r => r.id === rid);
      return role?.name?.toLowerCase() === currentUserData?.role?.toLowerCase();
    });
  }, [canManageChannels, serverRoles, currentUserData]);
  const roleColorByName = React.useMemo(() => {
    const map = new Map<string, string>();
    serverRoles.forEach(role => {
      if (role.name) {
        map.set(role.name, role.color || '#9ca3af');
      }
    });
    return map;
  }, [serverRoles]);

  const getRoleColor = (role?: string) => {
    if (!role) return undefined;
    return roleColorByName.get(role);
  };
  const showMobileNavButtons = viewportWidth <= 1100;
  const showServerListPanel = !isMobile || showMobileServerList;
  const showSidebarPanel = isServerView && ((!sidebarCollapsed && !isMobile) || (isMobile && showMobileSidebar));
  const showUserListPanel = isServerView && ((!userListCollapsed && !isMobile) || (isMobile && showMobileUserList));

  // Dismiss all mobile drawers at once.
  const closeMobileDrawers = () => {
    setShowMobileServerList(false);
    setShowMobileSidebar(false);
    setShowMobileUserList(false);
  };

  // Toggle the server + channel mobile drawers in sync.
  const toggleMobileNavPanels = () => {
    if (isMobile) {
      const shouldOpen = !(showMobileServerList || showMobileSidebar);
      setShowMobileServerList(shouldOpen);
      setShowMobileSidebar(shouldOpen);
      setShowMobileUserList(false);
    } else {
      setSidebarCollapsed(false);
      setUserListCollapsed(false);
    }
  };

  // Toggle the member list on mobile while collapsing other drawers.
  const toggleMobileMembers = () => {
    if (isMobile) {
      setShowMobileUserList(prev => !prev);
      setShowMobileServerList(false);
      setShowMobileSidebar(false);
    } else {
      setUserListCollapsed(false);
    }
  };

  const currentServerObj = servers.find(s => s.id === currentServerId);
  const currentServerName = currentServerObj?.name || 'Home';
  const nonHomeServers = servers.filter(s => s.id !== 'home');
  const settingsServer = servers.find(s => s.id === (serverSettingsServerId || currentServerId)) || currentServerObj || null;
  const settingsChannels = channels.filter(c => c.serverId === (settingsServer?.id || currentServerId));
  const selectedSettingsChannelId = serverSettingsChannelId || settingsChannels[0]?.id || '';
  const channelSettingsChannel = channelSettingsChannelId
    ? channels.find(c => c.id === channelSettingsChannelId) ?? null
    : null;
  const channelSettingsSections = channelSettingsChannel
    ? sections.filter(s => s.serverId === channelSettingsChannel.serverId)
    : [];
  const sectionSettingsSection = sectionSettingsSectionId
    ? sections.find(s => s.id === sectionSettingsSectionId) ?? null
    : null;
  const currentChannel = channels.find(c => c.id === currentChannelId && c.serverId === currentServerId);
  const currentMessages = messages.get(currentChannelId) || [];
  const currentChannelMedia = currentChannelId ? collectMediaItemsForChannel(currentChannelId).slice(0, 10) : [];

  // Group channels by section
  const channelsBySection = sections.reduce((acc, section) => {
    acc[section.id] = channels.filter(c => c.sectionId === section.id && c.serverId === currentServerId);
    return acc;
  }, {} as Record<string, Channel[]>);

  const unsectionedChannels = channels.filter(c => !c.sectionId && c.serverId === currentServerId);

  // For real servers, use live member data from the /members endpoint.
  // For home/test server, fall back to the mock `users` array.
  const effectiveMembers: User[] = currentServerId === 'home'
    ? users
    : (Array.isArray(serverMembers.get(currentServerId)) ? serverMembers.get(currentServerId)! : []).map(m => ({
        id: m.username,
        name: m.username,
        status: m.status,
        role: m.role,
      }));

  const channelMembers = effectiveMembers.filter(u => {
    if (!currentChannelId) return true;
    if (!u.accessibleChannels || u.accessibleChannels.length === 0) return true;
    return u.accessibleChannels.includes(currentChannelId);
  });
  const channelMemberOnlineCount = channelMembers.filter(u => u.status !== 'offline').length;

  const groupChannelMembers = (members: User[]) => {
    const groups = new Map<string, User[]>();

    const labelForRole = (role?: string) => {
      if (!role) return 'Members';
      const normalized = role.toLowerCase();
      if (normalized === 'owner') return 'Server Owner';
      if (normalized === 'mod' || normalized === 'moderator') return 'Moderators';
      return role;
    };

    members.forEach(member => {
      const label = labelForRole(member.role);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(member);
    });

    const orderWeight = (label: string) => {
      const key = label.toLowerCase();
      if (key === 'server owner') return 0;
      if (key === 'moderators') return 1;
      if (key === 'members') return 99;
      return 10; // custom groups between mods and general members
    };

    return Array.from(groups.entries())
      .map(([label, groupedUsers]) => ({
        label,
        users: groupedUsers.sort((a, b) => a.name.localeCompare(b.name)),
        weight: orderWeight(label)
      }))
      .sort((a, b) => a.weight - b.weight || a.label.localeCompare(b.label));
  };

  const groupedChannelMembers = groupChannelMembers(channelMembers);

  const channelMetrics = currentChannelId
    ? {
        totalMessages: currentMessages.length,
        uniqueSenders: new Set(currentMessages.map(msg => msg.user)).size,
        mediaCount: currentChannelMedia.length,
        lastActivity: currentMessages[currentMessages.length - 1]?.timestamp
      }
    : null;

  const mediaRollupByChannel = channels
    .filter(channel => channel.serverId === currentServerId)
    .map(channel => {
      const mediaItems = collectMediaItemsForChannel(channel.id);
      const channelMsgs = messages.get(channel.id) || [];
      return {
        channel,
        mediaCount: mediaItems.length,
        lastActivity: channelMsgs[channelMsgs.length - 1]?.timestamp,
        sampleMedia: mediaItems[0]
      };
    })
    .filter(entry => entry.mediaCount > 0);

  return (
    <SurfaceProvider soft3DEnabled={soft3DEnabled}>
    <div className={`app-shell ${soft3DEnabled ? 'soft-3d' : 'soft-3d-off'}`}>
      <TitleBar />
      <div className="app">
      {isMobile && (showMobileServerList || showMobileSidebar || showMobileUserList) && (
        <div className="mobile-backdrop" onClick={closeMobileDrawers} />
      )}

      {showServerListPanel && (
        <div className={`server-list ${isMobile ? 'mobile-drawer' : ''} ${showMobileServerList ? 'mobile-open' : ''}`}>
          <div className="server-items">
            <div
              className={`server-item home ${currentServerId === 'home' ? 'active' : ''}`}
              onClick={() => switchServer('home')}
              title="Home"
            >
              <span className="server-icon home-icon">
                <i className="fas fa-home"></i>
              </span>
            </div>

            <div className="server-divider" />

            {nonHomeServers.map(server => (
              <div
                key={server.id}
                className={`server-item ${server.id === currentServerId ? 'active' : ''}`}
                onClick={() => switchServer(server.id)}
                title={server.name}
              >
                <span className="server-name">{server.name}</span>
                {server.icon ? (
                  <img src={server.icon} alt={server.name} className="server-icon" />
                ) : (
                  <span className="server-icon">{generateServerInitials(server.name)}</span>
                )}
              </div>
            ))}
          </div>
          <div className="server-list-bottom">
            <div className="add-server" onClick={addServer} title="Add Server">
              <span className="add-server-icon">+</span>
            </div>
            <div className="account-btn" onClick={openAccountSettings} title="Account">
              <i className="fas fa-user"></i>
            </div>
          </div>
        </div>
      )}

      <div className="content-shell">
        {showSidebarPanel && (
          <>
            <div
              className={`sidebar ${isMobile ? 'mobile-drawer' : ''} ${showMobileSidebar ? 'mobile-open' : ''} ${isMobile && showMobileServerList ? 'mobile-offset' : ''}`}
              style={!isMobile ? { width: `${sidebarWidth}px` } : undefined}
            >
              {isMobile && (
                <button
                  className="mobile-close"
                  onClick={() => {
                    setShowMobileSidebar(false);
                    setShowMobileServerList(false);
                  }}
                  aria-label="Close channel list"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
              <div className="server-header">
                <div className="server-header-left">
                  <h2>{currentServerName}</h2>
                  <div className="server-header-actions">
                    <button
                      className="server-menu-btn"
                      onClick={toggleServerMenu}
                      title="Server menu"
                    >
                      <i className="fas fa-cog"></i>
                    </button>
                    {showServerMenu && (
                      <div className="server-menu" onMouseLeave={closeServerMenu}>
                        <button onClick={() => { openServerSettings(); closeServerMenu(); }}>
                          <i className="fas fa-sliders-h"></i> Server settings
                        </button>
                        <button className="danger" onClick={() => { leaveServer(currentServerId); closeServerMenu(); }}>
                          <i className="fas fa-sign-out-alt"></i> Leave {currentServerName}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {!isMobile && (
                  <button className="collapse-btn" onClick={toggleSidebar} title="Collapse Sidebar">
                    <i className="fas fa-chevron-left"></i>
                  </button>
                )}
              </div>

              <div className="channels-list">
                {sections
                  .filter(section => section.serverId === currentServerId && canUserViewSection(section))
                  .sort((a, b) => a.position - b.position)
                  .map(section => {
                    // Show all channels to managers; restrict to readable ones for regular users.
                    const sectionChannels = (channelsBySection[section.id] || []).filter(ch => canUserReadChannel(ch));
                    return (
                      <div
                        key={section.id}
                        className={`channel-section${dndDraggingId === section.id ? ' dnd-dragging' : ''}${dndOverSectionId === section.id ? ' dnd-over-section' : ''}`}
                        onDragOver={canManageChannels ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dndDragRef.current && dndDragRef.current.id !== section.id)
                            setDndOverSectionId(section.id);
                        } : undefined}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node))
                            setDndOverSectionId(null);
                        }}
                        onDrop={canManageChannels ? (e) => {
                          e.preventDefault();
                          const drag = dndDragRef.current;
                          if (drag?.type === 'section') handleSectionDrop(section.id);
                          else if (drag?.type === 'channel') handleChannelDropToSection(section.id);
                          dndClearState();
                        } : undefined}
                        onContextMenu={canManageChannels ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ type: 'section', id: section.id, x: e.clientX, y: e.clientY });
                        } : undefined}
                      >
                        <div
                          className="section-header"
                          draggable={canManageChannels ? true : undefined}
                          onDragStart={canManageChannels ? (e) => {
                            e.stopPropagation();
                            dndDragRef.current = { type: 'section', id: section.id };
                            setDndDraggingId(section.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', section.id);
                          } : undefined}
                          onDragEnd={dndClearState}
                        >
                          {canManageChannels && (
                            <span className="drag-handle" title="Drag to reorder">
                              <i className="fas fa-grip-vertical" />
                            </span>
                          )}
                          <span className="section-name">{section.name}</span>
                          {canManageChannels && (
                            <>
                              <button
                                className="section-plus-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveAddMenu(prev => prev === section.id ? null : section.id);
                                }}
                                title="Add Channel"
                              >
                                +
                              </button>
                              {activeAddMenu === section.id && (
                                <div className="section-menu">
                                  <button
                                    onClick={() => {
                                      setActiveAddMenu(null);
                                      openCreateChannelModal(section.id);
                                    }}
                                  >
                                    Add Channel
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveAddMenu(null);
                                      openCreateSectionModal();
                                    }}
                                  >
                                    Add Section
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <div className="section-channels">
                          {sectionChannels
                            .sort((a, b) => a.position - b.position)
                            .map(channel => (
                              <div
                                key={channel.id}
                                className={`channel${channel.id === currentChannelId ? ' active' : ''}${channel.settings?.nsfw ? ' nsfw' : ''}${dndDraggingId === channel.id ? ' dnd-dragging' : ''}${dndOverChannelId === channel.id ? ' dnd-over-channel' : ''}`}
                                draggable={canManageChannels ? true : undefined}
                                onDragStart={canManageChannels ? (e) => {
                                  e.stopPropagation();
                                  dndDragRef.current = { type: 'channel', id: channel.id };
                                  setDndDraggingId(channel.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', channel.id);
                                } : undefined}
                                onDragOver={canManageChannels ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (dndDragRef.current?.type === 'channel' && dndDragRef.current.id !== channel.id)
                                    setDndOverChannelId(channel.id);
                                } : undefined}
                                onDragLeave={() => setDndOverChannelId(null)}
                                onDrop={canManageChannels ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (dndDragRef.current?.type === 'channel') handleChannelDrop(channel.id);
                                  dndClearState();
                                } : undefined}
                                onDragEnd={dndClearState}
                                onClick={() => joinChannel(channel.id)}
                                onContextMenu={canManageChannels ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setContextMenu({ type: 'channel', id: channel.id, x: e.clientX, y: e.clientY });
                                } : undefined}
                              >
                                {canManageChannels && (
                                  <span className="drag-handle" title="Drag to reorder">
                                    <i className="fas fa-grip-vertical" />
                                  </span>
                                )}
                                <span className="channel-icon">
                                  {channel.type === 'text' && '#'}
                                  {channel.type === 'voice' && '🔊'}
                                  {channel.type === 'announcement' && '📢'}
                                </span>
                                <span className="channel-name">
                                  {channel.name}
                                  {channel.settings?.nsfw && <span className="nsfw-indicator">🔞</span>}
                                </span>
                                {channel.messageCount && channel.messageCount > 0 && (
                                  <span className="message-count">({channel.messageCount})</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                {unsectionedChannels.length > 0 && (
                  <div className="channel-section">
                    <div className="section-channels">
                      {unsectionedChannels
                        .sort((a, b) => a.position - b.position)
                        .map(channel => (
                          <div
                            key={channel.id}
                            className={`channel${channel.id === currentChannelId ? ' active' : ''}${channel.settings?.nsfw ? ' nsfw' : ''}${dndDraggingId === channel.id ? ' dnd-dragging' : ''}${dndOverChannelId === channel.id ? ' dnd-over-channel' : ''}`}
                            draggable={canManageChannels ? true : undefined}
                            onDragStart={canManageChannels ? (e) => {
                              e.stopPropagation();
                              dndDragRef.current = { type: 'channel', id: channel.id };
                              setDndDraggingId(channel.id);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', channel.id);
                            } : undefined}
                            onDragOver={canManageChannels ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              if (dndDragRef.current?.type === 'channel' && dndDragRef.current.id !== channel.id)
                                setDndOverChannelId(channel.id);
                            } : undefined}
                            onDragLeave={() => setDndOverChannelId(null)}
                            onDrop={canManageChannels ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (dndDragRef.current?.type === 'channel') handleChannelDrop(channel.id);
                              dndClearState();
                            } : undefined}
                            onDragEnd={dndClearState}
                            onClick={() => joinChannel(channel.id)}
                            onContextMenu={canManageChannels ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ type: 'channel', id: channel.id, x: e.clientX, y: e.clientY });
                            } : undefined}
                          >
                            {canManageChannels && (
                              <span className="drag-handle" title="Drag to reorder">
                                <i className="fas fa-grip-vertical" />
                              </span>
                            )}
                            <span className="channel-icon">
                              {channel.type === 'text' && '#'}
                              {channel.type === 'voice' && '🔊'}
                              {channel.type === 'announcement' && '📢'}
                            </span>
                            <span className="channel-name">
                              {channel.name}
                              {channel.settings?.nsfw && <span className="nsfw-indicator">🔞</span>}
                            </span>
                            {channel.messageCount && channel.messageCount > 0 && (
                              <span className="message-count">({channel.messageCount})</span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {canManageChannels && (
                  <button
                    className="add-section-btn"
                    onClick={() => openCreateSectionModal()}
                    title="Add a new section"
                  >
                    <i className="fas fa-plus" /> Add Section
                  </button>
                )}
              </div>

              {/* Right-click context menu — rendered via ContextMenu portal */}
              {contextMenu && canManageChannels && (() => {
                const section = contextMenu.type === 'section'
                  ? sections.find(s => s.id === contextMenu.id) ?? null
                  : null;
                const channel = contextMenu.type === 'channel'
                  ? channels.find(c => c.id === contextMenu.id) ?? null
                  : null;

                const serverSectionCount = sections.filter(s => s.serverId === currentServerId).length;
                const serverChannelCount = channels.filter(c => c.serverId === currentServerId).length;
                const isLastSection = serverSectionCount <= 1;
                const isLastChannel = serverChannelCount <= 1;

                // Block deleting a section when it holds channels but no other section does
                // (would strand all channels unsectioned while leaving other sections empty).
                const sectionChannelCount = section
                  ? channels.filter(c => c.serverId === currentServerId && c.sectionId === section.id).length
                  : 0;
                const channelsInOtherSections = section
                  ? channels.filter(c => c.serverId === currentServerId && c.sectionId && c.sectionId !== section.id).length
                  : 0;
                const isOnlySectionWithChannels =
                  !isLastSection && sectionChannelCount > 0 && channelsInOtherSections === 0;

                const canDeleteSection = !isLastSection && !isOnlySectionWithChannels;
                const deleteSectionLabel = isLastSection
                  ? 'Delete Section (last)'
                  : isOnlySectionWithChannels
                    ? 'Delete Section (move channels first)'
                    : 'Delete Section';

                const sectionItems: ContextMenuItemDef[] = section ? [
                  { key: 'hdr',      type: 'header',   label: section.name },
                  { key: 'add-ch',   label: 'Add Channel',      icon: <i className="fas fa-plus" />,        onClick: () => openCreateChannelModal(section.id) },
                  { key: 'settings', label: 'Section Settings', icon: <i className="fas fa-sliders-h" />,   onClick: () => openSectionSettings(section.id) },
                  { key: 'rename',   label: 'Rename Section',   icon: <i className="fas fa-pencil-alt" />,  onClick: () => openRenameSectionModal(section) },
                  { key: 'sep',    type: 'separator' },
                  { key: 'delete', label: deleteSectionLabel,
                    icon: <i className="fas fa-trash-alt" />, variant: 'danger', disabled: !canDeleteSection,
                    onClick: () => { if (confirm(`Delete section "${section.name}"? Channels inside will become unsectioned.`)) deleteSection(section.id); } },
                ] : [];

                const typeGlyph = channel?.type === 'voice' ? '🔊' : channel?.type === 'announcement' ? '📢' : '#';
                const channelItems: ContextMenuItemDef[] = channel ? [
                  { key: 'hdr',    type: 'header',    label: `${typeGlyph} ${channel.name}` },
                  { key: 'edit',   label: 'Edit Channel',   icon: <i className="fas fa-cog" />,         onClick: () => openChannelSettings(channel.id) },
                  { key: 'sep',    type: 'separator' },
                  { key: 'delete', label: isLastChannel ? 'Delete Channel (last)' : 'Delete Channel',
                    icon: <i className="fas fa-trash-alt" />, variant: 'danger', disabled: isLastChannel,
                    onClick: () => { if (confirm(`Delete channel "#${channel.name}"? This cannot be undone.`)) deleteChannel(channel.id); } },
                ] : [];

                const items = contextMenu.type === 'section' ? sectionItems : channelItems;

                return (
                  <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={items}
                    minWidth={200}
                  />
                );
              })()}
            </div>
            {!isMobile && (
              <div
                className="resize-handle sidebar-resize"
                onMouseDown={handleSidebarResizeStart}
              />
            )}
          </>
        )}

        {!isMobile && sidebarCollapsed && isServerView && (
          <div className="sidebar-collapsed">
            <button className="expand-btn" onClick={toggleSidebar} title="Expand Sidebar">
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        )}

        <div className="page-surface">
          <div className="main-content">
            {isSettingsView ? (
              <SettingsPage
                userName={user?.name}
                userStatus={user?.status}
                userAvatar={userAvatar}
                themeId={settingsSelectedTheme}
                mode={settingsThemeMode}
                fontId={settingsFontId}
                availableThemes={availableThemes}
                availableFonts={availableFonts}
                soft3DEnabled={soft3DEnabled}
                onThemeChange={setSettingsSelectedTheme}
                onModeChange={(mode) => setSettingsThemeMode(mode)}
                onFontChange={setSettingsFontId}
                onToggleSoft3D={(next) => setSoft3DEnabled(next)}
                onSave={saveSettingsView}
                onLogout={() => { onLogout(); setActiveView('home'); setCurrentServerId('home'); }}
                onChangePassword={handleChangePassword}
                onUpdateProfilePic={handleUpdateProfilePic}
                onDeleteAccount={async (password: string) => {
                  if (!user?.name) return { success: false, error: 'No active account.' };
                  const result = await appAccountManager.login(user.name, password);
                  if (!result.success) return { success: false, error: result.error };
                  appAccountManager.deleteAccount(user.name);
                  onLogout();
                  setActiveView('home');
                  return { success: true };
                }}
              />
            ) : isHomeView ? (
              <HomePage
                user={user}
                nonHomeServers={nonHomeServers}
                currentServerId={currentServerId}
                addServer={addServer}
                joinServer={joinServer}
                switchServer={switchServer}
                openAccountSettings={openAccountSettings}
                generateServerInitials={generateServerInitials}
              />
            ) : isServerSettingsView && settingsServer ? (
              <ServerSettingsPage
                server={settingsServer}
                channels={settingsChannels}
                roles={serverRoles}
                selectedChannelId={selectedSettingsChannelId}
                onSelectChannel={(id) => setServerSettingsChannelId(id)}
                onSavePermissions={saveChannelPermissions}
                onBack={closeServerSettings}
                loading={serverSettingsLoading}
                passwordRequired={serverPasswordRequired}
                onCreateRole={createServerRole}
                onUpdateRole={updateServerRole}
                onUpdateServerIcon={handleUpdateServerIcon}
                ownerUsername={settingsServer ? (serverInfoCache.get(settingsServer.url)?.ownerUsername ?? null) : null}
                currentUsername={user?.username ?? user?.name}
                onClaimOwner={claimOwner}
              />
            ) : isChannelSettingsView && channelSettingsChannel ? (
              <ChannelSettingsPage
                channel={channelSettingsChannel}
                sections={channelSettingsSections}
                roles={serverRoles}
                onBack={closeChannelSettings}
                onRename={renameChannel}
                onMoveTo={moveChannelToSection}
                onSaveSettings={updateChannelSettings}
                onSavePermissions={saveChannelPermissions}
              />
            ) : isSectionSettingsView && sectionSettingsSection ? (
              <SectionSettingsPage
                section={sectionSettingsSection}
                roles={serverRoles}
                onBack={closeSectionSettings}
                onRename={renameSection}
                onSavePermissions={saveSectionPermissions}
              />
            ) : (
              <ServerPage
                showMobileNavButtons={showMobileNavButtons}
                onToggleNavPanels={toggleMobileNavPanels}
                onToggleMembers={toggleMobileMembers}
                currentChannel={currentChannel}
                currentMessages={currentMessages}
                renderMessage={renderMessage}
                message={message}
                onMessageChange={(val) => setMessage(val)}
                onSendMessage={() => sendMessage()}
                showMessageOptions={showMessageOptions}
                onToggleMessageOptions={toggleMessageOptions}
                openEmojiPicker={openEmojiPicker}
                openGifPicker={openGifPicker}
                closeEmotePicker={closeEmotePicker}
                closeGifPicker={closeGifPicker}
                showEmotePicker={showEmotePicker}
                showGifPicker={showGifPicker}
                handleEmoteSelect={handleEmoteSelect}
                handleGifSelect={handleGifSelect}
                handleImageUpload={handleImageUpload}
                handleFileUpload={handleFileUpload}
                sendPollMessage={sendPollMessage}
                servers={servers}
                replyingTo={replyingTo ? { id: replyingTo.id, user: replyingTo.user, content: replyingTo.content } : null}
                onClearReply={() => setReplyingTo(null)}
                reactToMessageId={reactToMessageId}
                onCloseReactionPicker={() => { setReactToMessageId(null); setPickerAnchor(null); }}
                handleReactionEmoteSelect={handleReactionEmoteSelect}
                pickerAnchor={pickerAnchor}
              />
            )}
          </div>
        </div>

        {showUserListPanel && (
          <>
            {!isMobile && (
              <div
                className="resize-handle userlist-resize"
                onMouseDown={handleUserListResizeStart}
              />
            )}
            <div
              className={`user-list ${isMobile ? 'mobile-drawer' : ''} ${showMobileUserList ? 'mobile-open' : ''}`}
              style={!isMobile ? { width: `${userListWidth}px` } : undefined}
            >
              {isMobile && (
                <button
                  className="mobile-close"
                  onClick={() => setShowMobileUserList(false)}
                  aria-label="Close member list"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
              <div className="user-list-header">
                <div className="user-list-title">
                  <h3>
                    {userSidebarTab === 'members' ? 'Channel Members' : 'Channel Insights'}
                  </h3>
                </div>
                {!isMobile && (
                  <button className="collapse-btn" onClick={toggleUserList} title="Collapse User List">
                    <i className="fas fa-chevron-right"></i>
                  </button>
                )}
              </div>
              <div className="user-list-tabs">
                <button
                  className={userSidebarTab === 'members' ? 'active' : ''}
                  onClick={() => setUserSidebarTab('members')}
                  aria-label="Show server users"
                  title="Server users"
                >
                  <i className="fas fa-users"></i>
                  <span className="sr-only">Server Users</span>
                </button>
                <button
                  className={userSidebarTab === 'metrics' ? 'active' : ''}
                  onClick={() => setUserSidebarTab('metrics')}
                  aria-label="Show channel metrics and media"
                  title="Channel metrics and media"
                >
                  <i className="fas fa-chart-line"></i>
                  <span className="sr-only">Metrics & Media</span>
                </button>
              </div>

              <div className="user-list-content">
                {userSidebarTab === 'members' ? (
                  channelMembers.length === 0 ? (
                    <div className="empty-state">No members can view this channel yet.</div>
                  ) : (
                    <>
                      <div className="user-list-footnote">{channelMemberOnlineCount} online — {channelMembers.length} total</div>
                      {groupedChannelMembers.map(group => (
                        <div key={group.label} className="user-group">
                          <div className="user-group-header">{group.label} · {group.users.length}</div>
                          {group.users
                            .slice()
                            .sort((a, b) => {
                              const statusOrder = { online: 0, idle: 1, dnd: 2, offline: 3 } as const;
                              return statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name);
                            })
                            .map(user => (
                              <div
                                key={user.id}
                                className={`user-item ${user.status}`}
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                  const member: MemberEntry = {
                                    username: user.name,
                                    role: user.role,
                                    status: (user.status === 'online' ? 'online' : 'offline') as 'online' | 'offline',
                                  };
                                  setProfilePopover({ member, rect: e.currentTarget.getBoundingClientRect() });
                                }}
                              >
                                <div className="user-avatar">
                                  {user.avatar ? (
                                    <img src={user.avatar} alt={user.name} />
                                  ) : (
                                    <span>{user.name.charAt(0).toUpperCase()}</span>
                                  )}
                                  <div className={`user-status ${user.status}`}></div>
                                </div>
                                <div className="user-meta">
                                  {(() => {
                                    const color = getRoleColor(user.role);
                                    return (
                                      <>
                                        <span className="user-name" style={color ? { color } : undefined}>{user.name}</span>
                                        {user.role && (
                                          <span className="user-role" style={color ? { color } : undefined}>
                                            {user.role}
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                                {user.accessibleChannels && !user.accessibleChannels.includes(currentChannelId) && (
                                  <span className="user-access-note">No access</span>
                                )}
                              </div>
                            ))}
                        </div>
                      ))}
                    </>
                  )
                ) : (
                  <div className="channel-insights">
                    {!currentChannelId ? (
                      <div className="empty-state">Select a channel to view its metrics and media cache.</div>
                    ) : (
                      <>
                        <div className="metric-cards">
                          {[
                            {
                              label: 'Messages',
                              value: channelMetrics?.totalMessages ?? 0,
                              icon: 'fa-comment-dots',
                              tone: 'blue'
                            },
                            {
                              label: 'Unique Senders',
                              value: channelMetrics?.uniqueSenders ?? 0,
                              icon: 'fa-user-friends',
                              tone: 'teal'
                            },
                            {
                              label: 'Media Items',
                              value: channelMetrics?.mediaCount ?? 0,
                              icon: 'fa-photo-video',
                              tone: 'purple'
                            },
                            {
                              label: 'Last Activity',
                              value: formatTimestamp(channelMetrics?.lastActivity),
                              icon: 'fa-clock',
                              tone: 'amber'
                            }
                          ].map(metric => (
                            <div className={`metric-card tone-${metric.tone}`} key={metric.label}>
                              <div className="metric-icon">
                                <i className={`fas ${metric.icon}`}></i>
                              </div>
                              <div className="metric-text">
                                <span className="label">{metric.label}</span>
                                <span className="value">{metric.value}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="media-cache">
                          <div className="media-cache-header">
                            <h4>Media Cache</h4>
                            <span className="hint">Latest 10 media items in this channel</span>
                          </div>
                          {currentChannelMedia.length === 0 ? (
                            <div className="empty-state">No media has been shared in this channel yet.</div>
                          ) : (
                            <div className="media-grid">
                              {currentChannelMedia.map(item => (
                                <div key={item.id} className="media-item" title={item.name}>
                                  <div className="thumb">
                                    {item.isImage ? (
                                      <img src={item.url} alt={item.name} />
                                    ) : (
                                      <div className={`icon ${item.isVideo ? 'video' : 'file'}`}>
                                        <i className={`fas ${item.isVideo ? 'fa-video' : 'fa-file'}`}></i>
                                      </div>
                                    )}
                                  </div>
                                  <div className="meta">
                                    <span className="name">{item.name}</span>
                                    <div className="meta-row">
                                      <span className="pill">{item.type}</span>
                                      <span className="subtle">{formatTimestamp(item.timestamp)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="channel-rollup">
                          <div className="media-cache-header">
                            <h4>Media by Channel</h4>
                            <span className="hint">Jump to a channel to view its cache</span>
                          </div>
                          {mediaRollupByChannel.length === 0 ? (
                            <div className="empty-state">No media shared across channels yet.</div>
                          ) : (
                            <div className="channel-rollup-list">
                              {mediaRollupByChannel.map(entry => (
                                <button
                                  key={entry.channel.id}
                                  className={`channel-rollup-item ${entry.channel.id === currentChannelId ? 'active' : ''}`}
                                  onClick={() => joinChannel(entry.channel.id)}
                                >
                                  <div className="rollup-text">
                                    <span className="name">#{entry.channel.name}</span>
                                    <span className="meta">{entry.mediaCount} media · Last {formatTimestamp(entry.lastActivity)}</span>
                                  </div>
                                  <div className="rollup-preview">
                                    {entry.sampleMedia?.isImage ? (
                                      <img src={entry.sampleMedia.url} alt={entry.sampleMedia.name} />
                                    ) : (
                                      <i className="fas fa-image"></i>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}


        {profilePopover && (
          <UserProfilePopover
            username={profilePopover.member.username}
            currentRole={profilePopover.member.role}
            status={profilePopover.member.status}
            roles={serverRoles}
            canAssignRoles={canManageChannels}
            isYou={(user?.username ?? user?.name) === profilePopover.member.username}
            isOwner={profilePopover.member.username === cachedServerInfo?.ownerUsername}
            anchorRect={profilePopover.rect}
            onAssignRole={(roleName) => assignMemberRole(profilePopover.member.username, roleName)}
            onClose={() => setProfilePopover(null)}
          />
        )}

        {!isMobile && userListCollapsed && isServerView && (
          <div className="user-list-collapsed">
            <button className="expand-btn" onClick={toggleUserList} title="Expand User List">
              <i className="fas fa-chevron-left"></i>
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
    </SurfaceProvider>
  );
}

// Top-level component that handles auth gating and theme/modal providers.
function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Ensure portal containers exist before any child renders (fixes portal
  // race conditions during initial render that can trigger React removeChild
  // errors when portals mount/unmount). Previously this was done inside
  // `AppContent` which runs later; move it here so Loading/Login can rely
  // on stable portal roots too.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    ['kiama-context-menu-root', 'kiama-popover-root', 'kiama-profile-popover-root'].forEach(id => {
      try {
        const el = getPortalContainer(id);
        // lightweight debug
        // eslint-disable-next-line no-console
        console.debug('[Kiama] Ensured portal container', id, 'childCount=', el.childElementCount);
      } catch (e) {
        // Swallow — defensive in case document not ready
      }
    });
  }, []);

  useEffect(() => {
    // Check for stored token and user
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');
    if (storedToken && storedUser) {
      // Local tokens are session-only – don't restore them from storage.
      if (storedToken.startsWith('local:')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
      } else {
        const parsed = JSON.parse(storedUser);
        // Normalise name field in case it was stored before the fix.
        const normalised = { ...parsed, name: parsed.name || parsed.username || 'You' };
        setToken(storedToken);
        setUser(normalised);
      }
    }

    // Simulate app initialization time
    const timer = setTimeout(() => {
      console.debug('[Kiama] App initial loading complete — hiding LoadingScreen');
      setIsLoading(false);
    }, 2500); // Show loading screen for 2.5 seconds

    return () => clearTimeout(timer);
  }, []);

  const handleLogin = (newToken: string, newUser: any) => {
    // Normalise: local accounts carry `username`, server accounts carry `name`.
    const normalised = { ...newUser, name: newUser.name || newUser.username || 'You' };
    setToken(newToken);
    setUser(normalised);
    // Don't persist local tokens to storage — they're session-only.
    if (!newToken.startsWith('local:')) {
      localStorage.setItem('authToken', newToken);
      localStorage.setItem('authUser', JSON.stringify(normalised));
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ModalProvider>
          {isLoading ? (
            <LoadingScreen />
          ) : !token ? (
            <Login onLogin={handleLogin} />
          ) : (
            <AppContent token={token} user={user} onLogout={handleLogout} />
          )}
        </ModalProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;