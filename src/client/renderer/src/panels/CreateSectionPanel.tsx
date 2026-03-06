import React from 'react';
import ModalPanel from '../components/ModalPanel';
import Button from '../components/Button';
import TextField from '../components/TextField';

interface CreateSectionPanelProps {
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}

const CreateSectionPanel: React.FC<CreateSectionPanelProps> = ({ onCreate, onCancel }) => {
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onCreate(name.trim());
  };

  return (
    <ModalPanel
      title="Create Section"
      description="Sections group related channels together."
      icon={<i className="fas fa-folder-plus" />}
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
            {busy ? 'Creating…' : 'Create Section'}
          </Button>
        </div>
      }
    >
      <div className="section-create-modal">
        <TextField
          label="Section name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New Section"
          autoFocus
          disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
      </div>
    </ModalPanel>
  );
};

export default CreateSectionPanel;
