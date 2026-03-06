import React, { useState } from 'react';
import ModalPanel from '../components/ModalPanel';
import Button from '../components/Button';
import TextField from '../components/TextField';

interface ClaimOwnerPanelProps {
  username: string;
  onClaim: (username: string, token?: string) => Promise<{ success: boolean; requiresToken?: boolean; error?: string }>;
  onCancel: () => void;
}

const ClaimOwnerPanel: React.FC<ClaimOwnerPanelProps> = ({ username, onClaim, onCancel }) => {
  const [ownerInput, setOwnerInput] = useState(username || '');
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsToken, setNeedsToken] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    if (!ownerInput.trim()) return;
    setBusy(true);
    const result = await onClaim(ownerInput.trim(), tokenInput || undefined);
    setBusy(false);
    if (result.success) {
      onCancel();
    } else {
      if (result.requiresToken) setNeedsToken(true);
      setMsg(result.error || 'Failed to claim ownership.');
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button variant="primary" onClick={submit} disabled={busy} iconLeft={<i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-crown'} />}>{busy ? 'Claiming…' : 'Claim Ownership'}</Button>
    </div>
  );

  return (
    <ModalPanel title="Claim Server Ownership" description="This server has no owner yet. Claim ownership to finish setup and receive admin privileges." footer={footer}>
      <p style={{ marginTop: 0, marginBottom: 8, color: 'var(--text-primary)' }}>You will be set as the server owner: <strong style={{ color: 'var(--text-primary)' }}>{username}</strong></p>
      <TextField
        containerClassName="field--grow field--with-icon"
        label={needsToken ? 'Admin token (required)' : 'Admin token (optional)'}
        value={tokenInput}
        onChange={(e) => setTokenInput(e.target.value)}
        type={showToken ? 'text' : 'password'}
        disabled={busy}
        suffix={(
          <Button className="icon-button" variant="ghost" onClick={() => setShowToken(v => !v)} iconLeft={<i className={showToken ? 'fas fa-eye-slash' : 'fas fa-eye'} />} />
        )}
      />
      {msg && <p style={{ color: 'var(--text-primary)', marginTop: 8, fontWeight: 600 }}>{msg}</p>}
    </ModalPanel>
  );
};

export default ClaimOwnerPanel;
