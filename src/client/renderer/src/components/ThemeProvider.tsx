import React, { createContext, useContext, useState, useEffect } from 'react';
import { Theme } from '../types/theme';
import * as fs from 'fs';
import * as path from 'path';

interface ThemeInfo {
  id: string;
  name: string;
  theme: Theme;
}

const ThemeContext = createContext<{
  theme: Theme | null;
  currentMode: 'light' | 'dark';
  availableThemes: ThemeInfo[];
  currentThemeId: string;
  setMode: (mode: 'light' | 'dark') => void;
  setThemeById: (themeId: string) => void;
} | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme | null>(null);
  const [currentMode, setCurrentMode] = useState<'light' | 'dark'>('dark');
  const [availableThemes, setAvailableThemes] = useState<ThemeInfo[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string>('default');

  const setThemeById = (themeId: string) => {
    const themeInfo = availableThemes.find(t => t.id === themeId);
    if (themeInfo) {
      setCurrentThemeId(themeId);
      setThemeState(themeInfo.theme);
      applyTheme(themeInfo.theme, currentMode);
      localStorage.setItem('selectedTheme', themeId);
    }
  };

  const setMode = (mode: 'light' | 'dark') => {
    setCurrentMode(mode);
    if (theme) applyTheme(theme, mode);
    localStorage.setItem('themeMode', mode);
  };

  // Load all available themes
  useEffect(() => {
    const loadThemes = () => {
      try {
        const themesDir = path.join(process.cwd(), '../../dist/client/themes');
        console.log('Themes directory:', themesDir);

        if (!fs.existsSync(themesDir)) {
          console.error('Themes directory does not exist:', themesDir);
          return;
        }

        const files = fs.readdirSync(themesDir).filter(file =>
          file.endsWith('.json') && file !== 'default.json.backup'
        );

        console.log('Found theme files:', files);

        const themes: ThemeInfo[] = [];

        files.forEach(file => {
          try {
            const themePath = path.join(themesDir, file);
            const themeContent = fs.readFileSync(themePath, 'utf8');
            const themeData = JSON.parse(themeContent) as Theme;
            const themeId = file.replace('.json', '');

            themes.push({
              id: themeId,
              name: themeData.name || themeId,
              theme: themeData
            });
          } catch (error) {
            console.error(`Failed to load theme ${file}:`, error);
          }
        });

        setAvailableThemes(themes);

        // Load saved theme preference or default to 'default'
        const savedTheme = localStorage.getItem('selectedTheme') || 'default';
        const savedMode = (localStorage.getItem('themeMode') as 'light' | 'dark') || 'dark';

        setCurrentMode(savedMode);

        // Set the theme
        const themeToLoad = themes.find(t => t.id === savedTheme) || themes.find(t => t.id === 'default') || themes[0];
        if (themeToLoad) {
          setCurrentThemeId(themeToLoad.id);
          setThemeState(themeToLoad.theme);
          applyTheme(themeToLoad.theme, savedMode);
        }

      } catch (error) {
        console.error('Failed to load themes:', error);
      }
    };

    loadThemes();
  }, []);

  // Update theme when mode changes
  useEffect(() => {
    if (theme) {
      applyTheme(theme, currentMode);
    }
  }, [currentMode, theme]);

  return (
    <ThemeContext.Provider value={{
      theme,
      currentMode,
      availableThemes,
      currentThemeId,
      setMode,
      setThemeById
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

const applyTheme = (theme: Theme, mode: 'light' | 'dark') => {
  const root = document.documentElement;
  const colors = theme.modes[mode].colors;

  // Apply theme colors immediately
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  // Apply static layout variables
  root.style.setProperty('--sidebar-width', '240px');
  root.style.setProperty('--server-list-width', '72px');

  console.log('Applied theme colors:', colors);
};