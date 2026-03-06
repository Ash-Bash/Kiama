import React from 'react';
import ModalPanel from '../components/ModalPanel';
import Button from '../components/Button';
import TextField from '../components/TextField';
import Select from '../components/Select';

interface CreateChannelPanelProps {
  onCreate: (name: string, type: 'text' | 'voice' | 'announcement') => Promise<void>;
  onCancel: () => void;
}

const CreateChannelPanel: React.FC<CreateChannelPanelProps> = ({ onCreate, onCancel }) => {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<'text' | 'voice' | 'announcement'>('text');
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onCreate(name.trim(), type);
  };

  return (
    <ModalPanel
      title="Create Channel"
      description="Add a new channel to this server."
      icon={<i className="fas fa-hashtag" />}
      tone="accent"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={busy || !name.trim()}
            iconLeft={<i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-plus'} />}
          >
            {busy ? 'Creating…' : 'Create Channel'}
          </Button>
        </div>
      }
    >
      <div className="channel-create-modal">
        <TextField
          label="Channel name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="new-channel"
          autoFocus
          disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <label className="field">
          <span>Channel type</span>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as 'text' | 'voice' | 'announcement')}
            disabled={busy}
          >
            <option value="text">Text Channel</option>
            <option value="voice">Voice Channel</option>
            <option value="announcement">Announcement Channel</option>
          </Select>
        </label>
      </div>
    </ModalPanel>
  );
};

export default CreateChannelPanel;
