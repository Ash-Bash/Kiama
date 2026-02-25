import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import Toggle from '../components/Toggle';
import Button from '../components/Button';
import Select from '../components/Select';
import TextField from '../components/TextField';
import ColorPicker from '../components/ColorPicker';
import '../styles/components/ServerSettings.scss';
import { Channel } from '../types/plugin';

interface Role {
  id: string;
  name: string;
  color?: string;
  permissions?: RolePermissions;
}

interface RolePermissions {
  manageServer: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  sendMessages: boolean;
  viewChannels: boolean;
}

const permissionLabels: Record<keyof RolePermissions, string> = {
  manageServer: 'Manage Server',
  manageChannels: 'Manage Channels',
  manageRoles: 'Manage Roles',
  kickMembers: 'Kick Members',
  banMembers: 'Ban Members',
  sendMessages: 'Send Messages',
  viewChannels: 'View Channels'
};

interface Server {
  id: string;
  name: string;
  url: string;
}

interface ServerSettingsPageProps {
  server: Server;
  channels: Channel[];
  roles: Role[];
  selectedChannelId: string;
  onSelectChannel: (channelId: string) => void;
  onSavePermissions: (channelId: string, readRoles: string[], writeRoles: string[]) => Promise<void> | void;
  onBack: () => void;
  onCreateRole: (input: { name: string; color?: string; permissions: RolePermissions }) => Promise<void> | void;
  onUpdateRole?: (id: string, input: { name: string; color?: string; permissions: RolePermissions }) => Promise<void> | void;
  loading?: boolean;
  passwordRequired?: boolean | null;
  adminToken?: string;
}

type ServerTab = 'overview' | 'roles' | 'permissions' | 'security' | 'backups';

const defaultRolePermissions: RolePermissions = {
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  kickMembers: false,
  banMembers: false,
  sendMessages: true,
  viewChannels: true
};

const permissionKeys = Object.keys(permissionLabels) as Array<keyof RolePermissions>;

// == Overview sub-page =========================================================

const OverviewSubPage: React.FC<{ server: Server }> = ({ server }) => (
  <div className="settings-sub-page">
    <div className="settings-sub-page__header">
      <h2>Overview</h2>
      <p>General information about this server.</p>
    </div>
    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Server Info</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Server name</strong>
            <span>{server.name}</span>
          </div>
        </div>
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Server URL</strong>
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{server.url}</span>
          </div>
        </div>
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Server ID</strong>
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{server.id}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// == Roles sub-page ============================================================

interface RolesSubPageProps {
  roles: Role[];
  onCreateRole: (input: { name: string; color?: string; permissions: RolePermissions }) => Promise<void> | void;
  onUpdateRole?: (id: string, input: { name: string; color?: string; permissions: RolePermissions }) => Promise<void> | void;
}

const RolesSubPage: React.FC<RolesSubPageProps> = ({ roles, onCreateRole, onUpdateRole }) => {
  const [selectedRoleId, setSelectedRoleId]   = useState<string | null>(null);
  const [roleName, setRoleName]               = useState('');
  const [roleColor, setRoleColor]             = useState('#5865f2');
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(defaultRolePermissions);
  const [isSubmitting, setIsSubmitting]       = useState(false);

  useEffect(() => {
    if (selectedRoleId) {
      const role = roles.find(r => r.id === selectedRoleId);
      if (role) {
        setRoleName(role.name);
        setRoleColor(role.color || '#5865f2');
        setRolePermissions(role.permissions || defaultRolePermissions);
        return;
      }
    }
    setRoleName('');
    setRoleColor('#5865f2');
    setRolePermissions(defaultRolePermissions);
  }, [selectedRoleId, roles]);

  const clearSelection = () => setSelectedRoleId(null);

  const submit = async () => {
    if (!roleName.trim()) return;
    setIsSubmitting(true);
    if (selectedRoleId && onUpdateRole) {
      await onUpdateRole(selectedRoleId, { name: roleName.trim(), color: roleColor, permissions: rolePermissions });
    } else {
      await onCreateRole({ name: roleName.trim(), color: roleColor, permissions: rolePermissions });
      clearSelection();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Roles</h2>
        <p>Create and edit server-wide roles with specific capabilities.</p>
      </div>
      <div className="role-editor">
        <div className="role-editor__list">
          {roles.length === 0 && (
            <div style={{ padding: '14px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>
              No roles yet.
            </div>
          )}
          {roles.map(role => (
            <button
              key={role.id}
              className={`role-editor__list-item${selectedRoleId === role.id ? ' is-active' : ''}`}
              onClick={() => setSelectedRoleId(prev => prev === role.id ? null : role.id)}
            >
              <span className="role-editor__dot" style={{ background: role.color || '#9ca3af' }} />
              <span>{role.name}</span>
            </button>
          ))}
          <button className="role-editor__new-btn" onClick={clearSelection}>
            <i className="fas fa-plus" /> New role
          </button>
        </div>
        <div className="role-editor__form">
          <div className="role-editor__form-title">
            {selectedRoleId
              ? <><span className="role-editor__dot" style={{ background: roleColor || '#9ca3af', width: 12, height: 12 }} />Editing <strong style={{ color: 'var(--text-primary)' }}>{roleName || '...'}</strong></>
              : 'New role'
            }
          </div>
          <TextField
            label="Role name"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g., Admin"
            disabled={isSubmitting}
          />
          <ColorPicker label="Role colour" value={roleColor} onChange={setRoleColor} disabled={isSubmitting} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="settings-sub-page__section-title" style={{ margin: 0 }}>Permissions</p>
            <div className="role-editor__perm-grid">
              {permissionKeys.map(key => (
                <Toggle
                  key={key}
                  inline
                  label={permissionLabels[key]}
                  checked={rolePermissions[key]}
                  onChange={(next) => setRolePermissions(prev => ({ ...prev, [key]: next }))}
                  disabled={isSubmitting}
                  size="small"
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={submit}
              disabled={isSubmitting || !roleName.trim()}
              iconLeft={<i className={selectedRoleId ? 'fas fa-save' : 'fas fa-plus'} />}
            >
              {isSubmitting
                ? (selectedRoleId ? 'Saving...' : 'Creating...')
                : (selectedRoleId ? 'Save changes' : 'Add role')}
            </Button>
            <span className="settings-sub-page__hint">Roles apply server-wide.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// == Permissions sub-page ======================================================

interface PermissionsSubPageProps {
  server: Server;
  channels: Channel[];
  roles: Role[];
  selectedChannelId: string;
  onSelectChannel: (id: string) => void;
  onSavePermissions: (channelId: string, readRoles: string[], writeRoles: string[]) => Promise<void> | void;
  loading: boolean;
}

const PermissionsSubPage: React.FC<PermissionsSubPageProps> = ({
  server, channels, roles, selectedChannelId, onSelectChannel, onSavePermissions, loading,
}) => {
  const [readRoles, setReadRoles]   = useState<string[]>([]);
  const [writeRoles, setWriteRoles] = useState<string[]>([]);
  const [isSaving, setIsSaving]     = useState(false);
  const channelOptions = channels.filter(c => c.serverId === server.id);
  const currentChannel = useMemo(() => channels.find(c => c.id === selectedChannelId), [channels, selectedChannelId]);

  useEffect(() => {
    const nextRead  = currentChannel?.permissions?.readRoles  || currentChannel?.permissions?.roles || [];
    const nextWrite = currentChannel?.permissions?.writeRoles || currentChannel?.permissions?.roles || [];
    setReadRoles(nextRead);
    setWriteRoles(nextWrite);
  }, [currentChannel]);

  const toggleRole = (target: 'read' | 'write', roleId: string) => {
    if (target === 'read') {
      setReadRoles(prev => prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]);
    } else {
      setWriteRoles(prev => prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]);
    }
  };

  const save = async () => {
    if (!currentChannel) return;
    setIsSaving(true);
    await onSavePermissions(currentChannel.id, readRoles, writeRoles);
    setIsSaving(false);
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Permissions</h2>
        <p>Control which roles can read and write each channel.</p>
      </div>
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Channel</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__field">
            <label className="field">
              <span>Select channel</span>
              <Select
                value={selectedChannelId}
                onChange={(e) => onSelectChannel(e.target.value)}
                disabled={loading || channelOptions.length === 0}
              >
                {channelOptions.map(c => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </Select>
            </label>
          </div>
        </div>
      </div>
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Role Access</p>
        <div className="channel-perms">
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can read</div>
            <div className="channel-perms__col-body">
              {roles.length === 0 && <span className="settings-sub-page__hint">No roles defined.</span>}
              {roles.map(role => (
                <Toggle key={role.id} inline label={role.name} checked={readRoles.includes(role.id)} onChange={() => toggleRole('read', role.id)} tintColor={role.color} size="small" />
              ))}
            </div>
          </div>
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can write</div>
            <div className="channel-perms__col-body">
              {roles.length === 0 && <span className="settings-sub-page__hint">No roles defined.</span>}
              {roles.map(role => (
                <Toggle key={role.id} inline label={role.name} checked={writeRoles.includes(role.id)} onChange={() => toggleRole('write', role.id)} tintColor={role.color} size="small" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant="primary" onClick={save} disabled={loading || isSaving || !currentChannel} iconLeft={<i className="fas fa-save" />}>
          {isSaving ? 'Saving...' : 'Save permissions'}
        </Button>
        <span className="settings-sub-page__hint">Applies to the selected channel.</span>
      </div>
    </div>
  );
};

// == Backups sub-page ==========================================================

type BackupSchedule = 'manual' | 'daily' | 'weekly' | 'monthly';

interface BackupEntry {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  checksum: string;
}

interface BackupConfig {
  schedule: BackupSchedule;
  lastBackupAt?: string;
  maxBackups?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

interface BackupsSubPageProps {
  serverUrl: string;
  adminToken?: string;
}

const BackupsSubPage: React.FC<BackupsSubPageProps> = ({ serverUrl, adminToken: tokenProp }) => {
  const [token, setToken]             = useState(tokenProp || '');
  const [tokenSaved, setTokenSaved]   = useState(!!tokenProp);
  const [backups, setBackups]         = useState<BackupEntry[]>([]);
  const [config, setConfig]           = useState<BackupConfig | null>(null);
  const [loading, setLoading]         = useState(false);
  const [creating, setCreating]       = useState(false);
  const [restoring, setRestoring]     = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [savingCfg, setSavingCfg]     = useState(false);
  const [statusMsg, setStatusMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<BackupSchedule>('manual');
  const [pendingMax, setPendingMax]   = useState<number>(10);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-token': token
  }), [token]);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusMsg(null), 4000);
  };

  const fetchBackups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/admin/backups`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { backups: BackupEntry[]; config: BackupConfig };
      setBackups(data.backups.reverse()); // newest first
      setConfig(data.config);
      setPendingSchedule(data.config.schedule);
      setPendingMax(data.config.maxBackups ?? 10);
    } catch (err) {
      showStatus(`Failed to load backups: ${err}`, false);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, token, authHeaders]);

  useEffect(() => {
    if (tokenSaved && token) fetchBackups();
  }, [tokenSaved, fetchBackups, token]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${serverUrl}/admin/backups/create`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      showStatus(`Backup created: ${data.backup.filename}`, true);
      fetchBackups();
    } catch (err) {
      showStatus(`Backup failed: ${err}`, false);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (!confirm(`Restore from "${filename}"? Current data will be overwritten. The server should be restarted after.`)) return;
    setRestoring(filename);
    try {
      const res = await fetch(`${serverUrl}/admin/backups/restore/${encodeURIComponent(filename)}`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      showStatus(data.message || 'Restored successfully.', true);
    } catch (err) {
      showStatus(`Restore failed: ${err}`, false);
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;
    setDeleting(filename);
    try {
      const res = await fetch(`${serverUrl}/admin/backups/${encodeURIComponent(filename)}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      showStatus('Backup deleted.', true);
      setBackups(prev => prev.filter(b => b.filename !== filename));
    } catch (err) {
      showStatus(`Delete failed: ${err}`, false);
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveConfig = async () => {
    setSavingCfg(true);
    try {
      const res = await fetch(`${serverUrl}/admin/backups/config`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ schedule: pendingSchedule, maxBackups: pendingMax })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setConfig(data.config);
      showStatus('Backup schedule saved.', true);
    } catch (err) {
      showStatus(`Failed to save config: ${err}`, false);
    } finally {
      setSavingCfg(false);
    }
  };

  const scheduleOptions: Array<{ value: BackupSchedule; label: string }> = [
    { value: 'manual',  label: 'Manual only' },
    { value: 'daily',   label: 'Every day' },
    { value: 'weekly',  label: 'Every week' },
    { value: 'monthly', label: 'Every month' }
  ];

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Backups</h2>
        <p>Create and manage server data backups. Requires your admin token.</p>
      </div>

      {/* Token entry */}
      {!tokenSaved && (
        <div className="settings-sub-page__section">
          <p className="settings-sub-page__section-title">Admin Token</p>
          <div className="settings-sub-page__card">
            <div className="settings-sub-page__field">
              <TextField
                type="password"
                label="Enter your server admin token to manage backups"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Admin token"
              />
            </div>
            <Button
              variant="primary"
              onClick={() => { if (token.trim()) setTokenSaved(true); }}
              disabled={!token.trim()}
              iconLeft={<i className="fas fa-key" />}
            >
              Authenticate
            </Button>
          </div>
        </div>
      )}

      {tokenSaved && (
        <>
          {/* Schedule config */}
          <div className="settings-sub-page__section">
            <p className="settings-sub-page__section-title">Automatic Backup Schedule</p>
            <div className="settings-sub-page__card">
              <div className="backup-config-row">
                <div className="settings-sub-page__field" style={{ flex: 1 }}>
                  <label className="field">
                    <span>Backup frequency</span>
                    <Select
                      value={pendingSchedule}
                      onChange={(e) => setPendingSchedule(e.target.value as BackupSchedule)}
                    >
                      {scheduleOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </label>
                </div>
                <div className="settings-sub-page__field" style={{ flex: 1 }}>
                  <label className="field">
                    <span>Max backups to keep <span className="settings-sub-page__hint">(0 = unlimited)</span></span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={pendingMax}
                      onChange={(e) => setPendingMax(Number(e.target.value))}
                      style={{ background: 'var(--primary-bg)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
              </div>
              {config?.lastBackupAt && (
                <p className="settings-sub-page__hint" style={{ marginTop: 4 }}>
                  Last backup: {formatDate(config.lastBackupAt)}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                <Button
                  variant="primary"
                  onClick={handleSaveConfig}
                  disabled={savingCfg}
                  iconLeft={<i className="fas fa-save" />}
                >
                  {savingCfg ? 'Saving...' : 'Save schedule'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleCreateBackup}
                  disabled={creating}
                  iconLeft={<i className={creating ? 'fas fa-spinner fa-spin' : 'fas fa-archive'} />}
                >
                  {creating ? 'Creating...' : 'Back up now'}
                </Button>
              </div>
            </div>
          </div>

          {/* Status message */}
          {statusMsg && (
            <div className={`backup-status-msg${statusMsg.ok ? '' : ' backup-status-msg--error'}`}>
              <i className={`fas ${statusMsg.ok ? 'fa-check-circle' : 'fa-exclamation-circle'}`} />
              {statusMsg.text}
            </div>
          )}

          {/* Backups list */}
          <div className="settings-sub-page__section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p className="settings-sub-page__section-title" style={{ margin: 0 }}>Backups</p>
              <button className="backup-refresh-btn" onClick={fetchBackups} title="Refresh" disabled={loading}>
                <i className={`fas fa-sync-alt${loading ? ' fa-spin' : ''}`} />
              </button>
            </div>
            {loading && <p className="settings-sub-page__hint">Loading...</p>}
            {!loading && backups.length === 0 && (
              <p className="settings-sub-page__hint">No backups yet. Click "Back up now" to create one.</p>
            )}
            {!loading && backups.length > 0 && (
              <div className="backup-list">
                {backups.map(b => (
                  <div key={b.filename} className="backup-entry">
                    <div className="backup-entry__info">
                      <span className="backup-entry__name">{b.filename}</span>
                      <span className="backup-entry__meta">
                        {formatDate(b.createdAt)} &middot; {formatBytes(b.sizeBytes)}
                      </span>
                    </div>
                    <div className="backup-entry__actions">
                      <a
                        className="backup-action-btn"
                        href={`${serverUrl}/admin/backups/download/${encodeURIComponent(b.filename)}?token=${encodeURIComponent(token)}`}
                        download={b.filename}
                        title="Download"
                      >
                        <i className="fas fa-download" />
                      </a>
                      <button
                        className="backup-action-btn"
                        onClick={() => handleRestore(b.filename)}
                        disabled={!!restoring}
                        title="Restore from this backup"
                      >
                        {restoring === b.filename
                          ? <i className="fas fa-spinner fa-spin" />
                          : <i className="fas fa-undo-alt" />
                        }
                      </button>
                      <button
                        className="backup-action-btn backup-action-btn--danger"
                        onClick={() => handleDelete(b.filename)}
                        disabled={!!deleting}
                        title="Delete backup"
                      >
                        {deleting === b.filename
                          ? <i className="fas fa-spinner fa-spin" />
                          : <i className="fas fa-trash-alt" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              className="backup-refresh-btn"
              style={{ color: 'var(--text-secondary)', fontSize: 12 }}
              onClick={() => { setTokenSaved(false); setToken(''); }}
            >
              <i className="fas fa-sign-out-alt" /> Clear token
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// == Security sub-page =========================================================

const SecuritySubPage: React.FC<{ passwordRequired: boolean | null }> = ({ passwordRequired }) => (
  <div className="settings-sub-page">
    <div className="settings-sub-page__header">
      <h2>Security</h2>
      <p>Server access and join requirements.</p>
    </div>
    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Join Password</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Password requirement</strong>
            <span>Whether a password is needed to join this server.</span>
          </div>
          <div className="settings-sub-page__row-control">
            {passwordRequired === null
              ? <span className="settings-sub-page__badge">Unknown</span>
              : passwordRequired
                ? <span className="settings-sub-page__badge settings-sub-page__badge--warning">Required</span>
                : <span className="settings-sub-page__badge settings-sub-page__badge--success">Open</span>
            }
          </div>
        </div>
        <div className="settings-sub-page__row">
          <p className="settings-sub-page__hint" style={{ margin: 0 }}>
            Password configuration is managed on the server host. The client passes
            the password via the Socket auth payload on connection.
          </p>
        </div>
      </div>
    </div>
  </div>
);

// == Main component ============================================================

const ServerSettingsPage: React.FC<ServerSettingsPageProps> = ({
  server,
  channels,
  roles,
  selectedChannelId,
  onSelectChannel,
  onSavePermissions,
  onBack,
  onCreateRole,
  onUpdateRole,
  loading = false,
  passwordRequired = null,
  adminToken
}) => {
  const [activeTab, setActiveTab] = useState<ServerTab>('overview');

  const navSections: SettingsNavSection[] = [
    {
      label: server.name,
      items: [
        { id: 'overview',    label: 'Overview',    icon: 'fas fa-info-circle' },
        { id: 'roles',       label: 'Roles',       icon: 'fas fa-shield-alt'  },
        { id: 'permissions', label: 'Permissions', icon: 'fas fa-lock'        },
        { id: 'security',    label: 'Security',    icon: 'fas fa-key'         },
        { id: 'backups',     label: 'Backups',     icon: 'fas fa-archive'     },
      ],
    },
  ];

  const identity = (
    <div className="settings-identity">
      <div className="settings-identity__avatar" style={{ borderRadius: 8 }}>
        <i className="fas fa-server" style={{ fontSize: 14 }} />
      </div>
      <div className="settings-identity__meta">
        <span className="settings-identity__name">{server.name}</span>
        <span className="settings-identity__tag">Server Settings</span>
      </div>
    </div>
  );

  return (
    <SettingsLayout
      className="server-settings-layout"
      sections={navSections}
      activeId={activeTab}
      onSelect={(id) => setActiveTab(id as ServerTab)}
      onClose={onBack}
      closeLabel="Back"
      identity={identity}
    >
      {activeTab === 'overview'    && <OverviewSubPage server={server} />}
      {activeTab === 'roles'       && <RolesSubPage roles={roles} onCreateRole={onCreateRole} onUpdateRole={onUpdateRole} />}
      {activeTab === 'permissions' && (
        <PermissionsSubPage
          server={server}
          channels={channels}
          roles={roles}
          selectedChannelId={selectedChannelId}
          onSelectChannel={onSelectChannel}
          onSavePermissions={onSavePermissions}
          loading={loading}
        />
      )}
      {activeTab === 'security'    && <SecuritySubPage passwordRequired={passwordRequired} />}
      {activeTab === 'backups'     && <BackupsSubPage serverUrl={server.url} adminToken={adminToken} />}
    </SettingsLayout>
  );
};

export default ServerSettingsPage;
