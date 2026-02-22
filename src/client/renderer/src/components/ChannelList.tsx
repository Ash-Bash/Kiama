import React from 'react';
import '../styles/components/ChannelList.scss';

interface Channel {
  id: string;
  name: string;
}

interface ChannelListProps {
  channels: Channel[];
  currentChannel: string;
  onChannelChange: (id: string) => void;
}

// Simple sidebar list for switching between channels.
const ChannelList: React.FC<ChannelListProps> = ({ channels, currentChannel, onChannelChange }) => {
  return (
    <div className="channel-list">
      <h3>Channels</h3>
      {channels.map(channel => (
        <div
          key={channel.id}
          className={`channel-item ${currentChannel === channel.id ? 'active' : ''}`}
          onClick={() => onChannelChange(channel.id)}
          style={{ borderRadius: '4px' }}
        >
          # {channel.name}
        </div>
      ))}
    </div>
  );
};

export default ChannelList;