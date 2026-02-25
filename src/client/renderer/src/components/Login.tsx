import React, { useState, useEffect } from 'react';
import * as os from 'os';
import * as path from 'path';
import { AccountManager } from '../utils/AccountManager';
import ModalPanel from './ModalPanel';
import '../styles/Login.scss';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

// Resolve the accounts directory once – stored in ~/.kiama/accounts
const accountsDir = path.join(os.homedir(), '.kiama', 'accounts');
const accountManager = new AccountManager(accountsDir);

type AuthMode = 'login' | 'create';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<string[]>([]);

  // Delete-account confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deletePw, setDeletePw] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load existing local accounts on mount.
  useEffect(() => {
    try {
      setLocalAccounts(accountManager.listAccounts());
    } catch {
      setLocalAccounts([]);
    }
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await accountManager.createAccount({ username, password });
      setLocalAccounts(accountManager.listAccounts());
      onLogin(`local:${account.id}`, { ...account, accountType: 'local' });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await accountManager.login(username, password);
      if (result.success && result.account) {
        onLogin(`local:${result.account.id}`, { ...result.account, accountType: 'local' });
      } else {
        setError(result.error ?? 'Invalid username or password');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Pre-fill username when tapping a saved account chip.
  const handleSwitchAccount = (name: string) => {
    setUsername(name);
    setPassword('');
    setMode('login');
    setError('');
  };

  // Open delete confirmation for a specific account.
  const openDeleteModal = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(name);
    setDeletePw('');
    setDeleteError('');
    setShowDeletePw(false);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeletePw('');
    setDeleteError('');
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleteError('');
    setDeleteLoading(true);
    try {
      const result = await accountManager.login(deleteTarget, deletePw);
      if (!result.success) {
        setDeleteError(result.error ?? 'Wrong password.');
        return;
      }
      accountManager.deleteAccount(deleteTarget);
      const updated = accountManager.listAccounts();
      setLocalAccounts(updated);
      if (username === deleteTarget) { setUsername(''); setPassword(''); }
      closeDeleteModal();
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Failed to delete account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="grid-lines" aria-hidden="true" />
      <div className="orb orb-a" aria-hidden="true" />
      <div className="orb orb-b" aria-hidden="true" />
      <div className="drag-zone" aria-hidden="true" />

      <div className="login-viewport">
        <div className="card">
          <div className="card-header">
            <p className="eyebrow">Access</p>
            <h2>{mode === 'create' ? 'Create Account' : 'Sign in'}</h2>
            <p className="hint">Your account is stored only on this device.</p>

            {/* Sign in / Create account tabs */}
            <div className="mode-toggle" role="tablist" aria-label="Auth mode">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => { setMode('login'); setError(''); }}
                role="tab"
                aria-selected={mode === 'login'}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === 'create' ? 'active' : ''}
                onClick={() => { setMode('create'); setError(''); }}
                role="tab"
                aria-selected={mode === 'create'}
              >
                Create account
              </button>
            </div>
          </div>

          {/* Saved accounts quick-switch */}
          {mode === 'login' && localAccounts.length > 0 && (
            <div className="account-switcher">
              <p className="account-switcher-label">Saved accounts</p>
              {localAccounts.map(name => (
                <div key={name} className="account-chip-row">
                  <button
                    type="button"
                    className={`account-chip${username === name ? ' selected' : ''}`}
                    onClick={() => handleSwitchAccount(name)}
                  >
                    {name}
                  </button>
                  <button
                    type="button"
                    className="account-chip-delete"
                    aria-label={`Delete account ${name}`}
                    onClick={(e) => openDeleteModal(name, e)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={mode === 'create' ? handleCreate : handleLogin} className="form">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                autoComplete="username"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="ghost-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {error && <div className="error" role="alert">{error}</div>}

            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'create' ? 'Create account' : 'Sign in'}
            </button>

            <p className="fine-print">
              Accounts are encrypted and stored only on this device.
            </p>
          </form>
        </div>
      </div>
      {/* ── Delete confirmation overlay ───────────────────────────────────── */}
      {deleteTarget && (
        <div className="login-delete-overlay" onClick={closeDeleteModal}>
          <div className="login-delete-container" onClick={(e) => e.stopPropagation()}>
            <ModalPanel
              title="Delete Account"
              description={`Permanently delete “${deleteTarget}”? This cannot be undone.`}
              icon={<i className="fas fa-trash" />}
              footer={
                <div className="login-delete-footer">
                  <button type="button" className="outline-btn" onClick={closeDeleteModal} disabled={deleteLoading}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="delete-account-form"
                    className="danger-btn"
                    disabled={deleteLoading || !deletePw}
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete account'}
                  </button>
                </div>
              }
            >
              <form id="delete-account-form" onSubmit={handleConfirmDelete}>
                <label className="field">
                  <span>Enter your password to confirm</span>
                  <div className="password-field">
                    <input
                      type={showDeletePw ? 'text' : 'password'}
                      value={deletePw}
                      onChange={(e) => setDeletePw(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      required
                    />
                    <button type="button" className="ghost-btn" onClick={() => setShowDeletePw(p => !p)}>
                      {showDeletePw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                {deleteError && <div className="error" role="alert">{deleteError}</div>}
              </form>
            </ModalPanel>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;