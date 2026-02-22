import React from 'react';
import '../styles/components/ServerList.scss';

interface Server {
  id: string;
  name: string;
  icon?: string; // Optional server image/icon
}

interface ServerListProps {
  servers: Server[];
  currentServer: string;
  onServerChange: (id: string) => void;
}

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

// Pill-style rail for switching between servers.
const ServerList: React.FC<ServerListProps> = ({ servers, currentServer, onServerChange }) => {
  return (
    <div className="server-list">
      {servers.map(server => {
        const displayText = generateServerInitials(server.name);

        return (
          <div
            key={server.id}
            className={`server-item ${currentServer === server.id ? 'active' : ''}`}
            onClick={() => onServerChange(server.id)}
            title={server.name} // Show full name on hover
          >
            {server.icon ? (
              <>
                <img
                  src={server.icon}
                  alt={server.name}
                  className="server-image"
                  onError={(e) => {
                    // Hide broken image and show initials instead
                    const img = e.currentTarget;
                    const initials = img.nextElementSibling as HTMLElement;
                    img.style.display = 'none';
                    if (initials) {
                      initials.classList.remove('hidden');
                    }
                  }}
                />
                <span className="server-initials hidden">
                  {displayText}
                </span>
              </>
            ) : (
              <span className="server-initials">
                {displayText}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ServerList;