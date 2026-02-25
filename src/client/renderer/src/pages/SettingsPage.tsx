import React, { useState, useEffect } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import Toggle from '../components/Toggle';
import Button from '../components/Button';
import Select from '../components/Select';
import TextField from '../components/TextField';
import SegmentedControl from '../components/SegmentedControl';

// Account settings sub-page IDs
type AccountTab = 'my-account' | 'appearance';

const NAV_SECTIONS: SettingsNavSection[] = [
  {
    label: 'User Settings',
    items: [
      { id: 'my-account', label: 'My Account',  icon: 'fas fa-user' },
      { id: 'appearance', label: 'Appearance',   icon: 'fas fa-paint-brush' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'logout', label: 'Log Out', icon: 'fas fa-sign-out-alt', danger: true },
    ],
  },
];

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle:   'Idle',
  dnd:    'Do Not Disturb',
  offline: 'Offline (Invisible)',
};

// ── MyAccount sub-page ────────────────────────────────────────────────────────

interface MyAccountSubPageProps {
  displayName: string;
  status: string;
  onDisplayNameChange: (v: string) => void;
  onStatusChange: (v: 'online' | 'idle' | 'dnd' | 'offline') => void;
  onSave: () => void;
}

const MyAccountSubPage: React.FC<MyAccountSubPageProps> = ({
  displayName, status, onDisplayNameChange, onStatusChange, onSave,
}) => (
  <div className="settings-sub-page">
    <div className="settings-sub-page__header">
      <h2>My Account</h2>
      <p>Update how you appear to other users in the app.</p>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Profile</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__field">
          <TextField
            label="Display name"
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div className="settings-sub-page__field">
          <label className="field">
            <span>Status</span>
            <Select
              value={status}
              onChange={(e) => onStatusChange(e.target.value as 'online' | 'idle' | 'dnd' | 'offline')}
            >
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="offline">Offline (Invisible)</option>
            </Select>
          </label>
        </div>
      </div>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Preview</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>{displayName || 'You'}</strong>
            <span>
              <span className={[
                'settings-sub-page__badge',
                status === 'online'  ? 'settings-sub-page__badge--success' :
                status === 'idle'    ? 'settings-sub-page__badge--warning' :
                status === 'dnd'     ? 'settings-sub-page__badge--danger'  : '',
              ].filter(Boolean).join(' ')}>
                {STATUS_LABELS[status]}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 10 }}>
      <Button variant="primary" onClick={onSave} iconLeft={<i className="fas fa-save" />}>
        Save changes
      </Button>
    </div>
  </div>
);

// ── Appearance sub-page ───────────────────────────────────────────────────────

interface AppearanceSubPageProps {
  themeId: string;
  mode: 'light' | 'dark';
  fontId: string;
  soft3DEnabled: boolean;
  availableThemes: { id: string; name: string }[];
  availableFonts: { id: string; label: string }[];
  onThemeChange: (v: string) => void;
  onModeChange: (v: 'light' | 'dark') => void;
  onFontChange: (v: string) => void;
  onToggleSoft3D: (v: boolean) => void;
  onSave: () => void;
}

const AppearanceSubPage: React.FC<AppearanceSubPageProps> = ({
  themeId, mode, fontId, soft3DEnabled,
  availableThemes, availableFonts,
  onThemeChange, onModeChange, onFontChange, onToggleSoft3D, onSave,
}) => (
  <div className="settings-sub-page">
    <div className="settings-sub-page__header">
      <h2>Appearance</h2>
      <p>Customise the look and feel of the app — changes apply instantly.</p>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Theme</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__field">
          <label className="field">
            <span>Colour theme</span>
            <Select value={themeId} onChange={(e) => onThemeChange(e.target.value)}>
              {availableThemes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="settings-sub-page__field">
          <label className="field">
            <span>Mode</span>
            <SegmentedControl
              value={mode}
              onChange={onModeChange}
              options={[
                { label: 'Light', value: 'light' },
                { label: 'Dark',  value: 'dark'  },
              ]}
            />
          </label>
        </div>
      </div>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Typography</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__field">
          <label className="field">
            <span>App font</span>
            <Select value={fontId} onChange={(e) => onFontChange(e.target.value)}>
              {availableFonts.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Advanced</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Modern surfaces</strong>
            <span>Enable soft 3D styling for inputs, panels, and cards.</span>
          </div>
          <div className="settings-sub-page__row-control">
            <Toggle checked={soft3DEnabled} onChange={onToggleSoft3D} inline />
          </div>
        </div>
      </div>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Live preview</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              Headline — {availableThemes.find(t => t.id === themeId)?.name ?? themeId}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Body text — balanced for chat and content lists
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="settings-sub-page__badge settings-sub-page__badge--success">Online</span>
              <span className="settings-sub-page__badge settings-sub-page__badge--warning">Idle</span>
              <span className="settings-sub-page__badge settings-sub-page__badge--danger">DND</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 10 }}>
      <Button variant="primary" onClick={onSave} iconLeft={<i className="fas fa-save" />}>
        Save changes
      </Button>
    </div>
  </div>
);

// ── Main props ────────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<AccountTab>('my-account');
  const [displayName, setDisplayName] = useState(userName || 'You');
  const [status, setStatus]           = useState<'online' | 'idle' | 'dnd' | 'offline'>(userStatus);

  useEffect(() => { setDisplayName(userName || 'You'); }, [userName]);
  useEffect(() => { setStatus(userStatus || 'online'); }, [userStatus]);

  const handleSelect = (id: string) => {
    if (id === 'logout') { onLogout(); return; }
    setActiveTab(id as AccountTab);
  };

  const identity = (
    <div className="settings-identity">
      <div className="settings-identity__avatar">
        {displayName.charAt(0)}
      </div>
      <div className="settings-identity__meta">
        <span className="settings-identity__name">{displayName}</span>
        <span className="settings-identity__tag">{STATUS_LABELS[status]}</span>
      </div>
    </div>
  );

  return (
    <SettingsLayout
      className="settings-page-layout"
      sections={NAV_SECTIONS}
      activeId={activeTab}
      onSelect={handleSelect}
      onClose={onLogout}
      closeLabel="Log Out"
      identity={identity}
    >
      {activeTab === 'my-account' && (
        <MyAccountSubPage
          displayName={displayName}
          status={status}
          onDisplayNameChange={setDisplayName}
          onStatusChange={setStatus}
          onSave={onSave}
        />
      )}
      {activeTab === 'appearance' && (
        <AppearanceSubPage
          themeId={themeId}
          mode={mode}
          fontId={fontId}
          soft3DEnabled={soft3DEnabled}
          availableThemes={availableThemes}
          availableFonts={availableFonts}
          onThemeChange={onThemeChange}
          onModeChange={onModeChange}
          onFontChange={onFontChange}
          onToggleSoft3D={onToggleSoft3D}
          onSave={onSave}
        />
      )}
    </SettingsLayout>
  );
};

export default SettingsPage;

