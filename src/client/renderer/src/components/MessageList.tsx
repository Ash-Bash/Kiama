import React from 'react';
import '../styles/components/MessageList.scss';

interface Message {
  user: string;
  content: string;
  timestamp: Date;
  embeds?: any[];
}

interface MessageListProps {
  messages: Message[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <div className="message-list">
      {messages.map((msg, i) => (
        <div key={i} className="message">
          <span className="username" style={{ marginBottom: '8px' }}>
            {msg.user}:
          </span>
          <span dangerouslySetInnerHTML={{ __html: msg.content }} />
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