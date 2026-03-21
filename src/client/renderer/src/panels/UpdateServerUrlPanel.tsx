import React, { useState } from 'react';
import ModalPanel from '../components/ModalPanel';
import TextField from '../components/TextField';
import Button from '../components/Button';

type Server = { id: string; name: string; url: string };

interface Props {
  server: Server;
  onSave: (newUrl: string) => Promise<boolean>;
  onCancel: () => void;
}

const UpdateServerUrlPanel: React.FC<Props> = ({ server, onSave, onCancel }) => {
  const [url, setUrl] = useState(server.url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const newUrl = (url || '').trim();
    if (!newUrl) {
      setError('Please enter a URL.');
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(newUrl);
      if (!ok) setError('Could not reach the provided URL.');
    } catch (e) {
      setError(String(e || 'Unexpected error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPanel title="Update server URL" description={server.name} showClose onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="Server URL" value={url} onChange={(e) => setUrl((e.target as HTMLInputElement).value)} />
        {error && <div className="settings-sub-page__hint settings-sub-page__hint--error">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </ModalPanel>
  );
};

export default UpdateServerUrlPanel;
