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
  onAdd: (server: Server) => void;
  onClose: () => void;
}

const normalizeAddress = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

// Self-contained panel for adding a new server via URL.
const AddServerPanel: React.FC<AddServerPanelProps> = ({ onAdd, onClose }) => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const address = (formData.get('address') as string || '').trim();
    const url = normalizeAddress(address);
    if (!url) return;
    onAdd({ id: `server-${Date.now()}`, name: url, url });
    onClose();
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
      </form>
    </ModalPanel>
  );
};

export default AddServerPanel;
