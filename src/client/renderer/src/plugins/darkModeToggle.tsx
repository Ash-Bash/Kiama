import React, { useState, useEffect } from 'react';
import { ClientPlugin } from '../types/plugin';

const DarkModeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    // Check if user has a preference stored
    const stored = localStorage.getItem('kiama-theme');
    if (stored) return stored === 'dark';

    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('kiama-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <button
      className="dark-mode-toggle"
      onClick={() => setIsDark(!isDark)}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
};

const darkModePlugin: ClientPlugin = {
  name: 'Dark Mode Toggle',
  version: '1.0.0',
  init: (api) => {
    console.log('Dark Mode Toggle plugin initialized');

    // Add the dark mode toggle component to the UI
    api.addUIComponent(DarkModeToggle);

    // Add a message handler that could respond to theme commands
    api.addMessageHandler((message) => {
      if (message.content === '/theme') {
        message.content = '💡 Try the dark mode toggle in the top right!';
      }
      return message;
    });
  }
};

export default darkModePlugin;