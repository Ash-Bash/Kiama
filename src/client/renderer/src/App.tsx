import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import PluginManager from './utils/PluginManager';
import { TypedMessage, Channel, ChannelSection } from './types/plugin';
import { ModalProvider, useModal } from './components/Modal';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import LoadingScreen from './components/LoadingScreen';
import Login from './components/Login';
import EmotePicker from './components/EmotePicker';
import GifPicker from './components/GifPicker';
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

interface User {
  id: string;
  name: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  avatar?: string;
  role?: string;
}

function AppContent({ token, user, onLogout }: { token: string; user: any; onLogout: () => void }) {
  const { openModal, closeModal } = useModal();
  const { currentMode, setMode, availableThemes, currentThemeId, setThemeById } = useTheme();
  const socketRef = React.useRef<any>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map([
    ['general', [
      { id: '1', user: 'Alice', content: 'Welcome to the general channel!', type: 'text', timestamp: new Date(), serverId: 'home', channelId: 'general' },
      { id: '2', user: 'Bob', content: 'Hey everyone!', type: 'text', timestamp: new Date(), serverId: 'home', channelId: 'general' },
      { id: '3', user: 'You', content: 'Hello!', type: 'text', timestamp: new Date(), serverId: 'home', channelId: 'general' }
    ]],
    ['random', [
      { id: '4', user: 'Charlie', content: 'This is the random channel', type: 'text', timestamp: new Date(), serverId: 'home', channelId: 'random' }
    ]]
  ]));
  const [currentChannelId, setCurrentChannelId] = useState<string>('general');
  const [channels, setChannels] = useState<Channel[]>([
    { id: 'general', name: 'general', type: 'text', position: 0, serverId: 'home', sectionId: 'text-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'random', name: 'random', type: 'text', position: 1, serverId: 'home', sectionId: 'text-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'announcements', name: 'announcements', type: 'announcement', position: 2, serverId: 'home', sectionId: 'text-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'general-voice', name: 'General', type: 'voice', position: 0, serverId: 'home', sectionId: 'voice-channels', createdAt: new Date(), updatedAt: new Date() },
    { id: 'music', name: 'Music', type: 'voice', position: 1, serverId: 'home', sectionId: 'voice-channels', createdAt: new Date(), updatedAt: new Date() }
  ]);
  const [sections, setSections] = useState<ChannelSection[]>([
    { id: 'text-channels', name: 'TEXT CHANNELS', serverId: 'home', position: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: 'voice-channels', name: 'VOICE CHANNELS', serverId: 'home', position: 1, createdAt: new Date(), updatedAt: new Date() }
  ]);
  const [currentServer, setCurrentServer] = useState<string>(SERVER_ID);
  const [servers, setServers] = useState<Server[]>([
    { id: 'home', name: 'Home', url: SERVER_URL }
  ]);
  const [currentServerId, setCurrentServerId] = useState<string>('home');
  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'You', status: 'online' },
    { id: '2', name: 'Alice', status: 'online' },
    { id: '3', name: 'Bob', status: 'idle' },
    { id: '4', name: 'Charlie', status: 'dnd' },
    { id: '5', name: 'Diana', status: 'offline' }
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
  const [isSwitchingServer, setIsSwitchingServer] = useState(false);
  const [settingsThemeMode, setSettingsThemeMode] = useState<'light' | 'dark'>(currentMode);
  const [settingsSelectedTheme, setSettingsSelectedTheme] = useState<string>(currentThemeId);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1920);
  const [showMobileServerList, setShowMobileServerList] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileUserList, setShowMobileUserList] = useState(false);
  const [activeAddMenu, setActiveAddMenu] = useState<string | null>(null);

  // Sync settings with current values
  React.useEffect(() => {
    setSettingsThemeMode(currentMode);
    setSettingsSelectedTheme(currentThemeId);
  }, [currentMode, currentThemeId]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Generate server initials like Discord (first letters of words, max 2 chars)
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

    // Load channels and sections will be called when socket connects
    // loadChannelsAndSections();

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
      // Apply plugin handlers based on message type
      const plugin = pluginManager.getEnabledPluginForMessage(msg);
      if (plugin) {
        // Plugin can modify the message
        console.log(`Processing message with plugin: ${plugin.name}`);
      }

      // Add message to the appropriate channel
      setMessages(prev => {
        const newMessages = new Map(prev);
        const channelMessages = newMessages.get(msg.channelId) || [];
        channelMessages.push(msg);
        newMessages.set(msg.channelId, channelMessages);
        return newMessages;
      });
    });

    socketRef.current.on('channel_history', (data: { channelId: string, messages: Message[] }) => {
      setMessages(prev => {
        const newMessages = new Map(prev);
        newMessages.set(data.channelId, data.messages);
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

  const loadChannelsAndSections = () => {
    if (socketRef.current) {
      socketRef.current.emit('get_channels');
    }
  };

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

  const switchServer = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || serverId === currentServerId) return;

    // Set loading state
    setIsSwitchingServer(true);

    // Disconnect from current server
    socket.disconnect();

    // Connect to new server
    const newSocket = io(server.url);
    // In a real implementation, you'd need to update the socket variable
    // For now, we'll just update the state
    setCurrentServerId(serverId);
    setCurrentServer(server.id === 'home' ? SERVER_ID : server.id);
    setCurrentChannelId('general'); // Reset to general channel

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

  // Resize handlers
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    setIsResizingSidebar(true);
    e.preventDefault();
  };

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

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const toggleUserList = () => {
    setUserListCollapsed(!userListCollapsed);
  };

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

  const sendPollMessage = () => {
    const pollData = {
      question: message,
      options: ['Option 1', 'Option 2', 'Option 3']
    };
    sendMessage('poll', pollData);
    setShowMessageOptions(false);
  };

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

  const openEmojiPicker = () => {
    setShowGifPicker(false);
    setShowMessageOptions(false);
    setShowEmotePicker(prev => !prev);
  };

  const openGifPicker = () => {
    setShowEmotePicker(false);
    setShowMessageOptions(false);
    setShowGifPicker(prev => !prev);
  };

  const handleEmoteSelect = (emote: { name: string; unicode?: string }) => {
    const insert = emote.unicode || `:${emote.name}:`;
    setMessage(prev => prev + insert);
    setShowEmotePicker(false);
  };

  const handleGifSelect = (gif: { url: string; title: string }) => {
    sendMessage('gif', { url: gif.url, title: gif.title });
    setShowGifPicker(false);
  };

  const openAccountSettings = () => {
    setSettingsThemeMode(currentMode); // Reset to current
    setSettingsSelectedTheme(currentThemeId); // Reset to current
    openModal(
      <div className="account-settings-modal">
        <h2>Account Settings</h2>
        <div className="settings-section">
          <h3>User Profile</h3>
          <div className="setting-item">
            <label>Display Name</label>
            <input type="text" defaultValue="You" />
          </div>
          <div className="setting-item">
            <label>Status</label>
            <select defaultValue="online">
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>
        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="setting-item">
            <label>Theme</label>
            <select value={settingsSelectedTheme} onChange={(e) => setSettingsSelectedTheme(e.target.value)}>
              {availableThemes.map(theme => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
              ))}
            </select>
          </div>
          <div className="setting-item">
            <label>Mode</label>
            <select value={settingsThemeMode} onChange={(e) => setSettingsThemeMode(e.target.value as 'light' | 'dark')}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={closeModal} className="cancel-btn">Cancel</button>
          <button onClick={() => {
            setMode(settingsThemeMode);
            setThemeById(settingsSelectedTheme);
            closeModal();
            alert('Settings saved!');
          }} className="save-btn">Save Changes</button>
          <button onClick={() => { closeModal(); onLogout(); }} className="signout-btn">Sign Out</button>
        </div>
      </div>
    );
  };

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
            <select id="channel-type" name="type" defaultValue="text">
              <option value="text">Text Channel</option>
              <option value="voice">Voice Channel</option>
              <option value="announcement">Announcement Channel</option>
            </select>
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

  const renderMessage = (msg: Message) => {
    // Check if there's a custom component for this message type
    const MessageComponent = pluginManager.getMessageTypeComponent(msg.type);

    if (MessageComponent) {
      // Check if the plugin for this message type is enabled
      const plugin = pluginManager.getEnabledPluginForMessage(msg);
      if (!plugin) {
        // Plugin is disabled, render as plain text
        return (
          <div key={msg.id} className="message">
            <span className="username">{msg.user}:</span>
            <span className="content">{msg.content}</span>
            <span className="message-type">[{msg.type} - disabled]</span>
          </div>
        );
      }

      // If the component returns a JSX-like structure, render it
      try {
        const componentResult = (MessageComponent as any)({ message: msg });
        if (componentResult && componentResult.type) {
          return renderJSXLike(componentResult, msg.id);
        }
      } catch (error) {
        console.error('Error rendering plugin component:', error);
      }

      // Otherwise, assume it's a React component
      const Component = MessageComponent as React.ComponentType<{ message: Message; key?: string }>;
      return React.createElement(Component, { key: msg.id, message: msg });
    }

    // Default rendering
    return (
      <div 
        key={msg.id} 
        className="message"
        onContextMenu={(e) => {
          // Only show context menu for user's own messages
          if (msg.user === 'You') {
            e.preventDefault();
            const deleteOption = confirm('Delete this message?');
            if (deleteOption) {
              deleteMessage(msg.id);
            }
          }
        }}
      >
        <span className="username">{msg.user}:</span>
        <span className="content">{msg.content}</span>
        {msg.type !== 'text' && <span className="message-type">[{msg.type}]</span>}
        {msg.embeds && msg.embeds.map((embed, j) => {
          const Component = embed.component;
          return <Component key={j} {...embed} />;
        })}
      </div>
    );
  };

  // Helper function to render JSX-like structures
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

  const isMobile = viewportWidth <= 768;
  const showMobileNavButtons = viewportWidth <= 1100;
  const showServerListPanel = !isMobile || showMobileServerList;
  const showSidebarPanel = (!sidebarCollapsed && !isMobile) || (isMobile && showMobileSidebar);
  const showUserListPanel = (!userListCollapsed && !isMobile) || (isMobile && showMobileUserList);

  const closeMobileDrawers = () => {
    setShowMobileServerList(false);
    setShowMobileSidebar(false);
    setShowMobileUserList(false);
  };

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
  const currentChannel = channels.find(c => c.id === currentChannelId && c.serverId === currentServerId);
  const currentMessages = messages.get(currentChannelId) || [];

  // Group channels by section
  const channelsBySection = sections.reduce((acc, section) => {
    acc[section.id] = channels.filter(c => c.sectionId === section.id && c.serverId === currentServerId);
    return acc;
  }, {} as Record<string, Channel[]>);

  const unsectionedChannels = channels.filter(c => !c.sectionId);

  return (
    <div className="app">
      {isMobile && (showMobileServerList || showMobileSidebar || showMobileUserList) && (
        <div className="mobile-backdrop" onClick={closeMobileDrawers} />
      )}

      {showServerListPanel && (
        <div className={`server-list ${isMobile ? 'mobile-drawer' : ''} ${showMobileServerList ? 'mobile-open' : ''}`}>
          <div className="server-items">
            {servers.map(server => (
              <div
                key={server.id}
                className={`server-item ${server.id === currentServerId ? 'active' : ''} ${server.id === 'home' ? 'home' : ''}`}
                onClick={() => switchServer(server.id)}
                title={server.name}
              >
                {server.id !== 'home' && (
                  <span className="server-name">{server.name}</span>
                )}
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
              <h2>{currentServerName}</h2>
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

      {!isMobile && sidebarCollapsed && (
        <div className="sidebar-collapsed">
          <button className="expand-btn" onClick={toggleSidebar} title="Expand Sidebar">
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}

      <div className="main-content">
        {isSwitchingServer && (
          <LoadingScreen type="server-switch" />
        )}
          <div className="channel-header">
            {showMobileNavButtons && (
              <div className="mobile-nav">
            <button
              className="mobile-nav-btn"
              onClick={toggleMobileNavPanels}
              aria-label="Open server and channel list"
            >
              <i className="fas fa-bars"></i>
            </button>
              </div>
            )}
          <h3>
            {currentChannel && (
              <>
                <span className="channel-icon">
                  {currentChannel.type === 'text' && '#'}
                  {currentChannel.type === 'voice' && '🔊'}
                  {currentChannel.type === 'announcement' && '📢'}
                </span>
                {currentChannel.name}
              </>
            )}
          </h3>
            {showMobileNavButtons && (
              <div className="mobile-nav right">
                <button
                  className="mobile-nav-btn"
                  onClick={toggleMobileMembers}
                  aria-label="Open member list"
                >
                  <i className="fas fa-users"></i>
                </button>
              </div>
            )}
        </div>

        <div className="message-list">
          {currentMessages.map(renderMessage)}
        </div>

        <div className="message-input">
          <div className="message-input-container">
            <button 
              className="message-options-btn"
              onClick={() => {
                setShowMessageOptions(!showMessageOptions);
                setShowEmotePicker(false);
                setShowGifPicker(false);
              }}
              title="Message Options"
            >
              <i className="fas fa-plus"></i>
            </button>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={`Message #${currentChannel?.name || 'general'}`}
            />
            <div className="message-function-tray">
              <button className="tray-btn emote-btn" onClick={openEmojiPicker} title="Add Emoji">
                <i className="far fa-smile"></i>
              </button>
              <button className="tray-btn gif-btn" onClick={openGifPicker} title="Add GIF">
                <i className="fas fa-film"></i>
              </button>
            </div>
            <button className="send-btn" onClick={() => sendMessage()} title="Send Message">
              <i className="fas fa-paper-plane"></i>
            </button>
          </div>
          
          {showEmotePicker && (
            <EmotePicker
              onSelect={handleEmoteSelect}
              onClose={() => setShowEmotePicker(false)}
              servers={servers}
            />
          )}

          {showGifPicker && (
            <GifPicker
              onSelect={handleGifSelect}
              onClose={() => setShowGifPicker(false)}
            />
          )}

          {showMessageOptions && (
            <div className="message-options-menu">
              <button onClick={handleImageUpload} title="Upload Image">
                <i className="fas fa-image"></i> Upload Image
              </button>
              <button onClick={handleFileUpload} title="Attach File">
                <i className="fas fa-paperclip"></i> Attach File
              </button>
              <button onClick={sendPollMessage} title="Create Poll">
                <i className="fas fa-chart-bar"></i> Create Poll
              </button>
            </div>
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
              <h3>Online — {users.filter(u => u.status !== 'offline').length}</h3>
              {!isMobile && (
                <button className="collapse-btn" onClick={toggleUserList} title="Collapse User List">
                  <i className="fas fa-chevron-right"></i>
                </button>
              )}
            </div>
            <div className="user-list-content">
              {users
                .sort((a, b) => {
                  // Sort by status: online, idle, dnd, offline
                  const statusOrder = { online: 0, idle: 1, dnd: 2, offline: 3 };
                  return statusOrder[a.status] - statusOrder[b.status];
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
                    <span className="user-name">{user.name}</span>
                    {user.role && <span className="user-role">{user.role}</span>}
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {!isMobile && userListCollapsed && (
        <div className="user-list-collapsed">
          <button className="expand-btn" onClick={toggleUserList} title="Expand User List">
            <i className="fas fa-chevron-left"></i>
          </button>
        </div>
      )}
    </div>
  );
}

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