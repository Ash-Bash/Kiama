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
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getSafeContent = (msg: Message) =>
  msg.renderedContent ? msg.renderedContent : escapeHtml(msg.content).replace(/\n/g, '<br>');

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <div className="message-list">
      {messages.map((msg, i) => (
        <div key={i} className="message">
          <span className="username" style={{ marginBottom: '8px' }}>
            {msg.user}:
          </span>
          <span dangerouslySetInnerHTML={{ __html: getSafeContent(msg) }} />
          {msg.embeds && msg.embeds.map((embed, j) => {
            const Component = embed.component;
            return <Component key={j} url={embed.url} />;
          })}
        </div>
      ))}
    </div>
  );
};

export default MessageList;