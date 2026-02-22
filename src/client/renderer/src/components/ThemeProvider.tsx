import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Theme } from '../types/theme';
import * as fs from 'fs';
import * as path from 'path';

interface ThemeInfo {
  id: string;
  name: string;
  theme: Theme;
}

interface FontOption {
  id: string;
  label: string;
  stack: string;
}

const FONT_OPTIONS: FontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    stack: "'Inter', 'SF Pro Text', 'Segoe UI', -apple-system, system-ui, sans-serif",
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    stack: "'Space Grotesk', 'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif",
  },
];

const ThemeContext = createContext<{
  theme: Theme | null;
  currentMode: 'light' | 'dark';
  availableThemes: ThemeInfo[];
  currentThemeId: string;
  setMode: (mode: 'light' | 'dark') => void;
  setThemeById: (themeId: string) => void;
  availableFonts: FontOption[];
  currentFontId: string;
  setFontById: (fontId: string) => void;
} | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

// Theme context provider that loads JSON themes from disk and applies CSS variables.
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme | null>(null);
  const [currentMode, setCurrentMode] = useState<'light' | 'dark'>('dark');
  const [availableThemes, setAvailableThemes] = useState<ThemeInfo[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string>('default');
  const availableFonts = useMemo(() => FONT_OPTIONS, []);
  const [currentFontId, setCurrentFontId] = useState<string>(FONT_OPTIONS[0].id);

  // Look up a theme by id, apply it, and persist preference.
  const setThemeById = (themeId: string) => {
    const themeInfo = availableThemes.find(t => t.id === themeId);
    if (themeInfo) {
      setCurrentThemeId(themeId);
      setThemeState(themeInfo.theme);
      applyTheme(themeInfo.theme, currentMode);
      localStorage.setItem('selectedTheme', themeId);
    }
  };

  // Update the CSS variable for typography and persist preference.
  const setFontById = (fontId: string) => {
    const fallbackFont = FONT_OPTIONS[0];
    const font = FONT_OPTIONS.find(f => f.id === fontId) || fallbackFont;
    setCurrentFontId(font.id);
    applyFont(font);
    localStorage.setItem('appFont', font.id);
  };

  // Flip between light/dark variants while keeping the current theme palette.
  const setMode = (mode: 'light' | 'dark') => {
    setCurrentMode(mode);
    if (theme) applyTheme(theme, mode);
    localStorage.setItem('themeMode', mode);
  };

  // Load all available themes
  useEffect(() => {
    // Discover theme JSON files from the build output and hydrate defaults.
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
        const savedFont = localStorage.getItem('appFont') || FONT_OPTIONS[0].id;
        const fontToLoad = FONT_OPTIONS.find(f => f.id === savedFont) || FONT_OPTIONS[0];

        setCurrentMode(savedMode);
        setCurrentFontId(fontToLoad.id);
        applyFont(fontToLoad);

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
      setThemeById,
      availableFonts,
      currentFontId,
      setFontById
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Push theme colors to CSS custom properties so SCSS variables pick them up.
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

// Push font stack to a CSS variable so all components can inherit it.
const applyFont = (font: FontOption) => {
  const root = document.documentElement;
  root.style.setProperty('--app-font', font.stack);
};