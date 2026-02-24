import React, { useEffect, useState } from 'react';
import '../styles/LoadingScreen.scss';

const loadingMessages = [
  'Loading...',
  'Connecting to servers...',
  'Loading plugins...',
  'Almost ready...'
];

interface LoadingScreenProps {
  type?: 'initial' | 'server-switch';
}

// Modern, simplified loading screen with clean design
const LoadingScreen: React.FC<LoadingScreenProps> = ({ type = 'initial' }) => {
  const [currentMessage, setCurrentMessage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % loadingMessages.length);
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  const title = type === 'initial' ? 'Starting Kiama' : 'Switching server';

  return (
    <div className={`loading-screen ${type === 'server-switch' ? 'server-switch' : ''}`}>
      {type === 'initial' && <div className="drag-zone" aria-hidden="true" />}
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner" aria-hidden="true" />
          <h1 className="loading-title">{title}</h1>
          <p className="loading-message">{loadingMessages[currentMessage]}</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;