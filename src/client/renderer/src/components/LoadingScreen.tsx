import React from 'react';
import '../styles/LoadingScreen.scss';

interface LoadingScreenProps {
  type?: 'initial' | 'server-switch';
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ type = 'initial' }) => {
  const message = type === 'initial' ? 'Loading...' : 'Switching server...';

  return (
    <div className={`loading-screen ${type === 'server-switch' ? 'server-switch' : ''}`}>
      {type === 'initial' && <div className="drag-zone" aria-hidden="true" />}
      <div className="loading-content">
        <div className="spinner" aria-hidden="true" />
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;