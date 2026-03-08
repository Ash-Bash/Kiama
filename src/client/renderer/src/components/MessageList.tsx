import React from 'react';
import '../styles/components/MessageList.scss';

interface Message {
  user: string;
  content: string;
  timestamp: Date;
  embeds?: any[];
  renderedContent?: string;
}

interface MessageListProps {
  messages: Message[];
  // Optional helper to resolve a role name -> color (provided by App)
  getRoleColor?: (role?: string) => string | undefined;
  // Optional users metadata to allow resolving a user's role: { name, role }
  users?: Array<{ name: string; role?: string }>;
}

// Minimal sanitizer to ensure message content is safe to inject.
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Prefer plugin-rendered HTML, falling back to escaped text with line breaks.
const getSafeContent = (msg: Message) =>
  msg.renderedContent ? msg.renderedContent : escapeHtml(msg.content).replace(/\n/g, '<br>');

// Render a stream of messages with basic HTML sanitization.
const MessageList: React.FC<MessageListProps> = ({ messages, getRoleColor, users }) => {
  return (
    <div className="message-list">
      {messages.map((msg, i) => {
        const userMeta = users?.find(u => u.name === msg.user);
        const resolvedRole = (msg as any).userRole || userMeta?.role;
        const roleColor = getRoleColor ? getRoleColor(resolvedRole) : undefined;

        return (
          <div key={i} className="message">
            <span className="username" style={roleColor ? { color: roleColor } : undefined}>
              {msg.user}:
            </span>
            <span dangerouslySetInnerHTML={{ __html: getSafeContent(msg) }} />
            {msg.embeds && msg.embeds.map((embed, j) => {
              const Component = embed.component;
              return <Component key={j} url={embed.url} />;
            })}
          </div>
        );
      })}
    </div>
  );
};

export default MessageList;