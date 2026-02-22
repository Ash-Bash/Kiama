import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import PluginManager from './utils/PluginManager';
import { TypedMessage, Channel, ChannelSection } from './types/plugin';
import { ModalProvider, useModal } from './components/Modal';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import LoadingScreen from './components/LoadingScreen';
import Login from './components/Login';
import TitleBar from './components/TitleBar';
import HomePage from './pages/HomePage';
import ServerPage from './pages/ServerPage';
import SettingsPage from './pages/SettingsPage';
import ServerSettingsPage from './pages/ServerSettingsPage';
import Select from './components/Select';
import './styles/App.scss';

const socket = io('http://localhost:3000');
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

type ActiveView = 'home' | 'server' | 'settings' | 'server-settings';

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
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map([
    ['test-general', [
      { id: 't1', user: 'Test Bot', content: 'Welcome to the Test Server!', type: 'text', timestamp: new Date(), serverId: 'test-server', channelId: 'test-general' },
      { id: 't2', user: 'You', content: 'This is where channel and user sidebars live.', type: 'text', timestamp: new Date(), serverId: 'test-server', channelId: 'test-general' }
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
  const [isSwitchingServer, setIsSwitchingServer] = useState(false);
  const [soft3DEnabled, setSoft3DEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('soft3d-enabled');
    if (stored === null) return true;
    return stored === 'true';
  });
  const [settingsThemeMode, setSettingsThemeMode] = useState<'light' | 'dark'>(currentMode);
  const [settingsSelectedTheme, setSettingsSelectedTheme] = useState<string>(currentThemeId);
  const [settingsFontId, setSettingsFontId] = useState<string>(currentFontId);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1920);
  const [showMobileServerList, setShowMobileServerList] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileUserList, setShowMobileUserList] = useState(false);
  const [activeAddMenu, setActiveAddMenu] = useState<string | null>(null);
  const [userSidebarTab, setUserSidebarTab] = useState<'members' | 'metrics'>('members');
  const [serverRoles, setServerRoles] = useState<Role[]>([]);
  const [serverSettingsChannelId, setServerSettingsChannelId] = useState<string>('');
  const [serverSettingsServerId, setServerSettingsServerId] = useState<string | null>(null);
  const [serverSettingsLoading, setServerSettingsLoading] = useState(false);
  const [serverPasswordRequired, setServerPasswordRequired] = useState<boolean | null>(null);

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

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
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
    });

    socketRef.current.on('message', (msg: Message) => {
      const processedMessage = pluginManager.processMessage(msg);

      // Add message to the appropriate channel
      setMessages(prev => {
        const newMessages = new Map(prev);
        const channelMessages = newMessages.get(processedMessage.channelId) || [];
        channelMessages.push(processedMessage);
        newMessages.set(processedMessage.channelId, channelMessages);
        return newMessages;
      });
    });

    socketRef.current.on('channel_history', (data: { channelId: string, messages: Message[] }) => {
      const processedMessages = data.messages.map(msg => pluginManager.processMessage(msg));

      setMessages(prev => {
        const newMessages = new Map(prev);
        newMessages.set(data.channelId, processedMessages);
        return newMessages;
      });
    });

    socketRef.current.on('channels_list', (data: { channels: Channel[], sections: ChannelSection[], serverId: string }) => {
      setChannels(data.channels);
      setSections(data.sections);
    });

    socketRef.current.on('channel_created', (channel: Channel) => {
      setChannels(prev => [...prev, channel]);
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
      setSections(prev => [...prev, section]);
    });

    socketRef.current.on('section_deleted', (data: { sectionId: string }) => {
      setSections(prev => prev.filter(s => s.id !== data.sectionId));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('message');
        socketRef.current.off('channel_history');
        socketRef.current.off('channels_list');
        socketRef.current.off('channel_created');
        socketRef.current.off('channel_deleted');
        socketRef.current.off('section_created');
        socketRef.current.off('section_deleted');
      }
    };
  }, [pluginManager, token]);

  // Ask the server for the latest channel + section list for the active server.
  const loadChannelsAndSections = () => {
    if (socketRef.current) {
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
        setServerRoles(data.roles || []);
      } else {
        setServerRoles([]);
      }
    } catch (error) {
      console.error('Failed to load roles', error);
      setServerRoles([]);
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

  const leaveServer = (serverId: string) => {
    setServers(prev => prev.filter(s => s.id !== serverId));

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
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    if (serverId === 'home') {
      setActiveView('home');
      setCurrentServerId('home');
      setCurrentServer(SERVER_ID);
      setIsSwitchingServer(false);

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

    // Set loading state
    setIsSwitchingServer(true);

    // Disconnect from current server
    socket.disconnect();

    // Connect to new server
    io(server.url);
    // In a real implementation, you'd need to update the socket variable
    // For now, we'll just update the state
    setCurrentServerId(serverId);
    setCurrentServer(server.id === 'home' ? SERVER_ID : server.id);
    setCurrentChannelId(nextChannelId || currentChannelId); // Reset to first channel for that server

    if (viewportWidth <= 768) {
      setShowMobileServerList(false);
      setShowMobileSidebar(false);
      setShowMobileUserList(false);
    }

    // Simulate loading delay, then hide loading
    setTimeout(() => {
      setIsSwitchingServer(false);
      // Reconnect socket (simplified - in real app you'd handle this better)
      // For demo purposes, we'll just hide the loading
    }, 1500); // Show loading for 1.5 seconds
  };

  // Quick-add a server by prompting for URL and name.
  const addServer = () => {
    const serverUrl = prompt('Enter server URL:');
    if (!serverUrl) return;

    const serverName = prompt('Enter server name:') || 'New Server';
    const newServer: Server = {
      id: `server-${Date.now()}`,
      name: serverName,
      url: serverUrl
    };

    setServers(prev => [...prev, newServer]);
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

    setServers(prev => [...prev, newServer]);
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
    const messageData: Partial<Message> = {
      user: 'You',
      content: message,
      type,
      data,
      serverId: currentServer,
      channelId: currentChannelId
    };

    if (socketRef.current) {
      socketRef.current.emit('message', messageData);
    }
    setMessage('');
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
  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        Array.from(files).forEach(file => {
          const reader = new FileReader();
          reader.onload = () => {
            sendMessage('file', {
              name: file.name,
              size: file.size,
              type: file.type,
              data: reader.result
            });
          };
          reader.readAsDataURL(file);
        });
      }
    };
    input.click();
    setShowMessageOptions(false);
  };

  // Upload a single image and send it as a message payload.
  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          sendMessage('image', {
            name: file.name,
            size: file.size,
            type: file.type,
            data: reader.result
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
    setShowMessageOptions(false);
  };

  // Toggle the emoji picker while hiding other trays.
  const openEmojiPicker = () => {
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

  // Render a modal that creates a channel scoped to an optional section.
  const openCreateChannelModal = (sectionId?: string) => {
    const modalContent = (
      <div className="create-channel-modal">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          const name = formData.get('name') as string;
          const type = formData.get('type') as 'text' | 'voice' | 'announcement';
          
          if (name.trim()) {
            await createChannel(name, type, sectionId);
            closeModal();
            loadChannelsAndSections(); // Refresh the list
          }
        }}>
          <div className="form-group">
            <label htmlFor="channel-name">Channel Name</label>
            <input
              type="text"
              id="channel-name"
              name="name"
              placeholder="new-channel"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="channel-type">Channel Type</label>
            <Select id="channel-type" name="type" defaultValue="text">
              <option value="text">Text Channel</option>
              <option value="voice">Voice Channel</option>
              <option value="announcement">Announcement Channel</option>
            </Select>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={closeModal}>Cancel</button>
            <button type="submit">Create Channel</button>
          </div>
        </form>
      </div>
    );
    
    openModal(modalContent, { title: 'Create Channel', size: 'small' });
  };

  // Render a modal that creates a new section for organizing channels.
  const openCreateSectionModal = () => {
    const modalContent = (
      <div className="create-section-modal">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          const name = formData.get('name') as string;
          
          if (name.trim()) {
            await createSection(name);
            closeModal();
            loadChannelsAndSections(); // Refresh the list
          }
        }}>
          <div className="form-group">
            <label htmlFor="section-name">Section Name</label>
            <input
              type="text"
              id="section-name"
              name="name"
              placeholder="New Section"
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={closeModal}>Cancel</button>
            <button type="submit">Create Section</button>
          </div>
        </form>
      </div>
    );
    
    openModal(modalContent, { title: 'Create Section', size: 'small' });
  };

  // Persist a new channel on the server and rely on socket events to refresh state.
  const createChannel = async (name: string, type: 'text' | 'voice' | 'announcement' = 'text', sectionId?: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, sectionId })
      });
      if (!response.ok) throw new Error('Failed to create channel');
    } catch (error) {
      console.error('Error creating channel:', error);
    }
  };

  // Persist a new section and refresh the sidebar listings.
  const createSection = async (name: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Failed to create section');
    } catch (error) {
      console.error('Error creating section:', error);
    }
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
  const renderMessage = (msg: Message) => {
    const processedMessage = pluginManager.processMessage(msg);

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

      // If the component returns a JSX-like structure, render it
      try {
        const componentResult = (MessageComponent as any)({ message: processedMessage });
        if (componentResult && componentResult.type) {
          return renderJSXLike(componentResult, processedMessage.id);
        }
      } catch (error) {
        console.error('Error rendering plugin component:', error);
      }

      // Otherwise, assume it's a React component
      const Component = MessageComponent as React.ComponentType<{ message: Message; key?: string }>;
      return React.createElement(Component, { key: processedMessage.id, message: processedMessage });
    }

    const safeContent = toSafeHtml(processedMessage);

    // Default rendering
    return (
      <div 
        key={processedMessage.id} 
        className="message"
        onContextMenu={(e) => {
          // Only show context menu for user's own messages
          if (processedMessage.user === 'You') {
            e.preventDefault();
            const deleteOption = confirm('Delete this message?');
            if (deleteOption) {
              deleteMessage(processedMessage.id);
            }
          }
        }}
      >
        <span className="username">{processedMessage.user}:</span>
        <span className="content" dangerouslySetInnerHTML={{ __html: safeContent }} />
        {processedMessage.type !== 'text' && <span className="message-type">[{processedMessage.type}]</span>}
        {processedMessage.embeds && processedMessage.embeds.map((embed, j) => {
          const Component = embed.component;
          return <Component key={j} {...embed} />;
        })}
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
  const showMobileNavButtons = viewportWidth <= 1100;
  const showServerListPanel = !isMobile || showMobileServerList;
  const showSidebarPanel = (isServerView || isServerSettingsView) && ((!sidebarCollapsed && !isMobile) || (isMobile && showMobileSidebar));
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
  const currentChannel = channels.find(c => c.id === currentChannelId && c.serverId === currentServerId);
  const currentMessages = messages.get(currentChannelId) || [];
  const currentChannelMedia = currentChannelId ? collectMediaItemsForChannel(currentChannelId).slice(0, 10) : [];

  // Group channels by section
  const channelsBySection = sections.reduce((acc, section) => {
    acc[section.id] = channels.filter(c => c.sectionId === section.id && c.serverId === currentServerId);
    return acc;
  }, {} as Record<string, Channel[]>);

  const unsectionedChannels = channels.filter(c => !c.sectionId);
  const channelMembers = users.filter(user => {
    if (!currentChannelId) return true;
    if (!user.accessibleChannels || user.accessibleChannels.length === 0) return true;
    return user.accessibleChannels.includes(currentChannelId);
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
                .filter(section => section.serverId === currentServerId)
                .sort((a, b) => a.position - b.position)
                .map(section => {
                  const sectionChannels = channelsBySection[section.id] || [];
                  return (
                    <div key={section.id} className="channel-section">
                      <div className="section-header">
                        <span className="section-name">{section.name}</span>
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
                                const name = prompt('Channel name:');
                                if (name) createChannel(name, 'text', section.id).then(() => loadChannelsAndSections());
                                setActiveAddMenu(null);
                              }}
                            >
                              Add Channel
                            </button>
                            <button
                              onClick={() => {
                                const name = prompt('Section name:');
                                if (name) createSection(name).then(() => loadChannelsAndSections());
                                setActiveAddMenu(null);
                              }}
                            >
                              Add Section
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="section-channels">
                        {sectionChannels
                          .sort((a, b) => a.position - b.position)
                          .map(channel => (
                            <div
                              key={channel.id}
                              className={`channel ${channel.id === currentChannelId ? 'active' : ''} ${channel.settings?.nsfw ? 'nsfw' : ''}`}
                              onClick={() => joinChannel(channel.id)}
                            >
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
                          className={`channel ${channel.id === currentChannelId ? 'active' : ''} ${channel.settings?.nsfw ? 'nsfw' : ''}`}
                          onClick={() => joinChannel(channel.id)}
                        >
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
            </div>
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

      <div className="main-content">
        {isSwitchingServer && isServerView && (
          <LoadingScreen type="server-switch" />
        )}
        {isSettingsView ? (
          <SettingsPage
            userName={user?.name}
            userStatus={user?.status}
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
          />
        )}
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
                            <div key={user.id} className={`user-item ${user.status}`}>
                              <div className="user-avatar">
                                {user.avatar ? (
                                  <img src={user.avatar} alt={user.name} />
                                ) : (
                                  <span>{user.name.charAt(0).toUpperCase()}</span>
                                )}
                                <div className={`user-status ${user.status}`}></div>
                              </div>
                              <div className="user-meta">
                                <span className="user-name">{user.name}</span>
                                {user.role && <span className="user-role">{user.role}</span>}
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

      {!isMobile && userListCollapsed && isServerView && (
        <div className="user-list-collapsed">
          <button className="expand-btn" onClick={toggleUserList} title="Expand User List">
            <i className="fas fa-chevron-left"></i>
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

// Top-level component that handles auth gating and theme/modal providers.
function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check for stored token and user
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }

    // Simulate app initialization time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2500); // Show loading screen for 2.5 seconds

    return () => clearTimeout(timer);
  }, []);

  const handleLogin = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  return (
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
  );
}

export default App;