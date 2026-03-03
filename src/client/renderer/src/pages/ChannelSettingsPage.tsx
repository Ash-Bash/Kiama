import React, { useEffect, useState } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import Button from '../components/Button';
import TextField from '../components/TextField';
import Toggle from '../components/Toggle';
import Select from '../components/Select';
import { Channel, ChannelSection } from '../types/plugin';
import '../styles/components/ChannelSettings.scss';

interface Role {
  id: string;
  name: string;
  color?: string;
}

// ── Channel settings tabs ────────────────────────────────────────────────────

type ChannelTab = 'overview' | 'settings' | 'permissions';

// == Overview sub-page ========================================================

interface OverviewSubPageProps {
  channel: Channel;
  sections: ChannelSection[];
  onRename: (name: string) => Promise<void> | void;
  onMoveTo: (sectionId: string | undefined) => Promise<void> | void;
}

const OverviewSubPage: React.FC<OverviewSubPageProps> = ({
  channel,
  sections,
  onRename,
  onMoveTo,
}) => {
  const [name, setName]         = useState(channel.name);
  const [saving, setSaving]     = useState(false);
  const [sectionId, setSectionId] = useState(channel.sectionId ?? '__none__');

  useEffect(() => {
    setName(channel.name);
    setSectionId(channel.sectionId ?? '__none__');
  }, [channel]);

  const channelTypeIcon = () => {
    if (channel.type === 'voice')        return <i className="fas fa-volume-up" />;
    if (channel.type === 'announcement') return <i className="fas fa-bullhorn" />;
    return <i className="fas fa-hashtag" />;
  };

  const channelTypeLabel = () => {
    if (channel.type === 'voice')        return 'Voice Channel';
    if (channel.type === 'announcement') return 'Announcement Channel';
    return 'Text Channel';
  };

  const saveAll = async () => {
    setSaving(true);
    if (name.trim() && name.trim() !== channel.name) {
      await onRename(name.trim());
    }
    const newSectionId = sectionId === '__none__' ? undefined : sectionId;
    if (newSectionId !== channel.sectionId) {
      await onMoveTo(newSectionId);
    }
    setSaving(false);
  };

  const isOverviewDirty = (): boolean => {
    const trimmed = name.trim();
    const currentSection = sectionId === '__none__' ? undefined : sectionId;
    if (trimmed !== (channel.name ?? '')) return true;
    if (currentSection !== (channel.sectionId ?? undefined)) return true;
    return false;
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Overview</h2>
        <p>General information about this channel.</p>
      </div>

      {/* Channel identity */}
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Channel Info</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Type</strong>
              <span>The channel type cannot be changed after creation.</span>
            </div>
            <div className="settings-sub-page__row-control">
              <span className="channel-settings__type-badge">
                {channelTypeIcon()} {channelTypeLabel()}
              </span>
            </div>
          </div>
          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Channel ID</strong>
            </div>
            <div className="settings-sub-page__row-control">
              <code className="channel-settings__id-code">{channel.id}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Rename */}
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Name</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__field">
            <TextField
              label="Channel name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel-name"
              disabled={saving}
            />
          </div>
        </div>
      </div>

      {/* Section */}
      {sections.length > 0 && (
        <div className="settings-sub-page__section">
          <p className="settings-sub-page__section-title">Section</p>
          <div className="settings-sub-page__card">
            <div className="settings-sub-page__field">
              <label className="field">
                <span>Assign to section</span>
                <Select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={saving}
                >
                  <option value="__none__">— No section —</option>
                  {sections
                    .filter(s => s.serverId === channel.serverId)
                    .sort((a, b) => a.position - b.position)
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </Select>
              </label>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button
          variant="primary"
          onClick={saveAll}
          disabled={saving || !name.trim() || !isOverviewDirty()}
          iconLeft={<i className={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} />}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
};

// == Settings sub-page ========================================================

interface SettingsSubPageProps {
  channel: Channel;
  onSave: (settings: {
    nsfw: boolean;
    slowMode: number;
    topic: string;
    allowPinning: boolean;
  }) => Promise<void> | void;
}

const ChannelSettingsSubPage: React.FC<SettingsSubPageProps> = ({ channel, onSave }) => {
  const [nsfw, setNsfw]               = useState(channel.settings?.nsfw ?? false);
  const [slowMode, setSlowMode]       = useState(channel.settings?.slowMode ?? 0);
  const [topic, setTopic]             = useState(channel.settings?.topic ?? '');
  const [allowPinning, setAllowPinning] = useState(channel.settings?.allowPinning ?? true);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    setNsfw(channel.settings?.nsfw ?? false);
    setSlowMode(channel.settings?.slowMode ?? 0);
    setTopic(channel.settings?.topic ?? '');
    setAllowPinning(channel.settings?.allowPinning ?? true);
  }, [channel]);

  const save = async () => {
    setSaving(true);
    await onSave({ nsfw, slowMode, topic, allowPinning });
    setSaving(false);
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Settings</h2>
        <p>Configure channel behaviour and moderation options.</p>
      </div>

      {/* Topic */}
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Topic</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__field">
            <TextField
              label="Channel topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this channel about?"
              disabled={saving}
            />
          </div>
        </div>
      </div>

      {/* Moderation */}
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Moderation</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Age-restricted (NSFW)</strong>
              <span>Requires users to confirm their age before viewing content.</span>
            </div>
            <div className="settings-sub-page__row-control">
              <Toggle
                checked={nsfw}
                onChange={setNsfw}
                disabled={saving}
                size="small"
              />
            </div>
          </div>

          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Slow mode</strong>
              <span>Minimum seconds between messages per user (0 = disabled).</span>
            </div>
            <div className="settings-sub-page__row-control">
              <input
                type="number"
                min={0}
                max={3600}
                value={slowMode}
                onChange={(e) => setSlowMode(Number(e.target.value))}
                disabled={saving}
                className="channel-settings__number-input"
              />
              <span className="settings-sub-page__hint" style={{ marginLeft: 6 }}>seconds</span>
            </div>
          </div>

          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Allow pinning</strong>
              <span>Let moderators pin important messages in this channel.</span>
            </div>
            <div className="settings-sub-page__row-control">
              <Toggle
                checked={allowPinning}
                onChange={setAllowPinning}
                disabled={saving}
                size="small"
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !(
            nsfw !== (channel.settings?.nsfw ?? false) ||
            slowMode !== (channel.settings?.slowMode ?? 0) ||
            topic !== (channel.settings?.topic ?? '') ||
            allowPinning !== (channel.settings?.allowPinning ?? true)
          )}
          iconLeft={<i className={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} />}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
};

// == Permissions sub-page =====================================================

interface ChannelPermissionsSubPageProps {
  channel: Channel;
  roles: Role[];
  rolesLoading?: boolean;
  onRequestRoles?: () => Promise<void> | void;
  onSave: (readRoles: string[], writeRoles: string[]) => Promise<void> | void;
}

const ChannelPermissionsSubPage: React.FC<ChannelPermissionsSubPageProps> = ({
  channel,
  roles,
  rolesLoading,
  onRequestRoles,
  onSave,
}) => {
  useEffect(() => {
    console.log('[ChannelPermissions] props roles length=', roles.length, 'rolesLoading=', rolesLoading);
  }, [roles, rolesLoading]);
  const [readRoles, setReadRoles]   = useState<string[]>(
    channel.permissions?.readRoles ?? channel.permissions?.roles ?? []
  );
  const [writeRoles, setWriteRoles] = useState<string[]>(
    channel.permissions?.writeRoles ?? channel.permissions?.roles ?? []
  );
  const [saving, setSaving] = useState(false);

  const availableRoleIds = React.useMemo(() => new Set(roles.map(r => r.id)), [roles]);

  useEffect(() => {
    const rawRead = channel.permissions?.readRoles ?? channel.permissions?.roles ?? [];
    const rawWrite = channel.permissions?.writeRoles ?? channel.permissions?.roles ?? [];
    // Only keep role ids that exist on the server (remove any local/test ids)
    setReadRoles(rawRead.filter((id: string) => availableRoleIds.has(id)));
    setWriteRoles(rawWrite.filter((id: string) => availableRoleIds.has(id)));
  }, [channel, roles, availableRoleIds]);

  const initialRead = React.useMemo(() => (channel.permissions?.readRoles ?? channel.permissions?.roles ?? []).filter((id: string) => availableRoleIds.has(id)), [channel, availableRoleIds]);
  const initialWrite = React.useMemo(() => (channel.permissions?.writeRoles ?? channel.permissions?.roles ?? []).filter((id: string) => availableRoleIds.has(id)), [channel, availableRoleIds]);

  const setsEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    return b.every(x => sa.has(x));
  };

  const isDirty = !setsEqual(readRoles, initialRead) || !setsEqual(writeRoles, initialWrite);

  const ownerRoleId = roles.find(r => r.id === 'owner' || (r.name || '').toLowerCase() === 'owner')?.id;

  const toggleRole = (target: 'read' | 'write', roleId: string) => {
    if (target === 'read') {
      setReadRoles(prev =>
        prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
      );
    } else {
      setWriteRoles(prev =>
        prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
      );
    }
  };

  const save = async () => {
    if (rolesLoading) return; // prevent saving while roles are loading
    if (!isDirty) return;
    setSaving(true);
    // Ensure owner role always has access
    const finalRead = ownerRoleId ? Array.from(new Set([...readRoles, ownerRoleId])) : readRoles;
    const finalWrite = ownerRoleId ? Array.from(new Set([...writeRoles, ownerRoleId])) : writeRoles;
    await onSave(finalRead, finalWrite);
    setSaving(false);
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Permissions</h2>
        <p>Control which roles can read and write in this channel. Leave empty to allow all roles.</p>
      </div>

      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Role Access</p>
        <div className="channel-perms">
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can view (visibility)</div>
            <div className="channel-perms__col-body">
                    {rolesLoading ? (
                      <div className="settings-sub-page__loading">
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />
                        <span>Loading roles…</span>
                      </div>
                    ) : roles.length === 0 ? (
                      <div>
                        <span className="settings-sub-page__hint">No roles defined on this server yet.</span>
                        {typeof onRequestRoles === 'function' && (
                          <div style={{ marginTop: 8 }}>
                            <Button variant="primary" onClick={() => onRequestRoles()}>Reload roles</Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      roles.map((role: Role) => {
                        const isOwner = role.id === 'owner' || (role.name || '').toLowerCase() === 'owner';
                        return (
                          <Toggle
                            key={role.id}
                            inline
                            label={role.name}
                            checked={isOwner ? true : readRoles.includes(role.id)}
                            onChange={() => !isOwner && toggleRole('read', role.id)}
                            tintColor={role.color}
                            size="small"
                            disabled={rolesLoading || isOwner}
                          />
                        );
                      })
                    )
                  }
            </div>
          </div>
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can write</div>
            <div className="channel-perms__col-body">
              {rolesLoading ? (
                <div className="settings-sub-page__loading">
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />
                  <span>Loading roles…</span>
                </div>
              ) : roles.length === 0 ? (
                <div>
                  <span className="settings-sub-page__hint">No roles defined on this server yet.</span>
                  {typeof onRequestRoles === 'function' && (
                    <div style={{ marginTop: 8 }}>
                      <Button variant="primary" onClick={() => onRequestRoles()}>Reload roles</Button>
                    </div>
                  )}
                </div>
              ) : (
              roles.map((role: Role) => {
                      const isOwner = role.id === 'owner' || (role.name || '').toLowerCase() === 'owner';
                      return (
                        <Toggle
                          key={role.id}
                          inline
                          label={role.name}
                          checked={isOwner ? true : writeRoles.includes(role.id)}
                          onChange={() => !isOwner && toggleRole('write', role.id)}
                          tintColor={role.color}
                          size="small"
                          disabled={rolesLoading || isOwner}
                        />
                      );
                    })
                )
              }
            </div>
          </div>
        </div>
        <p className="settings-sub-page__hint" style={{ marginTop: 10 }}>
          If no roles are selected for "Can view", all roles can see this channel.
          Server owners and users with the Manage Channels permission always see everything.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || rolesLoading || !isDirty}
          iconLeft={<i className={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} />}
        >
          {saving ? 'Saving…' : rolesLoading ? 'Loading…' : 'Save permissions'}
        </Button>
      </div>
    </div>
  );
};

// == Main component ===========================================================

export interface ChannelSettingsPageProps {
  channel: Channel;
  sections: ChannelSection[];
  roles: Role[];
  rolesLoading?: boolean;
  onBack: () => void;
  onRename: (channelId: string, name: string) => Promise<void> | void;
  onMoveTo: (channelId: string, sectionId: string | undefined) => Promise<void> | void;
  onSaveSettings: (channelId: string, settings: {
    nsfw: boolean;
    slowMode: number;
    topic: string;
    allowPinning: boolean;
  }) => Promise<void> | void;
  onSavePermissions: (channelId: string, readRoles: string[], writeRoles: string[]) => Promise<void> | void;
  onRequestRoles?: () => Promise<void> | void;
}

const ChannelSettingsPage: React.FC<ChannelSettingsPageProps> = ({
  channel,
  sections,
  roles,
  rolesLoading,
  onRequestRoles,
  onBack,
  onRename,
  onMoveTo,
  onSaveSettings,
  onSavePermissions,
}) => {
  const [activeTab, setActiveTab] = useState<ChannelTab>('overview');

  const channelTypeIcon = () => {
    if (channel.type === 'voice')        return 'fas fa-volume-up';
    if (channel.type === 'announcement') return 'fas fa-bullhorn';
    return 'fas fa-hashtag';
  };

  const navSections: SettingsNavSection[] = [
    {
      label: channel.name,
      items: [
        { id: 'overview',     label: 'Overview',     icon: 'fas fa-info-circle' },
        { id: 'settings',     label: 'Settings',     icon: 'fas fa-sliders-h'   },
        { id: 'permissions',  label: 'Permissions',  icon: 'fas fa-lock' },
      ],
    },
  ];

  const identity = (
    <div className="settings-identity">
      <div className="settings-identity__avatar channel-settings__avatar">
        <i className={channelTypeIcon()} />
      </div>
      <div className="settings-identity__meta">
        <span className="settings-identity__name">{channel.name}</span>
        <span className="settings-identity__tag">Channel Settings</span>
      </div>
    </div>
  );

  

  return (
    <SettingsLayout
      className="channel-settings-layout"
      sections={navSections}
      activeId={activeTab}
      onSelect={(id) => setActiveTab(id as ChannelTab)}
      onClose={onBack}
      closeLabel="Back"
      identity={identity}
    >
      {activeTab === 'overview' && (
        <OverviewSubPage
          channel={channel}
          sections={sections}
          onRename={(name) => onRename(channel.id, name)}
          onMoveTo={(sectionId) => onMoveTo(channel.id, sectionId)}
        />
      )}
      {activeTab === 'settings' && (
        <ChannelSettingsSubPage
          channel={channel}
          onSave={(settings) => onSaveSettings(channel.id, settings)}
        />
      )}
      {activeTab === 'permissions' && (
        <ChannelPermissionsSubPage
          channel={channel}
          roles={roles}
          rolesLoading={rolesLoading}
          onRequestRoles={onRequestRoles}
          onSave={(readRoles, writeRoles) => onSavePermissions(channel.id, readRoles, writeRoles)}
        />
      )}
    </SettingsLayout>
  );
};

export default ChannelSettingsPage;
