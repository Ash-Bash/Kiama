import React from 'react';

const LinkEmbed: React.FC<{ url: string }> = ({ url }) => {
  // Basic embed component - in real plugin, fetch metadata
  return (
    <div style={{ border: '1px solid #ccc', padding: '8px', margin: '4px 0' }}>
      <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    </div>
  );
};

export default LinkEmbed;