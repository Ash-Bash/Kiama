import React, { useState } from 'react';
import ModalPanel from '../components/ModalPanel';
import Button from '../components/Button';
import TextField from '../components/TextField';

interface AddServerAccountPanelProps {
  onCreate: (username: string, password: string) => Promise<void>;
  onCancel: () => void;
  creating: boolean;
}

const AddServerAccountPanel: React.FC<AddServerAccountPanelProps> = ({ onCreate, onCancel, creating }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    if (!newUsername.trim()) { setFormError('Username is required.'); return; }
    if (newPassword.length < 6) { setFormError('Password must be at least 6 characters.'); return; }
    await onCreate(newUsername.trim(), newPassword);
  };

  return (
    <ModalPanel
      className="accounts-page__create-panel"
      title="Create Server Account"
      description="New credentials are encrypted and stored on the server."
      icon={<i className="fas fa-robot" />}
      showClose
      onClose={onCancel}
      footer={
        <div className="accounts-page__modal-footer">
          <span className="accounts-page__modal-footer-hint">
            <i className="fas fa-lock" /> Encrypted at rest
          </span>
          <div className="accounts-page__modal-footer-actions">
            <Button variant="secondary" onClick={onCancel} disabled={creating}>Cancel</Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={creating || !newUsername.trim() || newPassword.length < 6}
              iconLeft={<i className={creating ? 'fas fa-spinner fa-spin' : 'fas fa-user-plus'} />}
            >
              {creating ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="accounts-page__modal-form">
        <TextField
          label="Username"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="e.g., poll-bot"
          autoFocus
          disabled={creating}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <TextField
          containerClassName="field--grow field--with-icon"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min. 6 characters"
          disabled={creating}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          suffix={(
            <Button className="icon-button" variant="ghost" onClick={() => setShowPassword(v => !v)} iconLeft={<i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'} />} />
          )}
        />
        {formError && (
          <p className="accounts-page__modal-error">
            <i className="fas fa-exclamation-triangle" /> {formError}
          </p>
        )}
      </div>
    </ModalPanel>
  );
};

export default AddServerAccountPanel;
