import React, { useEffect, useMemo, useState } from 'react';
import Page from '../components/Page';
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
}

// Server-level settings surface for access control and housekeeping.
const defaultRolePermissions: RolePermissions = {
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  kickMembers: false,
  banMembers: false,
  sendMessages: true,
  viewChannels: true
};

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
  passwordRequired = null
}) => {
  const [readRoles, setReadRoles] = useState<string[]>([]);
  const [writeRoles, setWriteRoles] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#5865f2');
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(defaultRolePermissions);
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const currentChannel = useMemo(() => channels.find(c => c.id === selectedChannelId), [channels, selectedChannelId]);

  useEffect(() => {
    const nextRead = currentChannel?.permissions?.readRoles
      || currentChannel?.permissions?.roles
      || [];
    const nextWrite = currentChannel?.permissions?.writeRoles
      || currentChannel?.permissions?.roles
      || [];
    setReadRoles(nextRead);
    setWriteRoles(nextWrite);
  }, [currentChannel]);

  // Sync form fields whenever the selected role changes
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
    // No selection — reset to blank create form
    setRoleName('');
    setRoleColor('#5865f2');
    setRolePermissions(defaultRolePermissions);
  }, [selectedRoleId, roles]);

  const selectRole = (id: string) => {
    setSelectedRoleId(prev => (prev === id ? null : id));
  };

  const clearSelection = () => setSelectedRoleId(null);

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

  const submitRole = async () => {
    if (!roleName.trim()) return;
    setIsSubmittingRole(true);
    if (selectedRoleId && onUpdateRole) {
      await onUpdateRole(selectedRoleId, { name: roleName.trim(), color: roleColor, permissions: rolePermissions });
    } else {
      await onCreateRole({ name: roleName.trim(), color: roleColor, permissions: rolePermissions });
      clearSelection();
    }
    setIsSubmittingRole(false);
  };

  const channelOptions = channels.filter(c => c.serverId === server.id);
  const permissionKeys = Object.keys(permissionLabels) as Array<keyof RolePermissions>;

  return (
    <Page
      className="server-settings-page"
      padded
      scroll
      header={(
        <div className="server-settings-header">
          <div className="title-block">
            <div className="pill">Server</div>
            <h1><i className="fas fa-cog"></i> {server.name} Settings</h1>
            <p>Control who can read and write per channel, review security, and manage membership.</p>
          </div>
          <div className="actions">
            <Button variant="ghost" onClick={onBack} iconLeft={<i className="fas fa-arrow-left"></i>}>
              Back
            </Button>
          </div>
        </div>
      )}
    >
      <div className="settings-grid">
        <div className="settings-card span-2">
          <div className="card-header">
            <div>
              <p className="eyebrow">Access control</p>
              <h3>Read & write permissions</h3>
              <p className="hint">Gate each channel with role-based read/write lists.</p>
            </div>
          </div>
          <div className="card-body">
            <label className="field">
              <span>Channel</span>
              <Select
                value={selectedChannelId}
                onChange={(e) => onSelectChannel(e.target.value)}
                disabled={loading || channelOptions.length === 0}
              >
                {channelOptions.map(channel => (
                  <option key={channel.id} value={channel.id}>#{channel.name}</option>
                ))}
              </Select>
            </label>

            <div className="role-grid">
              <div className="role-column">
                <div className="column-title">Can read</div>
                {roles.length === 0 && <div className="hint">No roles defined yet.</div>}
                {roles.map(role => (
                  <Toggle
                    key={role.id}
                    inline
                    label={role.name}
                    checked={readRoles.includes(role.id)}
                    onChange={() => toggleRole('read', role.id)}
                    tintColor={role.color}
                    size="small"
                  />
                ))}
              </div>
              <div className="role-column">
                <div className="column-title">Can write</div>
                {roles.length === 0 && <div className="hint">No roles defined yet.</div>}
                {roles.map(role => (
                  <Toggle
                    key={role.id}
                    inline
                    label={role.name}
                    checked={writeRoles.includes(role.id)}
                    onChange={() => toggleRole('write', role.id)}
                    tintColor={role.color}
                    size="small"
                  />
                ))}
              </div>
            </div>

            <div className="actions-row">
              <Button
                variant="primary"
                onClick={save}
                disabled={loading || isSaving || !currentChannel}
                iconLeft={<i className="fas fa-save"></i>}
              >
                {isSaving ? 'Saving…' : 'Save permissions'}
              </Button>
              <span className="hint subtle">Applies instantly to the selected channel.</span>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Security</p>
              <h3>Join password</h3>
              <p className="hint">Server owners can require a join password at startup.</p>
            </div>
          </div>
          <div className="card-body">
            {passwordRequired === null ? (
              <div className="hint">Password requirement unknown for this server.</div>
            ) : passwordRequired ? (
              <div className="badge warning">Password required to join</div>
            ) : (
              <div className="badge success">Open join</div>
            )}
            <p className="hint subtle">Password configuration currently lives on the server host. Client connections pass the password via the Socket auth payload.</p>
          </div>
        </div>

        <div className="settings-card span-2">
          <div className="card-header">
            <div>
              <p className="eyebrow">Roles</p>
              <h3>Server roles</h3>
              <p className="hint">Click a role to edit it, or create a new one.</p>
            </div>
          </div>
          <div className="card-body role-builder">
            <div className="role-list">
              {roles.length === 0 ? (
                <div className="hint">No roles defined yet.</div>
              ) : (
                roles.map(role => (
                  <div
                    key={role.id}
                    className={`role-row${selectedRoleId === role.id ? ' selected' : ''}`}
                    onClick={() => selectRole(role.id)}
                  >
                    <div className="role-meta">
                      <span className="role-dot" style={{ background: role.color || '#9ca3af' }} />
                      <span className="role-name">{role.name}</span>
                    </div>
                    <div className="role-perms">
                      {role.permissions && (
                        <>
                          {role.permissions.manageServer && <span className="perm-pill">Manage server</span>}
                          {role.permissions.manageChannels && <span className="perm-pill">Manage channels</span>}
                          {role.permissions.manageRoles && <span className="perm-pill">Manage roles</span>}
                          {role.permissions.kickMembers && <span className="perm-pill">Kick</span>}
                          {role.permissions.banMembers && <span className="perm-pill">Ban</span>}
                          {role.permissions.sendMessages && <span className="perm-pill">Send</span>}
                          {role.permissions.viewChannels && <span className="perm-pill">View</span>}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              <button className="role-new-btn" onClick={clearSelection}>
                <i className="fas fa-plus" /> New role
              </button>
            </div>

            <div className="role-form">
              <div className="role-form-header">
                {selectedRoleId ? (
                  <>
                    <span
                      className="role-dot"
                      style={{ background: roleColor || '#9ca3af', width: 14, height: 14 }}
                    />
                    <span className="role-form-title">Editing <strong>{roleName || '…'}</strong></span>
                  </>
                ) : (
                  <span className="role-form-title">New role</span>
                )}
              </div>
              <TextField
                label="Role name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g., Admin"
                disabled={isSubmittingRole}
              />
              <ColorPicker
                label="Role color"
                value={roleColor}
                onChange={setRoleColor}
                disabled={isSubmittingRole}
              />

              <div className="permissions-grid">
                {permissionKeys.map((permKey) => (
                  <Toggle
                    key={permKey}
                    inline
                    className="checkbox-row"
                    label={permissionLabels[permKey]}
                    checked={rolePermissions[permKey]}
                    onChange={(next) =>
                      setRolePermissions(prev => ({ ...prev, [permKey]: next }))
                    }
                    disabled={isSubmittingRole}
                  />
                ))}
              </div>

              <div className="actions-row">
                <Button
                  variant="primary"
                  onClick={submitRole}
                  disabled={isSubmittingRole || !roleName.trim()}
                  iconLeft={<i className={selectedRoleId ? 'fas fa-save' : 'fas fa-plus'}></i>}
                >
                  {isSubmittingRole
                    ? (selectedRoleId ? 'Saving…' : 'Creating…')
                    : (selectedRoleId ? 'Save changes' : 'Add role')}
                </Button>
                <span className="hint subtle">Roles set server-wide capabilities.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
};

export default ServerSettingsPage;
