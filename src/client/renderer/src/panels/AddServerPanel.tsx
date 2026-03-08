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
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [resolvedUrl, setResolvedUrl] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const address = (formData.get('address') as string || '').trim();
    const password = (formData.get('password') as string || '').trim();
    const url = resolvedUrl || normalizeAddress(address);
    if (!url) return;

    // Derive a friendly display name
    let name = displayName;
    if (!name) {
      name = url;
      try {
        const parsed = new URL(url);
        name = parsed.hostname + (parsed.port ? `:${parsed.port}` : '');
      } catch (err) {
        // keep raw url as fallback
      }
    }

    // If we already know a password is required, verify it first.
    if (needsPassword) {
      if (!password) {
        setError('This server requires a password to join.');
        return;
      }
      try {
        const res = await fetch(`${url}/server/password/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.valid) {
            setError('Incorrect server password.');
            return;
          }
        } else {
          setError('Could not verify password with the server.');
          return;
        }
      } catch {
        setError('Failed to verify password. Check the address and try again.');
        return;
      }
    }

    // Check if server requires a password (first attempt, no password supplied yet).
    if (!needsPassword) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const infoRes = await fetch(`${url}/info`, { signal: controller.signal });
        clearTimeout(timeout);
        if (infoRes.ok) {
          const info = await infoRes.json();
          if (info.passwordRequired) {
            // Server requires a password — show the password field.
            setNeedsPassword(true);
            setResolvedUrl(url);
            setDisplayName(name);
            setError('This server requires a password to join.');
            return;
          }
        } else {
          setError('Unable to reach that server. Please check the address and try again.');
          return;
        }
      } catch {
        setError('Unable to reach that server. Please check the address and try again.');
        return;
      }
    }

    const serverObj: Server = { id: `server-${Date.now()}`, name, url };
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
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
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
          defaultValue={resolvedUrl}
        />
        {needsPassword && (
          <TextField
            id="server-password"
            name="password"
            label="Server password"
            placeholder="Enter the server password"
            type="password"
            required
            autoFocus
          />
        )}
        {error && <div className="modal-panel__error">{error}</div>}
      </form>
    </ModalPanel>
  );
};

export default AddServerPanel;
