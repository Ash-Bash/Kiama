import React, { useEffect, useState } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import TextField from '../components/TextField';
import Button from '../components/Button';
import '../styles/components/ServerSettings.scss';
import { sharedAccountManager as accountManager } from '../utils/sharedAccountManager';

interface Server {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

interface Props {
  server: Server;
  currentUsername?: string;
  globalAvatar?: string;
  onBack: () => void;
  onNicknameSaved?: (nickname?: string) => void;
  onServerProfilePicSaved?: (filePath?: string) => void;
}

const ServerUserSettingsPage: React.FC<Props> = ({
  server, currentUsername, globalAvatar, onBack, onNicknameSaved, onServerProfilePicSaved,
}) => {
  const [nickname, setNickname] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-server avatar state: the persisted value and the live preview
  const [serverAvatar, setServerAvatar] = useState<string | undefined>(undefined);
  const [serverAvatarPreview, setServerAvatarPreview] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentUsername) return;
      setLoading(true);
      try {
        const nick = await accountManager.getServerNickname(currentUsername, server.id);
        if (mounted) setNickname(nick ?? '');

        const picFile = await accountManager.getServerProfilePic(currentUsername, server.id);
        if (mounted && picFile) {
          const fullPath = accountManager.getMediaFilePath(picFile);
          setServerAvatar(`file://${fullPath}`);
          setServerAvatarPreview(`file://${fullPath}`);
        }
      } catch (e) {
        console.warn('Could not load server profile', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [currentUsername, server.id]);

  const sections: SettingsNavSection[] = [
    { label: 'PROFILE', items: [{ id: 'profile', label: 'Profile' }] }
  ];

  const displayAvatar = serverAvatarPreview || globalAvatar;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUri = ev.target?.result as string;
      if (dataUri) setServerAvatarPreview(dataUri);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleResetAvatar = () => {
    setServerAvatarPreview(undefined);
    setServerAvatar(undefined);
  };

  const handleSave = async () => {
    if (!currentUsername) return;
    setSaving(true);
    try {
      await accountManager.setServerNickname(currentUsername, server.id, nickname || undefined);
      if (onNicknameSaved) onNicknameSaved(nickname || undefined);

      // Save per-server profile pic if it changed
      if (serverAvatarPreview !== serverAvatar) {
        const isDataUri = serverAvatarPreview?.startsWith('data:');
        const result = await accountManager.setServerProfilePic(
          currentUsername,
          server.id,
          isDataUri ? serverAvatarPreview : undefined,
        );
        if (onServerProfilePicSaved) {
          onServerProfilePicSaved(result ? `file://${result}` : undefined);
        }
      }

      setSaving(false);
      onBack();
    } catch (e) {
      console.error('Failed to save server profile', e);
      setSaving(false);
    }
  };

  return (
    <SettingsLayout
      sections={sections}
      activeId="profile"
      onSelect={() => {}}
      onClose={onBack}
      identity={<div><strong>{server.name}</strong><div style={{fontSize:12}}>{server.id}</div></div>}
      closeLabel="Back"
    >
      <div className="settings-sub-page">
        <div className="settings-sub-page__header">
          <h2>Server Profile</h2>
          <p>Customise how you appear on this server.</p>
        </div>

        {/* ── Per-server profile picture ─────────────────────────────── */}
        <div className="settings-sub-page__section">
          <p className="settings-sub-page__section-title">Profile Picture</p>
          <div className="settings-sub-page__card">
            <div className="settings-sub-page__row">
              <div className="settings-sub-page__row-label">
                <strong>Server avatar</strong>
                <span>Optional. Uses your global profile picture if not set.</span>
              </div>
              <div className="settings-sub-page__row-control" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="settings-avatar-upload" title="Change server profile picture">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleAvatarChange}
                  />
                  <div className="settings-avatar-large">
                    {displayAvatar
                      ? <img src={displayAvatar} alt="Server avatar" />
                      : (currentUsername?.charAt(0).toUpperCase() || '?')}
                  </div>
                  <span className="settings-avatar-hint">Change</span>
                </label>
                {serverAvatarPreview && (
                  <Button variant="ghost" onClick={handleResetAvatar}>
                    Reset to global
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Nickname ───────────────────────────────────────────────── */}
        <div className="settings-sub-page__section">
          <p className="settings-sub-page__section-title">Nickname</p>
          <div className="settings-sub-page__card">
            <div className="settings-sub-page__row">
              <div className="settings-sub-page__row-label">
                <strong>Your server nickname</strong>
                <span>Optional. Leave blank to use your account username.</span>
              </div>
              <div className="settings-sub-page__row-control">
                <TextField value={nickname} onChange={(e) => setNickname((e.target as HTMLInputElement).value)} placeholder="Nickname" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Preview ────────────────────────────────────────────────── */}
        <div className="settings-sub-page__section">
          <p className="settings-sub-page__section-title">Preview</p>
          <div className="settings-sub-page__card">
            <div className="settings-sub-page__row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="settings-avatar-large" style={{ width: 40, height: 40, fontSize: 16 }}>
                  {displayAvatar
                    ? <img src={displayAvatar} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
                    : (currentUsername?.charAt(0).toUpperCase() || '?')}
                </div>
                <div>
                  <strong>{nickname || currentUsername || 'You'}</strong>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {nickname ? `(${currentUsername})` : ''}
                    {serverAvatarPreview ? ' · Custom avatar' : ' · Global avatar'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Save / Cancel ──────────────────────────────────────────── */}
        <div className="settings-sub-page__section">
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button onClick={onBack}>Cancel</Button>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
};

export default ServerUserSettingsPage;
