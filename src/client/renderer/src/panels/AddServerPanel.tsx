import React from 'react';
import ModalPanel from '../components/ModalPanel';
import TextField from '../components/TextField';
import Button from '../components/Button';
import '../styles/components/AddServerPanel.scss';

interface Server {
  id: string;
  name: string;
  url: string;
}

interface AddServerPanelProps {
  // onAdd may be async and should return true when the server was accepted
  onAdd: (server: Server) => Promise<boolean> | boolean;
  onClose: () => void;
}

const normalizeAddress = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
};

// Self-contained panel for adding a new server via URL.
const AddServerPanel: React.FC<AddServerPanelProps> = ({ onAdd, onClose }) => {
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const address = (formData.get('address') as string || '').trim();
    const url = normalizeAddress(address);
    if (!url) return;
    // Derive a friendly display name from the URL (hostname[:port]) instead
    // of using the raw URL string so we don't show the protocol in the UI.
    let displayName = url;
    try {
      const parsed = new URL(url);
      displayName = parsed.hostname + (parsed.port ? `:${parsed.port}` : '');
    } catch (err) {
      // keep raw url as fallback
    }
    const serverObj: Server = { id: `server-${Date.now()}`, name: displayName, url };
    try {
      const result = await onAdd(serverObj);
      if (result) {
        onClose();
      } else {
        setError('Unable to reach that server. Please check the address and try again.');
      }
    } catch (err) {
      setError('Failed to validate server. Try again.');
    }
  };

  return (
    <ModalPanel
      className="add-server-panel"
      tone="accent"
      icon={<i className="fas fa-satellite-dish" aria-hidden="true" />}
      title="Connect to a server"
      description="Enter a server address to connect."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-server-form" variant="primary">Add Server</Button>
        </>
      }
    >
      <form id="add-server-form" className="add-server-form" onSubmit={handleSubmit}>
        <TextField
          id="server-address"
          name="address"
          label="Server address"
          placeholder="example.com or 192.168.1.42:3000"
          required
          autoFocus
        />
        {error && <div className="add-server-error" style={{ color: 'var(--accent-danger)', marginTop: 8 }}>{error}</div>}
      </form>
    </ModalPanel>
  );
};

export default AddServerPanel;
