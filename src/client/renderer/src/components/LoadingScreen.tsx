import React, { useState, useEffect } from 'react';
import '../styles/LoadingScreen.scss';

const initialLoadingMessages = [
  'Loading...',
  'Connecting to servers...',
  'Loading plugins...',
  'Almost ready...'
];

const serverSwitchMessages = [
  'Switching servers...',
  'Loading channels...',
  'Connecting...',
  'Almost there...'
];

interface LoadingScreenProps {
  type?: 'initial' | 'server-switch';
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ type = 'initial' }) => {
  const messages = type === 'initial' ? initialLoadingMessages : serverSwitchMessages;
  const [currentMessage, setCurrentMessage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % messages.length);
    }, 800); // Change message every 800ms

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className={`loading-screen ${type === 'server-switch' ? 'server-switch' : ''}`}>
      <div className="loading-content">
        {type === 'initial' && (
          <div className="loading-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h1>KIAMA</h1>
          </div>
        )}
        {type === 'server-switch' && (
          <div className="server-switch-icon">
            <div className="switch-spinner"></div>
          </div>
        )}
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
        <p className="loading-text">{messages[currentMessage]}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;