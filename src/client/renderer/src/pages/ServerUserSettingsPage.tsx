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
  onBack: () => void;
  onNicknameSaved?: (nickname?: string) => void;
}

const ServerUserSettingsPage: React.FC<Props> = ({ server, currentUsername, onBack, onNicknameSaved }) => {
  const [nickname, setNickname] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentUsername) return;
      setLoading(true);
      try {
        const nick = await accountManager.getServerNickname(currentUsername, server.id);
        if (mounted) setNickname(nick ?? '');
      } catch (e) {
        console.warn('Could not load nickname', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [currentUsername, server.id]);

  const sections: SettingsNavSection[] = [
    { label: 'PROFILE', items: [{ id: 'profile', label: 'Profile' }] }
  ];

  const handleSave = async () => {
    if (!currentUsername) return;
    setSaving(true);
    try {
      await accountManager.setServerNickname(currentUsername, server.id, nickname || undefined);
      setSaving(false);
      if (onNicknameSaved) onNicknameSaved(nickname || undefined);
      onBack();
    } catch (e) {
      console.error('Failed to save nickname', e);
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
          <p>Set your nickname for this server (visible to others).</p>
        </div>
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
            <div className="settings-sub-page__row">
              <div style={{display:'flex', gap:8}}>
                <Button variant="primary" onClick={handleSave} disabled={saving || loading}>{saving ? 'Saving…' : 'Save'}</Button>
                <Button onClick={onBack}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
};

export default ServerUserSettingsPage;
