import React, { useState, useEffect } from 'react';
import Page from '../components/Page';

interface SettingsPageProps {
  userName?: string;
  userStatus?: 'online' | 'idle' | 'dnd' | 'offline';
  themeId: string;
  mode: 'light' | 'dark';
  fontId: string;
  availableThemes: { id: string; name: string }[];
  availableFonts: { id: string; label: string }[];
  soft3DEnabled: boolean;
  onThemeChange: (themeId: string) => void;
  onModeChange: (mode: 'light' | 'dark') => void;
  onFontChange: (fontId: string) => void;
  onToggleSoft3D: (enabled: boolean) => void;
  onSave: () => void;
  onLogout: () => void;
}

// Full-page settings experience that mirrors other app pages.
const SettingsPage: React.FC<SettingsPageProps> = ({
  userName,
  userStatus = 'online',
  themeId,
  mode,
  fontId,
  availableThemes,
  availableFonts,
  soft3DEnabled,
  onThemeChange,
  onModeChange,
  onFontChange,
  onToggleSoft3D,
  onSave,
  onLogout,
}) => {
  const [displayName, setDisplayName] = useState(userName || 'You');
  const [status, setStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(userStatus);

  useEffect(() => {
    setDisplayName(userName || 'You');
    setStatus(userStatus || 'online');
  }, [userName, userStatus]);

  return (
    <Page
      className="settings-page"
      padded
      scroll
      header={(
        <div className="settings-header">
          <div className="hero">
            <div className="hero-meta">
              <div className="pill">Live preview</div>
              <h1>Account & Appearance</h1>
              <p>Tune your profile, typography, and theme — changes apply instantly.</p>
              <div className="hero-actions">
                <button className="primary" onClick={onSave}>
                  <i className="fas fa-save"></i>
                  Save changes
                </button>
                <button className="ghost" onClick={onLogout}>
                  <i className="fas fa-sign-out-alt"></i>
                  Sign out
                </button>
              </div>
            </div>
            <div className="hero-visual">
              <div className="glass">
                <div className="chip">Typography</div>
                <div className="chip">Theme</div>
                <div className="chip">Status</div>
              </div>
            </div>
          </div>
        </div>
      )}
    >
      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Profile</p>
              <h3>Your details</h3>
              <p className="hint">Update how you show up to others.</p>
            </div>
          </div>
          <div className="card-body">
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="online">Online</option>
                <option value="idle">Idle</option>
                <option value="dnd">Do Not Disturb</option>
                <option value="offline">Offline</option>
              </select>
            </label>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Appearance</p>
              <h3>Look & feel</h3>
              <p className="hint">Pick your theme, mode, and typography.</p>
            </div>
          </div>
          <div className="card-body">
            <label className="field">
              <span>Theme</span>
              <select value={themeId} onChange={(e) => onThemeChange(e.target.value)}>
                {availableThemes.map(theme => (
                  <option key={theme.id} value={theme.id}>{theme.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mode</span>
              <div className="segmented">
                <button
                  className={mode === 'light' ? 'active' : ''}
                  onClick={() => onModeChange('light')}
                  type="button"
                >
                  Light
                </button>
                <button
                  className={mode === 'dark' ? 'active' : ''}
                  onClick={() => onModeChange('dark')}
                  type="button"
                >
                  Dark
                </button>
              </div>
            </label>
            <div className="field toggle-row">
              <div className="toggle-copy">
                <span>Modern surfaces</span>
                <p className="hint">Enable the soft 3D styling for inputs, panels, and cards.</p>
              </div>
              <button
                type="button"
                className={`ios-toggle ${soft3DEnabled ? 'on' : 'off'}`}
                role="switch"
                aria-checked={soft3DEnabled}
                onClick={() => onToggleSoft3D(!soft3DEnabled)}
              >
                <span className="thumb" />
              </button>
            </div>
            <label className="field">
              <span>App font</span>
              <select value={fontId} onChange={(e) => onFontChange(e.target.value)}>
                {availableFonts.map(font => (
                  <option key={font.id} value={font.id}>{font.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="settings-card span-2">
          <div className="card-header">
            <div>
              <p className="eyebrow">Live preview</p>
              <h3>What you’ll see</h3>
              <p className="hint">Your selections are reflected immediately across the app.</p>
            </div>
          </div>
          <div className="card-body preview">
            <div className="preview-pane">
              <div className="preview-title">Typography & Color</div>
              <div className="preview-row">
                <div className="dot" />
                <span>Headline — Modern, crisp type for titles</span>
              </div>
              <div className="preview-row subtle">
                <div className="dot" />
                <span>Body — Balanced for chat and lists</span>
              </div>
              <div className="preview-pills">
                <span className="pill">Light</span>
                <span className="pill">Dark</span>
                <span className="pill">Custom themes</span>
              </div>
            </div>
            <div className="preview-pane secondary">
              <div className="preview-title">Status</div>
              <div className="status-badges">
                <span className="status online">Online</span>
                <span className="status idle">Idle</span>
                <span className="status dnd">DND</span>
                <span className="status offline">Offline</span>
              </div>
              <p className="hint">Pick the presence that matches your flow.</p>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
};

export default SettingsPage;
