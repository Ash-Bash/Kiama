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
import PinnedMessagesPanel from './components/PinnedMessagesPanel';
import SettingsPage from './pages/SettingsPage';
import ServerSettingsPage from './pages/ServerSettingsPage';
import ChannelSettingsPage from './pages/ChannelSettingsPage';
import SectionSettingsPage from './pages/SectionSettingsPage';
import ServerUserSettingsPage from './pages/ServerUserSettingsPage';
import Select from './components/Select';
import Button from './components/Button';
import TextField from './components/TextField';
import ModalPanel from './components/ModalPanel';
import NsfwSplash from './components/NsfwSplash';
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

type ActiveView = 'home' | 'server' | 'settings' | 'server-settings' | 'server-profile' | 'channel-settings' | 'section-settings';

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
  const messageListRef = React.useRef<HTMLDivElement | null>(null);
  const normalizeChannel = (c: any, serverId?: string) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    sectionId: c.sectionId,
    position: c.position,
    serverId: serverId ?? c.serverId,
    permissions: c.permissions || {},
    settings: {
      nsfw: !!(c.settings && c.settings.nsfw),
      slowMode: (c.settings && typeof c.settings.slowMode === 'number') ? c.settings.slowMode : 0,
      topic: (c.settings && typeof c.settings.topic === 'string') ? c.settings.topic : '',
      allowPinning: c.settings && typeof c.settings.allowPinning === 'boolean' ? c.settings.allowPinning : true,
      ...c.settings,
    },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messageCount,
  });
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Map<string, Message[]>>(() => new Map());
  const [currentChannelId, setCurrentChannelId] = useState<string>('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sections, setSections] = useState<ChannelSection[]>([]);
  const [channelsLoading, setChannelsLoading] = useState<boolean>(false);
  const [currentServer, setCurrentServer] = useState<string>(SERVER_ID);
  const [servers, setServers] = useState<Server[]>([
    { id: 'home', name: 'Home', url: SERVER_URL }
  ]);
  const [currentServerId, setCurrentServerId] = useState<string>('home');
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [users, setUsers] = useState<User[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [userListWidth, setUserListWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userListCollapsed, setUserListCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingUserList, setIsResizingUserList] = useState(false);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [pinnedPanelAnchor, setPinnedPanelAnchor] = useState<any | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({}); // channelId -> expiry timestamp ms

  // Tick every second to drop expired cooldowns and trigger re-render for countdowns
  useEffect(() => {
    const id = setInterval(() => {
      setCooldowns(prev => {
        const next: Record<string, number> = {};
        const now = Date.now();
        let changed = false;
        for (const k of Object.keys(prev)) {
          if ((prev[k] || 0) > now) {
            next[k] = prev[k];
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
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
  // NSFW acknowledgement set (persisted to localStorage). Tracks channels
  // the user has acknowledged so we don't show the splash every time.
  const [nsfwAcknowledged, setNsfwAcknowledged] = useState<Set<string>>(new Set());
  const [nsfwModalVisible, setNsfwModalVisible] = useState(false);
  const [nsfwModalChannelId, setNsfwModalChannelId] = useState<string | null>(null);
  const [prevChannelId, setPrevChannelId] = useState<string | null>(null);

  const persistNsfwAcks = (set: Set<string>, forUser?: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      const userKey = forUser || (user?.username ?? user?.name ?? 'anonymous');
      const key = `nsfw_ack::${userKey}`;
      window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch (e) {
      // ignore
    }
  };

  // Load per-user acknowledgements whenever the active user changes.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const userKey = user?.username ?? user?.name ?? 'anonymous';
      const key = `nsfw_ack::${userKey}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        console.debug('[NSFW] no ack key for user', userKey);
        setNsfwAcknowledged(new Set());
        return;
      }
      try {
        const arr = JSON.parse(raw);
        console.debug('[NSFW] loaded ack for user', userKey, arr);
        setNsfwAcknowledged(new Set(Array.isArray(arr) ? arr : []));
      } catch (e) {
        console.debug('[NSFW] failed to parse ack for user', userKey, raw);
        setNsfwAcknowledged(new Set());
      }
    } catch (e) {
      setNsfwAcknowledged(new Set());
    }
  }, [user?.username, user?.name]);
  // Log NSFW modal visibility changes for debugging
  useEffect(() => {
    try {
      console.debug('[NSFW] modalVisible changed', { visible: nsfwModalVisible, channelId: nsfwModalChannelId });
    } catch (e) {
      // ignore
    }
  }, [nsfwModalVisible, nsfwModalChannelId]);
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

  // Load this client's per-server nickname for the current server so the UI
  // can display the preferred name immediately.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const localUsername = user?.username ?? user?.name;
      if (!localUsername || !currentServerId) return;
      try {
        const nick = await appAccountManager.getServerNickname(localUsername, currentServerId);
        if (!mounted) return;
        setCurrentUserNicknames(prev => {
          const next = new Map(prev);
          if (nick) next.set(currentServerId, nick);
          else next.delete(currentServerId);
          return next;
        });
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [user?.username, user?.name, currentServerId]);

  // Hydrate server list from the saved account data on login.
  useEffect(() => {
    if (!user?.serverList?.servers?.length) return;
    const incoming: Server[] = user.serverList.servers.map((s: any) => {
      let name = s.name;
      try {
        const parsed = new URL(s.url);
        const hostLabel = parsed.hostname + (parsed.port ? `:${parsed.port}` : '');
        if (!name || name === s.url) name = hostLabel;
      } catch (err) {
        // ignore
      }
      return {
        id: s.id,
        name,
        url: s.url,
        icon: s.icon ? `file://${appAccountManager.getMediaFilePath(s.icon)}` : undefined
      };
    });
    setServers(prev => {
      const homeEntry = prev.find(s => s.id === 'home') || { id: 'home', name: 'Home', url: SERVER_URL };
      return [homeEntry, ...incoming];
    });
    // Fetch /info for each hydrated server to obtain authoritative names/icons
    incoming.forEach(s => { if (s.id !== 'home') void fetchServerInfo(s); });
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
  const [serverRoles, setServerRoles] = useState<Role[]>([]);
  const [serverRolesLoading, setServerRolesLoading] = useState<boolean>(false);
  const [serverSettingsChannelId, setServerSettingsChannelId] = useState<string>('');
  const [channelSettingsChannelId, setChannelSettingsChannelId] = useState<string | null>(null);
  const [sectionSettingsSectionId, setSectionSettingsSectionId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [reactToMessageId, setReactToMessageId] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [localReactions, setLocalReactions] = useState<Map<string, { emoji: string; users: string[] }[]>>(new Map());
  const [serverSettingsServerId, setServerSettingsServerId] = useState<string | null>(null);
  const [serverSettingsLoading, setServerSettingsLoading] = useState(false);
  // Local map of this client's preferred nickname per-server (serverId -> nickname)
  const [currentUserNicknames, setCurrentUserNicknames] = useState<Map<string, string>>(() => new Map());
  const [serverPasswordRequired, setServerPasswordRequired] = useState<boolean | null>(null);
  // Per-server info (owner username + icon URL) fetched via GET /info.
  const [serverInfoCache, setServerInfoCache] = useState<Map<string, { ownerUsername: string | null; iconUrl: string | null; allowClaimOwnership?: boolean }>>(new Map());
  // Per-server member list (username → role + online status) fetched via GET /members.
  const [serverMembers, setServerMembers] = useState<Map<string, MemberEntry[]>>(new Map());
  // Controls the Discord-style user profile popover.
  const [profilePopover, setProfilePopover] = useState<{ member: MemberEntry; rect: DOMRect } | null>(null);
  const [e2eeEnabled, setE2eeEnabled] = useState(false);

  // Tracks which client-side serverId to tag the next channels_list response with.
  const pendingChannelServerIdRef = useRef<string>(currentServerId);
  const [serverError, setServerError] = useState<string | null>(null);

  // Lightweight ping to determine if a server is reachable before switching.
  const pingServer = async (server: Server): Promise<boolean> => {
    if (!server || !server.url) return false;
    // Try the configured URL first; if it fails and the URL used https://,
    // try falling back to http://. If no protocol was provided, try http then https.
    const urls: string[] = [];
    try {
      const parsed = new URL(server.url);
      urls.push(parsed.origin);
      if (parsed.protocol === 'https:') {
        urls.push(`http://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`);
      } else if (parsed.protocol === 'http:') {
        urls.push(`https://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`);
      }
    } catch (err) {
      // Not a full URL — prepend http and https fallbacks
      urls.push(`http://${server.url}`);
      urls.push(`https://${server.url}`);
    }

    for (const base of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${base}/info`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          // If we discovered a working base URL different from the stored one,
          // update the server entry so subsequent requests use the working URL.
          if (base !== server.url) {
            setServers(prev => prev.map(s => s.id === server.id ? { ...s, url: base } : s));
            console.info('[Kiama] pingServer: updated server.url to working base', base);
          }
          return true;
        }
      } catch (e) {
        // try next candidate
      }
    }
    return false;
  };

  // Normalize incoming role arrays to ensure unique IDs and avoid duplicate
  // entries in the UI regardless of race between optimistic updates and
  // server-emitted `roles_updated` events.
  const normalizeRoles = (arr: Role[] | undefined | null) => {
    if (!arr || arr.length === 0) return [] as Role[];
    const m = new Map<string, Role>();
    for (const r of arr) {
      if (!r || !r.id) continue;
      m.set(r.id, r);
    }
    return Array.from(m.values());
  };
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
    // Initialize socket with auth and attach immediate handlers that must
    // be present before we emit any join events (prevents missing nsfw_required)
    socketRef.current = io('http://localhost:3000', {
      auth: {
        token: token
      }
    });

    // Attach NSFW-required handler immediately so we don't miss it if the
    // server responds quickly after a join emit done elsewhere during init.
    try {
      socketRef.current.on('nsfw_required', (data: { channelId: string }) => {
        console.debug('[socket:init] nsfw_required for', data?.channelId);
        setPrevChannelId(currentChannelId || null);
        setNsfwModalChannelId(data.channelId);
        setNsfwModalVisible(true);
      });
    } catch (e) {
      // ignore
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token]);

  useEffect(() => {
    pluginManager.loadPlugins();

    // Discover and install server plugins for the server serving `SERVER_URL`.
    // Prefer the local `servers` entry that matches the URL so we pass the correct server id.
    const serverEntryForUrl = servers.find(s => s.url === SERVER_URL);
    const serverIdForPlugins = serverEntryForUrl ? serverEntryForUrl.id : currentServer;
    pluginManager.discoverServerPlugins(SERVER_URL, serverIdForPlugins);

    // Join default channel
    if (socketRef.current) {
      socketRef.current.emit('join_channel', { channelId: 'general', nsfwAck: nsfwAcknowledged.has('general') });
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

    // `nsfw_required` is registered immediately after socket creation to
    // avoid races where the server responds before handlers are attached.

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

    socketRef.current.on('channels_list', (data: { channels: Channel[], sections: ChannelSection[], serverId?: string }) => {
      // Prefer the serverId returned by the server payload; fall back to the pending ref.
      const targetServerId = data.serverId || pendingChannelServerIdRef.current;

      if (!targetServerId) {
        console.warn('[App] channels_list received with no serverId and no pending target; ignoring to avoid clobbering channels');
        return;
      }

      // Determine the first channel to auto-select for the incoming server
      const sortedIncoming = [...(data.channels || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const firstChannelId = sortedIncoming[0]?.id || '';

      setChannels(prev => {
        // Keep channels that belong to other servers, replace only those for this server
        const others = prev.filter(c => c.serverId !== targetServerId);
        const incoming = (data.channels || []).map(c => ({ ...normalizeChannel(c, targetServerId), messageCount: undefined }));
        return [...others, ...incoming];
      });
      setSections(prev => {
        const others = prev.filter(s => s.serverId !== targetServerId);
        const incoming = (data.sections || []).map(s => ({ ...s, serverId: targetServerId }));
        return [...others, ...incoming];
      });

      // Channels have been loaded from the server
      setChannelsLoading(false);
      // Auto-select the first channel when loading a server's channels
      if (firstChannelId) {
        setCurrentChannelId(firstChannelId);
        if (socketRef.current) {
          socketRef.current.emit('join_channel', { channelId: firstChannelId, nsfwAck: nsfwAcknowledged.has(firstChannelId) });
        }
      }
    });

    socketRef.current.on('channel_created', (channel: Channel) => {
      // Guard against duplicates (e.g. reconnect races)
      setChannels(prev =>
        prev.some(c => c.id === channel.id)
          ? prev
          : [...prev, { ...normalizeChannel(channel, pendingChannelServerIdRef.current), messageCount: undefined }]
      );
    });

    socketRef.current.on('channel_updated', (channel: Channel) => {
      setChannels(prev => prev.map(c => c.id === channel.id ? { ...normalizeChannel(channel, c.serverId) } : c));
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

    socketRef.current.on('roles_updated', (data: { roles: Role[] }) => {
      try {
        const incoming: Role[] = data.roles || [];
        // Replace the locally-known server roles with the authoritative set
        setServerRoles(normalizeRoles(incoming));
        // If a channel settings view is open, refresh that server's channels
        try {
          const openChannel = channelSettingsChannelId ? channels.find(c => c.id === channelSettingsChannelId) : null;
          if (openChannel && socketRef.current) {
            // Ask server for the latest channel list for that server so permissions reflect updates
            pendingChannelServerIdRef.current = openChannel.serverId;
            socketRef.current.emit('get_channels');
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        console.error('Failed to handle roles_updated', err);
      }
    });

    // Server info updates (e.g., icon changed) — update local server entries so
    // all connected clients reflect the new icon immediately.
    socketRef.current.on('server_info_updated', (data: { serverId?: string; iconUrl?: string }) => {
      try {
        const serverId = data?.serverId;
        const iconUrl = data?.iconUrl;
        if (!serverId || !iconUrl) return;
        const srvr = servers.find(s => s.id === serverId);
        const base = srvr ? srvr.url.replace(/\/$/, '') : '';
        const full = base ? `${base}${iconUrl.startsWith('/') ? iconUrl : '/' + iconUrl}?t=${Date.now()}` : iconUrl;
        setServers(prev => prev.map(s => s.id === serverId ? { ...s, icon: full } : s));
        if (srvr) {
          setServerInfoCache(prev => {
            const next = new Map(prev);
            const existing = prev.get(srvr.url) || { ownerUsername: null, iconUrl: null } as any;
            next.set(srvr.url, { ...existing, iconUrl: full });
            return next;
          });
        }
      } catch (e) {
        console.error('Failed to handle server_info_updated', e);
      }
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
        socketRef.current.off('roles_updated');
        socketRef.current.off('member_role_updated');
        socketRef.current.off('user_online');
        socketRef.current.off('user_offline');
      }
    };
  }, [pluginManager, token]);

  // Ask the server for the latest channel + section list for the active server.
  const loadChannelsAndSections = (forServerId?: string) => {
    const targetServerId = forServerId !== undefined ? forServerId : currentServerId;
    pendingChannelServerIdRef.current = targetServerId;

    // Indicate loading while we attempt socket + REST fetch
    setChannelsLoading(true);

    // First try socket route (fast, real-time)
    if (socketRef.current) {
      socketRef.current.emit('get_channels');
    }

    // Also attempt a REST fallback so the UI can populate even if socket
    // events are delayed or lost (helps in flaky network / build mismatches).
    const server = servers.find(s => s.id === targetServerId);
    if (!server || server.id === 'home') return;

    (async () => {
      try {
        const [chRes, secRes] = await Promise.all([
          fetch(`${server.url}/channels`),
          fetch(`${server.url}/sections`)
        ]);
        if (chRes.ok) {
          const chData = await chRes.json();
          const incoming = (chData.channels || []).map((c: any) => ({ ...normalizeChannel(c, targetServerId), messageCount: undefined }));
          setChannels(prev => {
            const others = prev.filter(c => c.serverId !== targetServerId);
            return [...others, ...incoming];
          });
          // Auto-select first channel if none selected
          const first = incoming.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0];
          if (first) {
            setCurrentChannelId(prev => prev || first.id);
          }
        }
        if (secRes.ok) {
          const secData = await secRes.json();
          const incoming = (secData.sections || []).map((s: any) => ({ ...s, serverId: targetServerId }));
          setSections(prev => {
            const others = prev.filter(s => s.serverId !== targetServerId);
            return [...others, ...incoming];
          });
        }
      } catch (e) {
        console.debug('[App] REST channels/sections fetch failed', e);
      } finally {
        // Ensure loading indicator is cleared in all cases
        setChannelsLoading(false);
      }
    })();
  };

  // Move the active socket subscription to a new channel room.
  const joinChannel = (channelId: string) => {
    const prev = currentChannelId;
    console.debug('[joinChannel] requested', { channelId, current: currentChannelId, user: user?.username ?? user?.name });
    // If an NSFW modal is already visible, allow switching to a different
    // channel by closing the modal and proceeding, but prevent re-opening
    // the same modal (avoids stacking and stuck state).
    if (nsfwModalVisible) {
      if (channelId === nsfwModalChannelId) return; // same channel, no-op
      // Close existing modal and clear previous selection so the new
      // channel can be selected normally.
      setNsfwModalVisible(false);
      setNsfwModalChannelId(null);
      setPrevChannelId(null);
    }
    if (socketRef.current) {
      // Leave current channel
      socketRef.current.emit('leave_channel', { channelId: currentChannelId });

      // Join new channel (include nsfw acknowledgment flag)
      socketRef.current.emit('join_channel', { channelId, nsfwAck: nsfwAcknowledged.has(channelId) });
    }
    setCurrentChannelId(channelId);

    if (viewportWidth <= 768) {
      setShowMobileSidebar(false);
    }

    // If the channel is marked NSFW and the user hasn't acknowledged it yet,
    // show a splash/age confirmation. If they cancel, we'll revert to the
    // previously active channel. Guard to ensure only one modal opens.
    const ch = channels.find(c => c.id === channelId);
    console.debug('[joinChannel] resolved channel', ch ? { id: ch.id, nsfw: !!ch.settings?.nsfw } : null, 'ack?', nsfwAcknowledged.has(channelId));
    if (ch && ch.settings?.nsfw) {
      if (!nsfwAcknowledged.has(channelId)) {
        console.debug('[joinChannel] showing NSFW modal for', channelId);
        setPrevChannelId(prev || null);
        setNsfwModalChannelId(channelId);
        setNsfwModalVisible(true);
      } else {
        console.debug('[joinChannel] user already acknowledged nsfw for', channelId);
      }
    }

    // Fallback: if channel info wasn't available yet (ch undefined) or the
    // modal didn't appear for some reason, check shortly after loading and
    // show the splash if the channel is NSFW and not acknowledged. Also
    // leave the socket room so the client doesn't receive NSFW history.
    setTimeout(() => {
      try {
        const maybe = channels.find(c => c.id === channelId);
        if (!maybe) return;
        if (maybe.settings?.nsfw && !nsfwAcknowledged.has(channelId) && !nsfwModalVisible) {
          console.debug('[joinChannel][fallback] showing NSFW modal for', channelId);
          setPrevChannelId(prev || null);
          setNsfwModalChannelId(channelId);
          setNsfwModalVisible(true);
          if (socketRef.current) socketRef.current.emit('leave_channel', { channelId });
        }
      } catch (e) {
        // ignore
      }
    }, 150);
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
        // Replace local/test roles with the authoritative server-provided list.
        // This ensures the Roles/Permissions UI only shows roles that actually exist on the server.
        const incoming: Role[] = data.roles || [];
        setServerRoles(normalizeRoles(incoming));
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

  // Open the user-facing server profile page (per-server nickname, lightweight)
  const openServerProfile = async () => {
    const server = servers.find(s => s.id === currentServerId && s.id !== 'home');
    if (!server) return;
    setServerSettingsServerId(server.id);
    setActiveView('server-profile');
  };

  // Fetch the server's /info endpoint to get ownerUsername and iconUrl.
  // Called every time we switch to a real server (not 'home').
  const fetchServerInfo = async (server: Server) => {
    if (!server.url || server.id === 'home') return;
    try {
      const res = await fetch(`${server.url}/info`);
      if (!res.ok) return;
      const info = await res.json();
      // If the server advertises a friendly name, use it in the UI.
      if (info.name && info.name !== server.name) {
        setServers(prev => prev.map(s => s.id === server.id ? { ...s, name: info.name } : s));
      }
      setServerInfoCache(prev => {
        const next = new Map(prev);
        next.set(server.url, {
          ownerUsername: info.ownerUsername ?? null,
          iconUrl: info.iconUrl ?? null,
          allowClaimOwnership: info.allowClaimOwnership !== false,
        });
        return next;
      });
      // If the server advertises an icon, use the server-hosted URL directly so
      // all clients (not just the uploader) see the same icon.
      if (info.iconUrl) {
        const serverIconUrl = `${server.url}/server/icon?t=${Date.now()}`;
        setServers(prev => prev.map(s => s.id === server.id ? { ...s, icon: serverIconUrl } : s));
      }

      // If no owner is set and the server allows claiming, prompt the first joining user
      if (!info.ownerUsername && info.allowClaimOwnership !== false && user?.username) {
        const ClaimOwnerModal = () => {
          const [ownerInput, setOwnerInput] = useState(user.username || '');
          const [tokenInput, setTokenInput] = useState('');
          const [showToken, setShowToken] = useState(false);
          const [busy, setBusy] = useState(false);
          const [needsToken, setNeedsToken] = useState(false);
          const [msg, setMsg] = useState<string | null>(null);

          const submit = async () => {
            if (!ownerInput.trim()) return;
            setBusy(true);
            const result = await claimOwner(ownerInput.trim(), tokenInput || undefined, server.id);
            setBusy(false);
            if (result.success) {
              closeModal();
            } else {
              if (result.requiresToken) setNeedsToken(true);
              setMsg(result.error || 'Failed to claim ownership.');
            }
          };

          const footer = (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { closeModal(); setActiveView('home'); setCurrentServerId('home'); }} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={busy} iconLeft={<i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-crown'} />}>{busy ? 'Claiming…' : 'Claim Ownership'}</Button>
            </div>
          );

          return (
            <ModalPanel title="Claim Server Ownership" description="This server has no owner yet. Claim ownership to finish setup and receive admin privileges." footer={footer}>
              <p style={{ marginTop: 0, marginBottom: 8, color: 'var(--text-primary)' }}>You will be set as the server owner: <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong></p>
              <TextField
                containerClassName="field--grow field--with-icon"
                label={needsToken ? 'Admin token (required)' : 'Admin token (optional)'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                type={showToken ? 'text' : 'password'}
                disabled={busy}
                suffix={(
                  <Button className="icon-button" variant="ghost" onClick={() => setShowToken(v => !v)} iconLeft={<i className={showToken ? 'fas fa-eye-slash' : 'fas fa-eye'} />} />
                )}
              />
              {msg && <p style={{ color: 'var(--text-primary)', marginTop: 8, fontWeight: 600 }}>{msg}</p>}
              {/* Claim-owner modal: no fetched/active server debug shown in production UI. */}
            </ModalPanel>
          );
        };
        openModal(<ClaimOwnerModal />, { size: 'small', closable: false });
      }
    } catch (e) {
      // Server may not have the /info endpoint yet — silently ignore.
    }
  };

  // Claim (or transfer) ownership of the current real server.
  const claimOwner = async (
    ownerUsername: string,
    adminToken?: string,
    targetServerIdArg?: string,
  ): Promise<{ success: boolean; requiresToken?: boolean; error?: string }> => {
    const targetServerId = targetServerIdArg || serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === targetServerId);
    if (!server) {
      return { success: false, error: `Ownership can only be set on real servers. No server found for id "${targetServerId}".` };
    }
    if (server.id === 'home') {
      return { success: false, error: 'Ownership can only be set on real servers. You are viewing Home.' };
    }
    if (!server.url || !/^https?:\/\//i.test(server.url)) {
      return { success: false, error: `Ownership can only be set on real servers. Server has invalid URL: "${server.url || '<none>'}".` };
    }
    try {
      const trimmedToken = adminToken ? adminToken.toString().trim() : undefined;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (trimmedToken) headers['X-Admin-Token'] = trimmedToken;
      const url = `${server.url}/server/claim-owner`;
      const body = JSON.stringify({ username: ownerUsername, token: trimmedToken });
      console.debug('[claimOwner] POST', { url, headers, body });
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch (e) {
        const text = await res.text();
        console.debug('[claimOwner] non-JSON response', { status: res.status, text });
        return { success: false, error: `Server responded ${res.status}: ${text}` };
      }
      console.debug('[claimOwner] response', { status: res.status, data });
      if (!res.ok) {
        return { success: false, requiresToken: data?.requiresToken === true, error: data?.error || `Server error ${res.status}` };
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
      const msg = err?.message || 'Network error';
      return { success: false, error: `Failed to contact server: ${msg}` };
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
        return;
      }

      // Use server response as the source of truth for the updated channel
      // Preserve local-only fields (serverId, messageCount) which the server
      // responses don't include so channels don't get hidden from the UI.
      const updated = await res.json();
      setChannels(prev => prev.map(ch => ch.id === updated.id ? { ...updated, serverId: ch.serverId, messageCount: ch.messageCount } : ch));
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
      // Merge created role into local state, replacing any existing entry with the
      // same id to avoid duplicates if a server-side `roles_updated` event also
      // arrives shortly after creation.
      setServerRoles(prev => normalizeRoles((() => {
        const exists = prev.some(r => r.id === created.id);
        if (exists) return prev.map(r => r.id === created.id ? created : r);
        return [...prev, created];
      })()));
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

  const deleteServerRole = async (id: string) => {
    const serverId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    console.debug('[App] deleteServerRole', { serverId: serverId, serverUrl: server.url, roleId: id });
    // Optimistic local removal
    setServerRoles(prev => prev.filter(r => r.id !== id));

    try {
      const res = await fetch(`${server.url}/roles/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Log response body to help diagnose why deletion failed and reconcile.
        let body: any = undefined;
        try { body = await res.json(); } catch (e) { /* ignore */ }
        console.error('Failed to delete role', { status: res.status, body });
        // reload roles from server to reconcile optimistic removal
        try {
          const fresh = await fetch(`${server.url}/roles`);
          if (fresh.ok) {
            const data = await fresh.json();
            setServerRoles(normalizeRoles(data.roles || []));
          }
        } catch (e) {
          console.error('Failed to reload roles after delete failure', e);
        }
        return;
      }
      console.info('[App] deleteServerRole succeeded', { serverId: serverId, roleId: id });
    } catch (err) {
      console.error('Failed to delete role', err);
    }
  };

  const leaveServer = (serverId: string) => {
    setServers(prev => {
      const updated = prev.filter(s => s.id !== serverId);
      // Persist to account
          if (user?.username) {
            const nonHome = updated.filter(s => s.id !== 'home');
            appAccountManager.updateServerList(user!.username,
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
  const switchServer = async (serverId: string) => {
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

    // Before we flip state, ensure the server is reachable; if not, surface
    // a simple error page/modal instead of switching into a broken server view.
    const reachable = await pingServer(server);
    if (!reachable) {
      console.warn('[Kiama] switchServer: server unreachable', server.url);
      setServerError(`Cannot reach server "${server.name}" at ${server.url}.`);
      // stay on Home for safety
      setActiveView('home');
      setCurrentServerId('home');
      setCurrentServer(SERVER_ID);
      return;
    }

    // Now that server is reachable, enter the server view.
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
        onAdd={async (server) => {
          // Validate reachability before adding
          const reachable = await pingServer(server);
          if (!reachable) return false;
          setServers(prev => {
            const updated = [...prev, server];
            if (user?.username) {
              const nonHome = updated.filter(s => s.id !== 'home');
              appAccountManager.updateServerList(user!.username,
                nonHome.map(s => ({ id: s.id, name: s.name, url: s.url }))
              ).catch(() => {});
            }
            return updated;
          });
          // Fetch info (name/icon) for the newly added server
          void fetchServerInfo(server);
          return true;
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

    (async () => {
      const serverName = prompt('Name this server:') || 'New Server';
      const newServer: Server = {
        id: `server-${Date.now()}`,
        name: serverName,
        url: invite
      };
      const reachable = await pingServer(newServer);
      if (!reachable) {
        alert('Cannot reach that server. Please check the URL and try again.');
        return;
      }
      // Fetch member list to detect username conflicts and offer a per-server nickname.
      try {
        const res = await fetch(`${invite.replace(/\/$/, '')}/members`);
        if (res.ok && user?.username) {
          const body = await res.json();
          const members: MemberEntry[] = Array.isArray(body) ? body : (body.members ?? []);
          const names = members.map(m => m.username.toLowerCase());
          // Load our current preferred nickname for this server (if any)
          const existingNick = user?.username ? await appAccountManager.getServerNickname(user.username, newServer.id) : undefined;
          // If someone on the server already uses our username, or our desired nickname is taken, prompt.
          if (names.includes((user?.username ?? '').toLowerCase()) || (existingNick && names.includes(existingNick.toLowerCase()))) {
            let choice = prompt('A user with your username or nickname already exists on that server. Enter a preferred nickname (leave blank to use your username):');
            // If user cancels prompt, choice will be null -> treat as empty (use username)
              if (choice !== null) {
                const trimmed = choice.trim() || undefined;
                if (user?.username) {
                  await appAccountManager.setServerNickname(user!.username, newServer.id, trimmed ?? undefined);
                  setCurrentUserNicknames(prev => {
                    const next = new Map(prev);
                    if (trimmed) next.set(newServer.id, trimmed);
                    else next.delete(newServer.id);
                    return next;
                  });
                }
              }
          }
        }
      } catch (e) {
        // Ignore member fetch failures — server may not support /members.
      }
      setServers(prev => {
        const updated = [...prev, newServer];
        if (user?.username) {
          const nonHome = updated.filter(s => s.id !== 'home');
          appAccountManager.updateServerList(user!.username,
            nonHome.map(s => ({ id: s.id, name: s.name, url: s.url }))
          ).catch(() => {});
        }
        return updated;
      });
    })();
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

    // Emit with acknowledgement to handle slow-mode rejections
    if (socketRef.current) {
      try {
        socketRef.current.emit('message', messageData, (ack: any) => {
          if (!ack || !ack.ok) {
            // remove optimistic message
            setMessages(prev => {
              const next = new Map(prev);
              const arr = next.get(currentChannelId) || [];
              next.set(currentChannelId, arr.filter(m => m.id !== messageData.id));
              return next;
            });
            if (ack && ack.reason === 'slow_mode') {
              const retry = Number(ack.retryAfter) || 1;
              const expires = Date.now() + retry * 1000;
              setCooldowns(prev => ({ ...prev, [currentChannelId]: expires }));
            }
            return;
          }
          // accepted — nothing else needed (server already broadcast)
        });
      } catch (e) {
        // fallback: normal emit without ack
        socketRef.current.emit('message', messageData);
      }
    }
    setMessage('');
    setReplyingTo(null);
    // Ensure view focuses the newly-sent message: scroll message list to bottom.
    requestAnimationFrame(() => {
      const el = messageListRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
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
      // Find server entry before updating local state so we can attempt an
      // upload to the authoritative server URL (if any).
      const srvr = servers.find(s => s.id === serverId);

      // Save a local copy first so UI updates immediately.
      const filePath = await appAccountManager.saveServerIcon(serverId, dataUri);
      const iconUrl = `file://${filePath}`;
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, icon: iconUrl } : s));

      // Attempt to upload to the server so all clients can see the same icon.
      if (srvr && srvr.url && srvr.id !== 'home') {
        const tried: string[] = [];
        const candidates: string[] = [];
        try {
          const parsed = new URL(srvr.url);
          candidates.push(parsed.origin);
          if (parsed.protocol === 'https:') candidates.push(`http://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`);
          if (parsed.protocol === 'http:') candidates.push(`https://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`);
        } catch (e) {
          // If srvr.url is not a full URL, try as-is and with http/https prefixes
          candidates.push(srvr.url);
          candidates.push(`http://${srvr.url}`);
          candidates.push(`https://${srvr.url}`);
        }

        let uploaded = false;
        for (const base of candidates) {
          if (tried.includes(base)) continue;
          tried.push(base);
          const target = `${base.replace(/\/$/, '')}/server/icon`;
          console.debug('[App] attempting server icon upload to', target);
          try {
            const uploadRes = await fetch(target, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataUri }),
            });
            const text = await uploadRes.text().catch(() => '');
            if (uploadRes.ok) {
              const serverIconUrl = `${base.replace(/\/$/, '')}/server/icon?t=${Date.now()}`;
              setServers(prev => prev.map(s => s.id === serverId ? { ...s, icon: serverIconUrl } : s));
              // Refresh server info cache and trigger a fetch to /info to ensure consistency
              setServerInfoCache(prev => {
                const next = new Map(prev);
                const existing = prev.get(srvr.url) || { ownerUsername: null, iconUrl: null } as any;
                next.set(srvr.url, { ...existing, iconUrl: serverIconUrl });
                return next;
              });
              // Ask the server for latest /info to ensure everyone is in sync
              try { await fetchServerInfo(srvr); } catch (_) {}
              uploaded = true;
              console.info('[App] server icon upload succeeded to', base);
              break;
            } else {
              console.warn('[App] server icon upload returned non-OK', { target, status: uploadRes.status, body: text });
            }
          } catch (e) {
            console.warn('[App] server icon upload attempt failed', { target, error: String(e) });
          }
        }
        if (!uploaded) {
          console.error('[App] server icon upload: all attempts failed', { tried: tried.slice() });
        }
      } else if (!srvr) {
        console.warn('[App] updateServerIcon: could not find server entry for', serverId, '— upload skipped');
      }

      // Persist icon reference and server info to the account's server list
      if (user?.username) {
        const iconFilename = filePath.split('/').pop() || '';
        await appAccountManager.updateServerList(user!.username, [{
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type, sectionId,
          settings: { nsfw: false, slowMode: 0, allowPinning: true },
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/sections`, {
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/channels/${channelId}`, { method: 'DELETE' });
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/sections/${sectionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete section');
      setSections(prev => prev.filter(s => s.id !== sectionId));
    } catch (error) {
      console.error('Error deleting section:', error);
    }
  };

  // Rename an existing channel.
  const renameChannel = async (channelId: string, name: string) => {
    try {
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/channels/${channelId}`, {
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/sections/${sectionId}`, {
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      const response = await fetch(`${baseUrl}/channels/${channelId}`, {
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
    const serverId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === serverId);
    const baseUrl = server?.url || SERVER_URL;
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      try {
        await fetch(`${baseUrl}/sections/${id}`, {
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
    const serverId = serverSettingsServerId || currentServerId;
    const server = servers.find(s => s.id === serverId);
    const baseUrl = server?.url || SERVER_URL;
    for (const { id, position, sectionId } of updates) {
      try {
        const body: Record<string, unknown> = { position };
        if (sectionId !== undefined) body.sectionId = sectionId ?? null;
        await fetch(`${baseUrl}/channels/${id}`, {
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
      const serverId = serverSettingsServerId || currentServerId;
      const server = servers.find(s => s.id === serverId);
      const baseUrl = server?.url || SERVER_URL;
      // Server expects a PATCH to /channels/:channelId with a `settings`
      // object. Previous code hit a non-existent /channels/:id/settings
      // route so updates weren't persisted.
      const response = await fetch(`${baseUrl}/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
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
  const openChannelSettings = async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    console.log('[App] openChannelSettings channelId=', channelId, 'resolvedChannel=', channel);
    if (channel && channel.serverId) {
      // If the channel is assigned to 'home' but the user is currently
      // viewing a real server, prefer the current server so permissions
      // can be loaded. This handles the case where local demo channels
      // exist under 'home' but the UI is showing a connected server.
      const effectiveServerId = (channel.serverId === 'home' && currentServerId !== 'home')
        ? currentServerId
        : channel.serverId;
      const server = servers.find(s => s.id === effectiveServerId && s.id !== 'home');
      console.log('[App] openChannelSettings effectiveServerId=', effectiveServerId, 'resolvedServer=', server ? server.id : null, 'channel.serverId=', channel.serverId);
      console.log('[App] openChannelSettings calling fetchRolesForServer for', effectiveServerId);
      await fetchRolesForServer(effectiveServerId);

      // Attempt to refresh channels for the effective server. If we don't have
      // a matching `servers` entry, fall back to `SERVER_URL` so local servers work.
      const fetchServer = servers.find(s => s.id === effectiveServerId) || { id: effectiveServerId, url: SERVER_URL } as any;
      try {
        const chanRes = await fetch(`${fetchServer.url}/channels`);
        if (chanRes.ok) {
          const chData = await chanRes.json();
          const incomingChannels: Channel[] = chData.channels || [];
          setChannels(prev => {
            const filtered = prev.filter(p => p.serverId !== fetchServer.id);
            return [...filtered, ...incomingChannels.map(c => ({ ...c, serverId: fetchServer.id }))];
          });
        }
      } catch (err) {
        console.error('Failed to refresh channels for channel settings', err);
      }
    }

    setChannelSettingsChannelId(channelId);
    setActiveView('channel-settings');
  };

  // Close channel settings and return to the server view.
  const closeChannelSettings = () => {
    setChannelSettingsChannelId(null);
    setActiveView('server');
  };

  // Fetch authoritative roles for a given server id and update state.
  const fetchRolesForServer = async (serverId: string) => {
    // Allow callers to pass 'home' or an ID that may not exist in `servers`.
    const targetId = serverId === 'home' ? currentServerId : serverId;

    // Try to resolve by id first, then by URL, then fall back to the first non-home server.
    let server = servers.find(s => s.id === targetId && s.id !== 'home');
    if (!server) server = servers.find(s => s.id !== 'home');
    // If still no server found, assume the default SERVER_URL (local server)
    if (!server) {
      console.warn('[App] fetchRolesForServer: no non-home server entries; falling back to SERVER_URL');
      server = { id: targetId, name: `Server ${targetId}`, url: SERVER_URL } as any;
    }

    try {
      setServerRolesLoading(true);
      const resolvedServer = server as { id: string; name?: string; url: string };
      console.log('[App] fetchRolesForServer requesting', `${resolvedServer.url}/roles`, 'for server id', resolvedServer.id);
      const rolesRes = await fetch(`${resolvedServer.url}/roles`);
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        const incoming: Role[] = data.roles || [];
        setServerRoles(normalizeRoles(incoming));
        setServerSettingsServerId(resolvedServer.id);
        console.log('[App] fetchRolesForServer loaded', resolvedServer.id, 'roles=', incoming.length);
      } else {
        console.warn('[App] fetchRolesForServer non-OK response', rolesRes.status);
      }
    } catch (err) {
      console.error('Failed to fetch roles for server', err);
    } finally {
      setServerRolesLoading(false);
    }
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

  // Ensure we have the authoritative roles loaded for the active server so
  // message/user name colors render correctly.
  React.useEffect(() => {
    if (!currentServerId) return;
    // Fire-and-forget; fetchRolesForServer sets loading state and updates roles
    void fetchRolesForServer(currentServerId);
  }, [currentServerId, servers]);

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

  // Toggle pin state for a message (in-memory)
  const togglePinMessage = (messageId: string) => {
    setMessages(prev => {
      const next = new Map(prev);
      const channelMessages = (next.get(currentChannelId) || []).slice();
      const idx = channelMessages.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      const msg = { ...channelMessages[idx], pinned: !channelMessages[idx].pinned };
      channelMessages[idx] = msg;
      next.set(currentChannelId, channelMessages);
      return next;
    });
  };

  const openPinnedPanel = (anchorRect?: any | null) => {
    setPinnedPanelAnchor(anchorRect ?? null);
    setShowPinnedPanel(true);
  };

  const closePinnedPanel = () => {
    setShowPinnedPanel(false);
    setPinnedPanelAnchor(null);
  };

  // Render a message with plugin overrides, falling back to sanitized HTML.
  const renderMessage = (msg: Message, index?: number, arr?: Message[]) => {
    const processedMessage = pluginManager.processMessage(msg);
    const userMeta = users.find(u => u.name === processedMessage.user);

    // Resolve display name for the message author. If the author is the
    // currently logged-in user and we have a per-server nickname stored,
    // prefer that for display.
    const localUsername = user?.username ?? user?.name;
    const displayNameForMessageAuthor = (processedMessage.user === localUsername)
      ? (currentUserNicknames.get(currentServerId) ?? processedMessage.user)
      : processedMessage.user;

    // Check if there's a custom component for this message type
    const MessageComponent = pluginManager.getMessageTypeComponent(processedMessage.type);

    if (MessageComponent) {
      // Check if the plugin for this message type is enabled
      const plugin = pluginManager.getEnabledPluginForMessage(processedMessage);
      if (!plugin) {
        // Plugin is disabled, render as plain text
        return (
          <div key={processedMessage.id} className="message">
            <span className="username">{displayNameForMessageAuthor}:</span>
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
    const avatarInitials = (displayNameForMessageAuthor || processedMessage.user)
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
      const now = new Date();
      const msInDay = 24 * 60 * 60 * 1000;
      // If message is older than 1 day, include the date + time
      if (now.getTime() - d.getTime() > msInDay) {
        const dateStr = d.toLocaleDateString();
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${dateStr} ${timeStr}`;
      }
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    // Format a remaining seconds countdown as H:MM:SS or S (if < 60)
    const formatCountdown = (secs: number) => {
      if (secs <= 0) return '0s';
      if (secs < 60) return `${secs}s`;
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `${m}:${String(s).padStart(2, '0')}`;
    };

    const isReplyToMe = !!(processedMessage.replyTo && (processedMessage.replyTo.user === localUsername));

    // (reply detection runs here)

    // Helper: jump to the referenced message element and animate it
    const jumpToReferencedMessage = (refId?: string) => {
      if (!refId) return;
      const container = document.querySelector('.message-list') as HTMLElement | null;
      const el = container
        ? (container.querySelector(`[data-message-id="${refId}"]`) as HTMLElement | null)
        : (document.querySelector(`[data-message-id="${refId}"]`) as HTMLElement | null);
      if (!el) {
        console.info('[Kiama] referenced message not found in DOM:', refId);
        return;
      }
      const containerRect = container ? container.getBoundingClientRect() : null;
      const elRect = el.getBoundingClientRect();
      const inView = containerRect
        ? (elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom)
        : (elRect.top >= 0 && elRect.bottom <= window.innerHeight);

      const applyHighlight = () => {
        try {
          el.setAttribute('tabindex', '-1');
          // focus without scrolling (we handle scrolling separately)
          (el as HTMLElement).focus({ preventScroll: true } as any);
        } catch (e) {
          // ignore focus errors
        }
        el.classList.add('message-jump-highlight');
        setTimeout(() => el.classList.remove('message-jump-highlight'), 1600);
      };

      if (!inView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // wait for the smooth scroll to settle before highlighting
        setTimeout(applyHighlight, 420);
      } else {
        applyHighlight();
      }
    };

    return (
      <div
        key={processedMessage.id}
        data-message-id={processedMessage.id}
        tabIndex={-1}
        className={`message${isGroupStart ? ' message--group-start' : ''}${isReplyToMe ? ' message--reply-target' : ''}`}
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
          {processedMessage.user !== localUsername && (
            <button
              className="message-action-btn"
              title="Reply"
              onClick={() => setReplyingTo(processedMessage as Message)}
            >
              <i className="fas fa-reply" />
            </button>
          )}
          {/* Pin / Unpin (visible to channel managers when pinning allowed) */}
          {currentChannel && (currentChannel.settings?.allowPinning ?? true) && (canManageChannels) && (
            <button
              className={["message-action-btn", "message-action-btn--pin", processedMessage.pinned ? 'message-action-btn--pinned' : ''].filter(Boolean).join(' ')}
              title={processedMessage.pinned ? 'Unpin message' : 'Pin message'}
              onClick={(e) => {
                e.stopPropagation();
                togglePinMessage(processedMessage.id);
              }}
            >
              <i className="fas fa-thumbtack" />
            </button>
          )}
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
              role="button"
              tabIndex={0}
              onClick={() => jumpToReferencedMessage(processedMessage.replyTo?.id)}
              onKeyPress={(e) => { if (e.key === 'Enter') jumpToReferencedMessage(processedMessage.replyTo?.id); }}
              style={(() => {
                const refMeta = users.find(u => u.name === processedMessage.replyTo!.user);
                const refColor = getRoleColor(refMeta?.role);
                return Object.assign({ cursor: 'pointer' }, refColor ? { color: refColor } : undefined);
              })()}
            >
              {processedMessage.replyTo.user}
            </span>
            <span
              className="reply-context-content"
              onClick={() => jumpToReferencedMessage(processedMessage.replyTo?.id)}
              style={{ cursor: 'pointer' }}
            >
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
              ? <img src={userMeta.avatar} alt={displayNameForMessageAuthor} />
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
                {displayNameForMessageAuthor}
              </span>
              {resolvedRole && (
                <span className="message-role-badge" style={roleColor ? { color: roleColor, borderColor: roleColor } : undefined}>
                  {resolvedRole}
                </span>
              )}
              <span className="message-timestamp">
                {formatTime(processedMessage.timestamp)}
              </span>
              {/* If this is our message and a cooldown is active for this channel,
                  show a small countdown similar to Discord next to the timestamp. */}
              {processedMessage.user === (user?.username ?? user?.name) && (() => {
                const expires = cooldowns[currentChannelId] || 0;
                const now = Date.now();
                if (expires > now) {
                  const remaining = Math.ceil((expires - now) / 1000);
                  // Only show on recent messages — within last 60s to avoid clutter
                  const msgTime = new Date(processedMessage.timestamp).getTime();
                  if (now - msgTime < 60 * 1000) {
                    return (
                      <span className="message-slowmode-timer" title="Slow mode active" style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                        <i className="far fa-clock" style={{ marginRight: 6 }} />{formatCountdown(remaining)}
                      </span>
                    );
                  }
                }
                return null;
              })()}
            </div>

            {/* reply flag removed (temporary debug UI) */}

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
            {/* NSFW splash modal was previously rendered per-message which caused
                it to re-mount on message updates. It is now rendered once at the
                top-level (below) so it appears immediately on channel click. */}
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
  const isServerProfileView = activeView === 'server-profile';
  const isChannelSettingsView = activeView === 'channel-settings';
  const isSectionSettingsView = activeView === 'section-settings';

  // Determine whether the current user has permission to manage channels/sections.
  // Prefer authoritative member data from `serverMembers` for real servers, fall back to local `users`.
  const _serverMemberList: MemberEntry[] = Array.isArray(serverMembers.get(currentServerId)) ? serverMembers.get(currentServerId)! : [];
  const serverMember = _serverMemberList.find(m => m.username === (user?.name ?? user?.username ?? ''));
  const currentUserData: User | undefined = serverMember
    ? { id: serverMember.username, name: serverMember.username, status: serverMember.status as any, role: serverMember.role }
    : (users.find(u => u.name === (user?.name ?? user?.username ?? '')) || users.find(u => u.name === 'You'));
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

  const canManageServer =
    isCurrentUserServerOwner ||
    currentUserRoleObj?.permissions?.manageServer === true;

  // Visibility helpers — determine whether the current user's role can see a section/channel.
  // Managers always bypass restrictions; empty role-list means public (everyone can see).
  const canUserViewSection = React.useCallback((section: ChannelSection): boolean => {
    if (canManageChannels) return true;
    const viewRoles = section.permissions?.viewRoles ?? section.permissions?.roles ?? [];
    if (viewRoles.length === 0) return true;
    return viewRoles.some((rid: string) => {
      // Resolve role either by id or by name (server may store either)
      const role = serverRoles.find(r => r.id === rid) || serverRoles.find(r => r.name?.toLowerCase() === String(rid).toLowerCase());
      const userRole = String(currentUserData?.role ?? '').toLowerCase();
      const matches = !!(
        (role && ((role.name ?? '').toLowerCase() === userRole || (role.id ?? '').toLowerCase() === userRole)) ||
        String(rid).toLowerCase() === userRole
      );
      if (!matches && currentUserData?.name === 'TestUser1') {
        try {
          console.debug('[perm-debug] viewSection', {
            username: currentUserData?.name,
            userRole: currentUserData?.role,
            sectionId: section.id,
            viewRoles,
            resolvedRole: role ?? null,
          });
        } catch (e) {}
      }
      return matches;
    });
  }, [canManageChannels, serverRoles, currentUserData]);

  const canUserReadChannel = React.useCallback((channel: Channel): boolean => {
    if (canManageChannels) return true;
    const readRoles = channel.permissions?.readRoles ?? channel.permissions?.roles ?? [];
    if (readRoles.length === 0) return true;
    return readRoles.some((rid: string) => {
      // Resolve role either by id or by name (server may store either)
      const role = serverRoles.find(r => r.id === rid) || serverRoles.find(r => r.name?.toLowerCase() === String(rid).toLowerCase());
      const userRole = String(currentUserData?.role ?? '').toLowerCase();
      const matches = !!(
        (role && ((role.name ?? '').toLowerCase() === userRole || (role.id ?? '').toLowerCase() === userRole)) ||
        String(rid).toLowerCase() === userRole
      );
      if (!matches && currentUserData?.name === 'TestUser1') {
        try {
          console.debug('[perm-debug] readChannel', {
            username: currentUserData?.name,
            userRole: currentUserData?.role,
            channelId: channel.id,
            readRoles,
            resolvedRole: role ?? null,
          });
        } catch (e) {}
      }
      return matches;
    });
  }, [canManageChannels, serverRoles, currentUserData]);

  const canUserWriteChannel = React.useCallback((channel: Channel): boolean => {
    if (canManageChannels) return true;
    // If channel explicitly disallows writing, block unless manager
    if (channel.permissions && channel.permissions.write === false) return false;
    const writeRoles = channel.permissions?.writeRoles ?? channel.permissions?.roles ?? [];
    if (writeRoles.length === 0) return true;
    const userRole = String(currentUserData?.role ?? '').toLowerCase();
    return writeRoles.some((rid: string) => {
      const role = serverRoles.find(r => r.id === rid) || serverRoles.find(r => r.name?.toLowerCase() === String(rid).toLowerCase());
      return !!(
        (role && ((role.name ?? '').toLowerCase() === userRole || (role.id ?? '').toLowerCase() === userRole)) ||
        String(rid).toLowerCase() === userRole
      );
    });
  }, [canManageChannels, serverRoles, currentUserData]);
  const roleColorByName = React.useMemo(() => {
    const map = new Map<string, string>();
    serverRoles.forEach(role => {
      const color = role.color || '#9ca3af';
      if (role.name) {
        map.set(role.name, color);
        map.set(role.name.toLowerCase(), color);
      }
      if (role.id) {
        map.set(role.id, color);
        map.set(String(role.id).toLowerCase(), color);
      }
    });
    return map;
  }, [serverRoles]);

  const getRoleColor = (role?: string) => {
    if (!role) return undefined;
    // Try direct match, then case-insensitive lookup
    return roleColorByName.get(role) ?? roleColorByName.get(role.toLowerCase());
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
        name: m.username === (user?.username ?? user?.name) ? (currentUserNicknames.get(currentServerId) ?? m.username) : m.username,
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

  // Precompute visible sections and channels for the sidebar to avoid complex IIFEs in JSX.
  const visibleSections = sections
    .filter(section => section.serverId === currentServerId && canUserViewSection(section))
    .sort((a, b) => a.position - b.position);

  const visibleSectionsWithChannels = visibleSections.map(s => ({
    section: s,
    channels: (channelsBySection[s.id] || []).filter(ch => canUserReadChannel(ch))
  }));

  const totalVisibleChannels = visibleSectionsWithChannels.reduce((sum, s) => sum + s.channels.length, 0);

  if (totalVisibleChannels === 0 && currentServerId !== 'home') {
    try {
      console.debug('[perm-snapshot] no-visible-channels', {
        serverId: currentServerId,
        currentUser: currentUserData ?? null,
        serverRoles: serverRoles.map(r => ({ id: r.id, name: r.name })),
        sections: visibleSectionsWithChannels.map(s => ({ id: s.section.id, name: s.section.name, channelCount: s.channels.length, rawChannels: (channelsBySection[s.section.id] || []).map(c => ({ id: c.id, name: c.name, permissions: c.permissions })) })),
        channels: channels.filter(c => c.serverId === currentServerId).map(c => ({ id: c.id, name: c.name, permissions: c.permissions }))
      });
    } catch (e) {}
  }

  return (
    <SurfaceProvider soft3DEnabled={soft3DEnabled}>
    <div className={`app-shell ${soft3DEnabled ? 'soft-3d' : 'soft-3d-off'}`}>
      <TitleBar />
      <div className="app">
      {serverError && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay, rgba(0,0,0,0.6))', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-panel, #0f1720)', color: 'var(--text-primary)', padding: 24, borderRadius: 8, width: 560, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            <h2 style={{ marginTop: 0 }}>Cannot reach server</h2>
            <p style={{ marginBottom: 16 }}>{serverError}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => { setServerError(null); setActiveView('home'); setCurrentServerId('home'); }}>Back to Home</Button>
            </div>
          </div>
        </div>
      )}
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
                        {canManageServer && (
                          <button onClick={() => { openServerSettings(); closeServerMenu(); }}>
                            <i className="fas fa-sliders-h"></i> Server settings
                          </button>
                        )}
                        <button onClick={() => { openServerProfile(); closeServerMenu(); }}>
                          <i className="fas fa-id-badge"></i> Server profile
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
                {visibleSections.map(section => {
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
                                {/* message-count intentionally removed */}
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
                            {/* message-count intentionally removed */}
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
                onDeleteRole={deleteServerRole}
                onUpdateServerIcon={handleUpdateServerIcon}
                ownerUsername={settingsServer ? (serverInfoCache.get(settingsServer.url)?.ownerUsername ?? null) : null}
                currentUsername={user?.username ?? user?.name}
                onClaimOwner={claimOwner}
              />
            ) : isServerProfileView && settingsServer ? (
              <ServerUserSettingsPage
                server={settingsServer}
                currentUsername={user?.username ?? user?.name}
                onBack={closeServerSettings}
                onNicknameSaved={(nick) => {
                  setCurrentUserNicknames(prev => {
                    const next = new Map(prev);
                    if (nick) next.set(settingsServer.id, nick);
                    else next.delete(settingsServer.id);
                    return next;
                  });
                }}
              />
            ) : isChannelSettingsView && channelSettingsChannel ? (
              <ChannelSettingsPage
                channel={channelSettingsChannel}
                sections={channelSettingsSections}
                roles={serverRoles}
                rolesLoading={serverRolesLoading}
                onBack={closeChannelSettings}
                onRename={renameChannel}
                onMoveTo={moveChannelToSection}
                onSaveSettings={updateChannelSettings}
                onSavePermissions={saveChannelPermissions}
                onRequestRoles={() => fetchRolesForServer(channelSettingsChannel.serverId)}
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
                messageListRef={messageListRef}
                channelsLoading={channelsLoading}
                canSend={currentChannel ? (canUserWriteChannel(currentChannel) && !nsfwModalVisible) : false}
                cooldownExpiry={cooldowns[currentChannelId] || 0}
                onOpenPinnedMessages={(anchor) => openPinnedPanel(anchor)}
              />
            )}
          </div>
        </div>

        {/* Top-level NSFW splash so it appears immediately on channel click and
            does not re-mount when messages update (avoids visual glitches). */}
        <NsfwSplash
          channelName={channels.find(c => c.id === nsfwModalChannelId)?.name ?? 'Channel'}
          visible={nsfwModalVisible}
          onCancel={() => {
            setNsfwModalVisible(false);
            setNsfwModalChannelId(null);
            try {
              const el = document.querySelector('.main-content');
              if (el) el.classList.remove('nsfw-blur-active');
            } catch (e) { /* ignore */ }
            if (prevChannelId) setCurrentChannelId(prevChannelId);
            setPrevChannelId(null);
          }}
          onConfirm={() => {
            if (!nsfwModalChannelId) return;
            const next = new Set(nsfwAcknowledged);
            next.add(nsfwModalChannelId);
            setNsfwAcknowledged(next);
            persistNsfwAcks(next, user?.username ?? user?.name ?? 'anonymous');
            try {
              const el = document.querySelector('.main-content');
              if (el) el.classList.remove('nsfw-blur-active');
            } catch (e) { /* ignore */ }
            if (socketRef.current) {
              socketRef.current.emit('join_channel', { channelId: nsfwModalChannelId, nsfwAck: true });
            }
            setCurrentChannelId(nsfwModalChannelId);
            setNsfwModalVisible(false);
            setNsfwModalChannelId(null);
            setPrevChannelId(null);
          }}
        />

        {/* Pinned messages popover (only when current channel allows pinning) */}
        {showPinnedPanel && currentChannelId && currentChannel && (currentChannel.settings?.allowPinning ?? true) && (
          <PinnedMessagesPanel
            anchorRect={pinnedPanelAnchor}
            onClose={closePinnedPanel}
            pinnedMessages={(messages.get(currentChannelId) || []).filter(m => m.pinned)}
            onJumpToMessage={(id: string) => {
              // jump to message in the list
              const el = document.querySelector('.message-list') as HTMLElement | null;
              const target = el ? el.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null : document.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // highlight briefly
                target.classList.add('message-jump-highlight');
                setTimeout(() => target.classList.remove('message-jump-highlight'), 1600);
              }
            }}
            onUnpin={(id: string) => { togglePinMessage(id); }}
          />
        )}

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