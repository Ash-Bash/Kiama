import React, { useState, useEffect } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import Toggle from '../components/Toggle';
import Button from '../components/Button';
import Select from '../components/Select';
import TextField from '../components/TextField';
import SegmentedControl from '../components/SegmentedControl';
import ModalPanel from '../components/ModalPanel';
import { sharedAccountManager as accountManager } from '../utils/sharedAccountManager';

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
  userAvatar?: string;
  onDisplayNameChange: (v: string) => void;
  onStatusChange: (v: 'online' | 'idle' | 'dnd' | 'offline') => void;
  onSave: () => void;
  onAvatarChange: (dataUri: string) => void;
  onChangePasswordClick: () => void;
  onDeleteAccountClick: () => void;
}

const MyAccountSubPage: React.FC<MyAccountSubPageProps> = ({
  displayName, status, userAvatar,
  onDisplayNameChange, onStatusChange, onSave,
  onAvatarChange, onChangePasswordClick, onDeleteAccountClick,
}) => (
  <div className="settings-sub-page">
    <div className="settings-sub-page__header">
      <h2>My Account</h2>
      <p>Update how you appear to other users in the app.</p>
    </div>

    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Profile</p>
      <div className="settings-sub-page__card">
        {/* ── Avatar row ──────────────────────────────────────────────── */}
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Profile picture</strong>
            <span>Your global avatar. Servers will see this unless you set a per-server override.</span>
          </div>
          <div className="settings-sub-page__row-control">
            <label className="settings-avatar-upload" title="Change profile picture">
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUri = ev.target?.result as string;
                    if (dataUri) onAvatarChange(dataUri);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              <div className="settings-avatar-large">
                {userAvatar
                  ? <img src={userAvatar} alt="Avatar" />
                  : displayName.charAt(0).toUpperCase() || '?'}
              </div>
              <span className="settings-avatar-hint">Change</span>
            </label>
          </div>
        </div>

        {/* ── Display name ───────────────────────────────────────────── */}
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

    {/* ── Security ──────────────────────────────────────────────────────── */}
    <div className="settings-sub-page__section" style={{ marginTop: 32 }}>
      <p className="settings-sub-page__section-title">Security</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Password</strong>
            <span>Change your account login password.</span>
          </div>
          <div className="settings-sub-page__row-control">
            <Button variant="ghost" onClick={onChangePasswordClick} iconLeft={<i className="fas fa-lock" />}>
              Change password
            </Button>
          </div>
        </div>
      </div>
    </div>

    {/* ── Danger Zone ───────────────────────────────────────────────────── */}
    <div className="settings-sub-page__section" style={{ marginTop: 32 }}>
      <p className="settings-sub-page__section-title" style={{ color: 'var(--error, #ed4245)' }}>Danger Zone</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Delete account</strong>
            <span>Permanently delete your local account and all its data. This cannot be undone.</span>
          </div>
          <div className="settings-sub-page__row-control">
            <Button variant="danger" onClick={onDeleteAccountClick}>
              Delete account
            </Button>
          </div>
        </div>
      </div>
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
  userAvatar?: string;
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
  onDeleteAccount?: (password: string) => Promise<{ success: boolean; error?: string }>;
  onChangePassword?: (currentPw: string, newPw: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateProfilePic?: (dataUri: string) => Promise<{ success: boolean; error?: string }>;
}

// ── Main component ────────────────────────────────────────────────────────────

const SettingsPage: React.FC<SettingsPageProps> = ({
  userName,
  userStatus = 'online',
  userAvatar,
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
  onDeleteAccount,
  onChangePassword,
  onUpdateProfilePic,
}) => {
  const [activeTab, setActiveTab] = useState<AccountTab>('my-account');
  const [displayName, setDisplayName] = useState(userName || 'You');
  const [status, setStatus]           = useState<'online' | 'idle' | 'dnd' | 'offline'>(userStatus);
  const [localAvatar, setLocalAvatar] = useState<string | undefined>(userAvatar);

  useEffect(() => { setDisplayName(userName || 'You'); }, [userName]);
  useEffect(() => { setStatus(userStatus || 'online'); }, [userStatus]);
  useEffect(() => { setLocalAvatar(userAvatar); }, [userAvatar]);

  // Auto-login preference
  const [autoLoginEnabled, setAutoLoginEnabled] = useState<boolean>(accountManager.isAutoLoginEnabled());
  useEffect(() => { setAutoLoginEnabled(accountManager.isAutoLoginEnabled()); }, []);

  // ── Delete-account state ───────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Change-password state ───────────────────────────────────────────────
  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [changePwCurrent, setChangePwCurrent]     = useState('');
  const [changePwNew,     setChangePwNew]         = useState('');
  const [changePwConfirm, setChangePwConfirm]     = useState('');
  const [showChangePwCurrent, setShowChangePwCurrent] = useState(false);
  const [showChangePwNew,     setShowChangePwNew]     = useState(false);
  const [changePwError,   setChangePwError]   = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwSuccess, setChangePwSuccess] = useState(false);

  const handleSelect = (id: string) => {
    if (id === 'logout') { onLogout(); return; }
    setActiveTab(id as AccountTab);
  };

  // ── Delete account handlers ─────────────────────────────────────────────
  const openDeleteModal  = () => { setShowDeleteModal(true); setDeletePw(''); setDeleteError(''); setShowDeletePw(false); };
  const closeDeleteModal = () => { setShowDeleteModal(false); setDeletePw(''); setDeleteError(''); };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onDeleteAccount) return;
    setDeleteError('');
    setDeleteLoading(true);
    try {
      const result = await onDeleteAccount(deletePw);
      if (!result.success) { setDeleteError(result.error ?? 'Wrong password.'); return; }
      closeDeleteModal();
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Failed to delete account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Change password handlers ────────────────────────────────────────────
  const openChangePwModal  = () => {
    setShowChangePwModal(true);
    setChangePwCurrent(''); setChangePwNew(''); setChangePwConfirm('');
    setChangePwError(''); setChangePwSuccess(false);
    setShowChangePwCurrent(false); setShowChangePwNew(false);
  };
  const closeChangePwModal = () => {
    setShowChangePwModal(false);
    setChangePwCurrent(''); setChangePwNew(''); setChangePwConfirm('');
    setChangePwError(''); setChangePwSuccess(false);
  };

  const handleConfirmChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onChangePassword) return;
    if (changePwNew !== changePwConfirm) { setChangePwError('New passwords do not match.'); return; }
    if (changePwNew.length < 6) { setChangePwError('New password must be at least 6 characters.'); return; }
    setChangePwError('');
    setChangePwLoading(true);
    try {
      const result = await onChangePassword(changePwCurrent, changePwNew);
      if (!result.success) { setChangePwError(result.error ?? 'Wrong current password.'); return; }
      setChangePwSuccess(true);
      setTimeout(() => closeChangePwModal(), 1500);
    } catch (err: any) {
      setChangePwError(err?.message ?? 'Failed to change password.');
    } finally {
      setChangePwLoading(false);
    }
  };

  // ── Avatar handler ──────────────────────────────────────────────────────
  const handleAvatarChange = async (dataUri: string) => {
    setLocalAvatar(dataUri); // optimistic preview
    if (onUpdateProfilePic) {
      const result = await onUpdateProfilePic(dataUri);
      // If the save failed, parent won't update userAvatar; local preview stays until next refresh.
      if (!result.success) console.warn('[Settings] Failed to save avatar:', result.error);
    }
  };

  const identity = (
    <div className="settings-identity">
      <div className="settings-identity__avatar" style={localAvatar ? { background: 'transparent', padding: 0, overflow: 'hidden' } : undefined}>
        {localAvatar
          ? <img src={localAvatar} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
          : displayName.charAt(0)}
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
        <>
        <MyAccountSubPage
          displayName={displayName}
          status={status}
          userAvatar={localAvatar}
          onDisplayNameChange={setDisplayName}
          onStatusChange={setStatus}
          onSave={onSave}
          onAvatarChange={handleAvatarChange}
          onChangePasswordClick={openChangePwModal}
          onDeleteAccountClick={openDeleteModal}
        />
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <Button variant="ghost" onClick={async () => {
                    try {
                      const buf = await accountManager.exportEncryptedBackup(userName ?? '');
                      const uint8 = new Uint8Array(buf as any);
                      const blob = new Blob([uint8]);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${userName ?? 'account'}_encrypted_backup.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (err: any) { console.error('Export failed', err); alert(err?.message ?? 'Export failed'); }
                  }} iconLeft={<i className="fas fa-download" />}>Back up (encrypted)</Button>

                  <Button variant="ghost" onClick={async () => {
                    // Decrypted export: show confirmation first
                    if (!confirm('Export account in decrypted form? This file will contain readable account data. Only use for transferring to another device and delete it afterwards. Continue?')) return;
                    try {
                      const buf = await accountManager.exportToZip(userName ?? '');
                      const uint8 = new Uint8Array(buf as any);
                      const blob = new Blob([uint8]);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${userName ?? 'account'}_export.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (err: any) { console.error('Export failed', err); alert(err?.message ?? 'Export failed'); }
                  }} iconLeft={<i className="fas fa-external-link-alt" />}>Export for transfer (decrypted)</Button>

                  <input id="import-backup-input" type="file" accept=".zip" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const ab = await file.arrayBuffer();
                      // Try import — if decrypted import requires a new password, prompt the user
                      try {
                        const res = await accountManager.importBackup(Buffer.from(new Uint8Array(ab) as any));
                        if (typeof res === 'string') alert(`Restored ${res}.`);
                        else alert(`Imported account ${res.username}.`);
                      } catch (err: any) {
                        if ((err?.message || '').includes('new password')) {
                          const newPw = prompt('This backup is decrypted. Enter a new password to secure the account on this device:');
                          if (!newPw) { alert('Import cancelled.'); return; }
                          const res = await accountManager.importBackup(Buffer.from(new Uint8Array(ab) as any), newPw);
                          if (typeof res === 'string') alert(`Restored ${res}.`);
                          else alert(`Imported account ${res.username}.`);
                        } else {
                          throw err;
                        }
                      }
                    } catch (err: any) { console.error('Import failed', err); alert(err?.message ?? 'Import failed'); }
                    // clear value so same file can be reselected
                    (e.target as HTMLInputElement).value = '';
                  }} />
                  <Button variant="ghost" onClick={() => { const el = document.getElementById('import-backup-input') as HTMLInputElement | null; el?.click(); }} iconLeft={<i className="fas fa-upload" />}>Import backup</Button>
                </div>

                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Toggle checked={autoLoginEnabled} onChange={(v) => { setAutoLoginEnabled(v); accountManager.setAutoLoginEnabled(v); }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong>Auto-login</strong>
                    <span style={{ fontSize: 12 }}>Allow Kiama to use the OS keychain to automatically unlock the last account on startup.</span>
                  </div>
                </div>
                </>
      )}

      {/* ── Change-password overlay ────────────────────────────────────────── */}
      {showChangePwModal && (
        <div className="login-delete-overlay" onClick={closeChangePwModal} style={{ zIndex: 9999 }}>
          <div className="login-delete-container" onClick={(e) => e.stopPropagation()}>
            <ModalPanel
              title="Change Password"
              description="Enter your current password, then choose a new one."
              icon={<i className="fas fa-lock" />}
              footer={
                <div className="login-delete-footer">
                  <button type="button" className="outline-btn" onClick={closeChangePwModal} disabled={changePwLoading}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="settings-change-pw-form"
                    className="danger-btn"
                    style={{ background: 'var(--accent)' }}
                    disabled={changePwLoading || !changePwCurrent || !changePwNew || !changePwConfirm || changePwSuccess}
                  >
                    {changePwLoading ? 'Saving…' : 'Update password'}
                  </button>
                </div>
              }
            >
              <form id="settings-change-pw-form" className="settings-change-pw-form" onSubmit={handleConfirmChangePw}>
                <label className="field">
                  <span>Current password</span>
                  <div className="password-field">
                    <input
                      type={showChangePwCurrent ? 'text' : 'password'}
                      value={changePwCurrent}
                      onChange={(e) => setChangePwCurrent(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      required
                    />
                    <button type="button" className="ghost-btn" onClick={() => setShowChangePwCurrent(p => !p)}>
                      {showChangePwCurrent ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="field">
                  <span>New password</span>
                  <div className="password-field">
                    <input
                      type={showChangePwNew ? 'text' : 'password'}
                      value={changePwNew}
                      onChange={(e) => setChangePwNew(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" className="ghost-btn" onClick={() => setShowChangePwNew(p => !p)}>
                      {showChangePwNew ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="field">
                  <span>Confirm new password</span>
                  <div className="password-field">
                    <input
                      type="password"
                      value={changePwConfirm}
                      onChange={(e) => setChangePwConfirm(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </label>
                {changePwError   && <div className="error"  role="alert">{changePwError}</div>}
                {changePwSuccess && <div className="success-msg" role="status">✓ Password changed successfully!</div>}
              </form>
            </ModalPanel>
          </div>
        </div>
      )}

      {/* ── Delete confirmation overlay ─────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="login-delete-overlay" onClick={closeDeleteModal} style={{ zIndex: 9999 }}>
          <div className="login-delete-container" onClick={(e) => e.stopPropagation()}>
            <ModalPanel
              title="Delete Account"
              description={`Permanently delete “${userName ?? 'your account'}”? You will be logged out immediately and this cannot be undone.`}
              icon={<i className="fas fa-trash" />}
              footer={
                <div className="login-delete-footer">
                  <button type="button" className="outline-btn" onClick={closeDeleteModal} disabled={deleteLoading}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="settings-delete-form"
                    className="danger-btn"
                    disabled={deleteLoading || !deletePw}
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete account'}
                  </button>
                </div>
              }
            >
              <form id="settings-delete-form" onSubmit={handleConfirmDelete}>
                <label className="field">
                  <span>Enter your password to confirm</span>
                  <div className="password-field">
                    <input
                      type={showDeletePw ? 'text' : 'password'}
                      value={deletePw}
                      onChange={(e) => setDeletePw(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      required
                    />
                    <button type="button" className="ghost-btn" onClick={() => setShowDeletePw(p => !p)}>
                      {showDeletePw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                {deleteError && <div className="error" role="alert">{deleteError}</div>}
              </form>
            </ModalPanel>
          </div>
        </div>
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

