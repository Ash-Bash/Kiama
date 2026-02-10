import React from 'react';
import '../styles/components/ServerList.scss';

interface Server {
  id: string;
  name: string;
}

interface ServerListProps {
  servers: Server[];
  currentServer: string;
  onServerChange: (id: string) => void;
}

const ServerList: React.FC<ServerListProps> = ({ servers, currentServer, onServerChange }) => {
  return (
    <div className="server-list">
      {servers.map(server => (
        <div
          key={server.id}
          className={`server-item ${currentServer === server.id ? 'active' : ''}`}
          onClick={() => onServerChange(server.id)}
        >
          {server.name[0]}
        </div>
      ))}
    </div>
  );
};

export default ServerList;