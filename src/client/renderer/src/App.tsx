import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import PluginManager from './utils/PluginManager';
import { TypedMessage, Channel, ChannelSection } from './types/plugin';
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

function App() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map());
  const [currentChannelId, setCurrentChannelId] = useState<string>('general');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sections, setSections] = useState<ChannelSection[]>([]);
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
  const [pluginManager] = useState(() => new PluginManager({
    addMessageHandler: (handler) => {
      // Store handlers
    },
    addUIComponent: (component) => {
      // Add to UI
    },
    getSocket: () => socket,
    registerMessageType: (type: string, component: React.ComponentType) => {
      pluginManager.registerMessageTypeComponent(type, component);
    }
  }));

  useEffect(() => {
    pluginManager.loadPlugins();

    // Discover and install server plugins
    pluginManager.discoverServerPlugins(SERVER_URL, currentServer);

    // Load channels and sections
    loadChannelsAndSections();

    // Join default channel
    socket.emit('join_channel', { channelId: 'general' });
  }, [pluginManager, currentServer]);

  useEffect(() => {
    socket.on('message', (msg: Message) => {
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

    socket.on('channel_history', (data: { channelId: string, messages: Message[] }) => {
      setMessages(prev => {
        const newMessages = new Map(prev);
        newMessages.set(data.channelId, data.messages);
        return newMessages;
      });
    });

    socket.on('channels_list', (data: { channels: Channel[], sections: ChannelSection[], serverId: string }) => {
      setChannels(data.channels);
      setSections(data.sections);
    });

    socket.on('channel_created', (channel: Channel) => {
      setChannels(prev => [...prev, channel]);
    });

    socket.on('channel_deleted', (data: { channelId: string }) => {
      setChannels(prev => prev.filter(c => c.id !== data.channelId));
      setMessages(prev => {
        const newMessages = new Map(prev);
        newMessages.delete(data.channelId);
        return newMessages;
      });
    });

    socket.on('section_created', (section: ChannelSection) => {
      setSections(prev => [...prev, section]);
    });

    socket.on('section_deleted', (data: { sectionId: string }) => {
      setSections(prev => prev.filter(s => s.id !== data.sectionId));
    });

    return () => {
      socket.off('message');
      socket.off('channel_history');
      socket.off('channels_list');
      socket.off('channel_created');
      socket.off('channel_deleted');
      socket.off('section_created');
      socket.off('section_deleted');
    };
  }, [pluginManager]);

  const loadChannelsAndSections = () => {
    socket.emit('get_channels');
  };

  const joinChannel = (channelId: string) => {
    // Leave current channel
    socket.emit('leave_channel', { channelId: currentChannelId });

    // Join new channel
    socket.emit('join_channel', { channelId });
    setCurrentChannelId(channelId);
  };

  const switchServer = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    // Disconnect from current server
    socket.disconnect();

    // Connect to new server
    const newSocket = io(server.url);
    // In a real implementation, you'd need to update the socket variable
    // For now, we'll just update the state
    setCurrentServerId(serverId);
    setCurrentServer(server.id === 'home' ? SERVER_ID : server.id);
    setCurrentChannelId('general'); // Reset to general channel

    // Reconnect socket (simplified - in real app you'd handle this better)
    setTimeout(() => {
      window.location.reload(); // Simple way to reconnect - in production use proper socket management
    }, 100);
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

    socket.emit('message', messageData);
    setMessage('');
  };

  const sendPollMessage = () => {
    const pollData = {
      question: message,
      options: ['Option 1', 'Option 2', 'Option 3']
    };
    sendMessage('poll', pollData);
  };

  const createChannel = async (name: string, type: 'text' | 'voice' | 'announcement' = 'text') => {
    try {
      const response = await fetch(`${SERVER_URL}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type })
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
      <div key={msg.id} className="message">
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

  const currentChannel = channels.find(c => c.id === currentChannelId);
  const currentMessages = messages.get(currentChannelId) || [];

  // Group channels by section
  const channelsBySection = sections.reduce((acc, section) => {
    acc[section.id] = channels.filter(c => c.sectionId === section.id);
    return acc;
  }, {} as Record<string, Channel[]>);

  const unsectionedChannels = channels.filter(c => !c.sectionId);

  return (
    <div className="app">
      <div className="server-list">
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
            ) : server.id !== 'home' ? (
              <span className="server-icon">{server.name.charAt(0).toUpperCase()}</span>
            ) : null}
          </div>
        ))}
        <div className="add-server" onClick={addServer} title="Add Server"></div>
      </div>

      {!sidebarCollapsed && (
        <>
          <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
            <div className="server-header">
              <h2>{currentServer}</h2>
              <button className="collapse-btn" onClick={toggleSidebar} title="Collapse Sidebar">‹</button>
            </div>

            <div className="channels-list">
              {sections
                .sort((a, b) => a.position - b.position)
                .map(section => (
                  <div key={section.id} className="channel-section">
                    <div className="section-header">
                      <span className="section-name">{section.name}</span>
                    </div>
                    <div className="section-channels">
                      {channelsBySection[section.id]
                        ?.sort((a, b) => a.position - b.position)
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
                ))}

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

            <div className="channel-actions">
              <button onClick={() => createChannel(prompt('Channel name:') || '')}>
                + Add Channel
              </button>
              <button onClick={() => createSection(prompt('Section name:') || '')}>
                + Add Section
              </button>
            </div>
          </div>
          <div
            className="resize-handle sidebar-resize"
            onMouseDown={handleSidebarResizeStart}
          />
        </>
      )}

      {sidebarCollapsed && (
        <div className="sidebar-collapsed">
          <button className="expand-btn" onClick={toggleSidebar} title="Expand Sidebar">›</button>
        </div>
      )}

      <div className="main-content">
        <div className="channel-header">
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
        </div>

        <div className="message-list">
          {currentMessages.map(renderMessage)}
        </div>

        <div className="message-input">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={`Message #${currentChannel?.name || 'general'}`}
          />
          <button onClick={() => sendMessage()}>Send Text</button>
          <button onClick={sendPollMessage}>Send Poll</button>
        </div>
      </div>

      {!userListCollapsed && (
        <>
          <div
            className="resize-handle userlist-resize"
            onMouseDown={handleUserListResizeStart}
          />
          <div className="user-list" style={{ width: `${userListWidth}px` }}>
            <div className="user-list-header">
              <h3>Online — {users.filter(u => u.status !== 'offline').length}</h3>
              <button className="collapse-btn" onClick={toggleUserList} title="Collapse User List">›</button>
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

      {userListCollapsed && (
        <div className="user-list-collapsed">
          <button className="expand-btn" onClick={toggleUserList} title="Expand User List">‹</button>
        </div>
      )}
    </div>
  );
}

export default App;