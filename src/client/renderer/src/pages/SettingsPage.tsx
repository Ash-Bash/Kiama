import React, { useState, useEffect } from 'react';
import Page from '../components/Page';
import Toggle from '../components/Toggle';
import Button from '../components/Button';
import Select from '../components/Select';

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
                <Button variant="primary" onClick={onSave} iconLeft={<i className="fas fa-save"></i>}>
                  Save changes
                </Button>
                <Button variant="ghost" onClick={onLogout} iconLeft={<i className="fas fa-sign-out-alt"></i>}>
                  Log out
                </Button>
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
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="online">Online</option>
                <option value="idle">Idle</option>
                <option value="dnd">Do Not Disturb</option>
                <option value="offline">Offline</option>
              </Select>
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
              <Select value={themeId} onChange={(e) => onThemeChange(e.target.value)}>
                {availableThemes.map(theme => (
                  <option key={theme.id} value={theme.id}>{theme.name}</option>
                ))}
              </Select>
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
            <Toggle
              className="field"
              label="Modern surfaces"
              description="Enable the soft 3D styling for inputs, panels, and cards."
              checked={soft3DEnabled}
              onChange={onToggleSoft3D}
            />
            <label className="field">
              <span>App font</span>
              <Select value={fontId} onChange={(e) => onFontChange(e.target.value)}>
                {availableFonts.map(font => (
                  <option key={font.id} value={font.id}>{font.label}</option>
                ))}
              </Select>
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
