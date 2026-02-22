import React, { useEffect, useMemo, useState } from 'react';
import Page from '../components/Page';
import Toggle from '../components/Toggle';
import Button from '../components/Button';
import Select from '../components/Select';
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
  loading?: boolean;
  passwordRequired?: boolean | null;
}

// Server-level settings surface for access control and housekeeping.
const ServerSettingsPage: React.FC<ServerSettingsPageProps> = ({
  server,
  channels,
  roles,
  selectedChannelId,
  onSelectChannel,
  onSavePermissions,
  onBack,
  onCreateRole,
  loading = false,
  passwordRequired = null
}) => {
  const [readRoles, setReadRoles] = useState<string[]>([]);
  const [writeRoles, setWriteRoles] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#5865f2');
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({
    manageServer: false,
    manageChannels: false,
    manageRoles: false,
    kickMembers: false,
    banMembers: false,
    sendMessages: true,
    viewChannels: true
  });
  const [isCreatingRole, setIsCreatingRole] = useState(false);
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

  const rolePresets: Array<{
    label: string;
    color: string;
    permissions: RolePermissions;
  }> = [
    {
      label: 'Admin',
      color: '#f87171',
      permissions: {
        manageServer: true,
        manageChannels: true,
        manageRoles: true,
        kickMembers: true,
        banMembers: true,
        sendMessages: true,
        viewChannels: true
      }
    },
    {
      label: 'Moderator',
      color: '#fbbf24',
      permissions: {
        manageServer: false,
        manageChannels: true,
        manageRoles: false,
        kickMembers: true,
        banMembers: true,
        sendMessages: true,
        viewChannels: true
      }
    },
    {
      label: 'Member',
      color: '#22c55e',
      permissions: {
        manageServer: false,
        manageChannels: false,
        manageRoles: false,
        kickMembers: false,
        banMembers: false,
        sendMessages: true,
        viewChannels: true
      }
    }
  ];

  const applyPreset = (preset: typeof rolePresets[number]) => {
    setRoleName(preset.label);
    setRoleColor(preset.color);
    setRolePermissions(preset.permissions);
  };

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

  const createRole = async () => {
    if (!roleName.trim()) return;
    setIsCreatingRole(true);
    await onCreateRole({ name: roleName.trim(), color: roleColor, permissions: rolePermissions });
    setIsCreatingRole(false);
    setRoleName('');
    setRoleColor('#5865f2');
    setRolePermissions({
      manageServer: false,
      manageChannels: false,
      manageRoles: false,
      kickMembers: false,
      banMembers: false,
      sendMessages: true,
      viewChannels: true
    });
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
                  <label key={role.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={readRoles.includes(role.id)}
                      onChange={() => toggleRole('read', role.id)}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
              <div className="role-column">
                <div className="column-title">Can write</div>
                {roles.length === 0 && <div className="hint">No roles defined yet.</div>}
                {roles.map(role => (
                  <label key={role.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={writeRoles.includes(role.id)}
                      onChange={() => toggleRole('write', role.id)}
                    />
                    <span>{role.name}</span>
                  </label>
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
              <h3>Server roles & presets</h3>
              <p className="hint">View existing roles and add new ones with server-wide permissions.</p>
            </div>
          </div>
          <div className="card-body role-builder">
            <div className="role-list">
              {roles.length === 0 ? (
                <div className="hint">No roles defined yet. Start with a preset below.</div>
              ) : (
                roles.map(role => (
                  <div key={role.id} className="role-row">
                    <div className="role-meta">
                      <span className="role-dot" style={{ background: role.color || '#9ca3af' }} />
                      <span className="role-name">{role.name}</span>
                    </div>
                    <div className="role-perms">
                      {(role.permissions || rolePermissions) && (
                        <>
                          {(role.permissions || rolePermissions).manageServer && <span className="perm-pill">Manage server</span>}
                          {(role.permissions || rolePermissions).manageChannels && <span className="perm-pill">Manage channels</span>}
                          {(role.permissions || rolePermissions).manageRoles && <span className="perm-pill">Manage roles</span>}
                          {(role.permissions || rolePermissions).kickMembers && <span className="perm-pill">Kick</span>}
                          {(role.permissions || rolePermissions).banMembers && <span className="perm-pill">Ban</span>}
                          {(role.permissions || rolePermissions).sendMessages && <span className="perm-pill">Send</span>}
                          {(role.permissions || rolePermissions).viewChannels && <span className="perm-pill">View</span>}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="role-form">
              <div className="preset-row">
                {rolePresets.map(preset => (
                  <button key={preset.label} className="preset-btn" onClick={() => applyPreset(preset)}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Role name</span>
                <input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g., Admin"
                  disabled={isCreatingRole}
                />
              </label>
              <label className="field">
                <span>Role color</span>
                <input
                  type="color"
                  value={roleColor}
                  onChange={(e) => setRoleColor(e.target.value)}
                  disabled={isCreatingRole}
                  style={{ width: '80px', padding: 0, height: '36px' }}
                />
              </label>

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
                    disabled={isCreatingRole}
                  />
                ))}
              </div>

              <div className="actions-row">
                <Button
                  variant="primary"
                  onClick={createRole}
                  disabled={isCreatingRole || !roleName.trim()}
                  iconLeft={<i className="fas fa-plus"></i>}
                >
                  {isCreatingRole ? 'Creating…' : 'Add role'}
                </Button>
                <span className="hint subtle">Roles set server-wide capabilities; channel overrides still apply.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
};

export default ServerSettingsPage;
