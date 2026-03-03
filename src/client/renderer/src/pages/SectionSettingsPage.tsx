import React, { useEffect, useState } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import Button from '../components/Button';
import TextField from '../components/TextField';
import Toggle from '../components/Toggle';
import { ChannelSection } from '../types/plugin';
import '../styles/components/ChannelSettings.scss';

interface Role {
  id: string;
  name: string;
  color?: string;
}

// ── Section settings tabs ────────────────────────────────────────────────────

type SectionTab = 'overview' | 'permissions';

// == Overview sub-page ========================================================

interface OverviewSubPageProps {
  section: ChannelSection;
  onRename: (name: string) => Promise<void> | void;
}

const OverviewSubPage: React.FC<OverviewSubPageProps> = ({ section, onRename }) => {
  const [name, setName]     = useState(section.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(section.name); }, [section.name]);

  const save = async () => {
    if (!name.trim() || name.trim() === section.name) return;
    setSaving(true);
    await onRename(name.trim());
    setSaving(false);
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Overview</h2>
        <p>General information about this section.</p>
      </div>

      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Section Info</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Section ID</strong>
            </div>
            <div className="settings-sub-page__row-control">
              <code className="channel-settings__id-code">{section.id}</code>
            </div>
          </div>
          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Position</strong>
              <span>Order in the channel sidebar.</span>
            </div>
            <div className="settings-sub-page__row-control">
              <span className="settings-sub-page__hint">{section.position}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Name</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__field">
            <TextField
              label="Section name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Section name"
              disabled={saving}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !name.trim() || name.trim() === section.name}
          iconLeft={<i className={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} />}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
};

// == Permissions sub-page =====================================================

interface SectionPermissionsSubPageProps {
  section: ChannelSection;
  roles: Role[];
  onSave: (viewRoles: string[], manageRoles: string[]) => Promise<void> | void;
}

const SectionPermissionsSubPage: React.FC<SectionPermissionsSubPageProps> = ({
  section,
  roles,
  onSave,
}) => {
  // viewRoles = which roles can SEE this section (empty = everyone)
  const [viewRoles, setViewRoles] = useState<string[]>(
    section.permissions?.viewRoles ?? section.permissions?.roles ?? []
  );
  // manageRoles = which roles can manage (add/delete channels) this section
  const [manageRoles, setManageRoles] = useState<string[]>(
    section.permissions?.manageRoles ?? []
  );
  const [saving, setSaving] = useState(false);

  const availableRoleIds = React.useMemo(() => new Set(roles.map(r => r.id)), [roles]);

  useEffect(() => {
    setViewRoles((section.permissions?.viewRoles ?? section.permissions?.roles ?? []).filter((id: string) => availableRoleIds.has(id)));
    setManageRoles((section.permissions?.manageRoles ?? []).filter((id: string) => availableRoleIds.has(id)));
  }, [section, roles, availableRoleIds]);

  const initialView = React.useMemo(() => (section.permissions?.viewRoles ?? section.permissions?.roles ?? []).filter((id: string) => availableRoleIds.has(id)), [section, availableRoleIds]);
  const initialManage = React.useMemo(() => (section.permissions?.manageRoles ?? []).filter((id: string) => availableRoleIds.has(id)), [section, availableRoleIds]);

  const setsEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    return b.every(x => sa.has(x));
  };

  const isDirty = !setsEqual(viewRoles, initialView) || !setsEqual(manageRoles, initialManage);

  const toggle = (target: 'view' | 'manage', roleId: string) => {
    if (target === 'view') {
      setViewRoles(prev =>
        prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
      );
    } else {
      setManageRoles(prev =>
        prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
      );
    }
  };

  const ownerRoleId = roles.find(r => r.id === 'owner' || (r.name || '').toLowerCase() === 'owner')?.id;

  const save = async () => {
    if (!isDirty) return;
    setSaving(true);
    const finalView = ownerRoleId ? Array.from(new Set([...viewRoles, ownerRoleId])) : viewRoles;
    const finalManage = ownerRoleId ? Array.from(new Set([...manageRoles, ownerRoleId])) : manageRoles;
    await onSave(finalView, finalManage);
    setSaving(false);
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Permissions</h2>
        <p>
          Control which roles can see this section and manage it.
          Channels inside the section inherit section visibility — members who can't see
          a section won't see any of its channels either.
        </p>
      </div>

      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Role Access</p>
        <div className="channel-perms">
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can view (visibility)</div>
            <div className="channel-perms__col-body">
              {roles.length === 0 && (
                <span className="settings-sub-page__hint">
                  No roles defined on this server yet.
                </span>
              )}
              {roles.map(role => {
                const isOwner = role.id === 'owner' || (role.name || '').toLowerCase() === 'owner';
                return (
                  <Toggle
                    key={role.id}
                    inline
                    label={role.name}
                    checked={isOwner ? true : viewRoles.includes(role.id)}
                    onChange={() => !isOwner && toggle('view', role.id)}
                    tintColor={role.color}
                    size="small"
                    disabled={isOwner}
                  />
                );
              })}
            </div>
          </div>
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can manage</div>
            <div className="channel-perms__col-body">
              {roles.length === 0 && (
                <span className="settings-sub-page__hint">
                  No roles defined on this server yet.
                </span>
              )}
              {roles.map(role => {
                const isOwner = role.id === 'owner' || (role.name || '').toLowerCase() === 'owner';
                return (
                  <Toggle
                    key={role.id}
                    inline
                    label={role.name}
                    checked={isOwner ? true : manageRoles.includes(role.id)}
                    onChange={() => !isOwner && toggle('manage', role.id)}
                    tintColor={role.color}
                    size="small"
                    disabled={isOwner}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <p className="settings-sub-page__hint" style={{ marginTop: 10 }}>
          If no roles are selected for "Can view", the section is visible to <strong>all</strong> roles.
          Server owners and users with the Manage Channels permission always see everything.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !isDirty}
          iconLeft={<i className={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} />}
        >
          {saving ? 'Saving…' : 'Save permissions'}
        </Button>
      </div>
    </div>
  );
};

// == Main component ===========================================================

export interface SectionSettingsPageProps {
  section: ChannelSection;
  roles: Role[];
  onBack: () => void;
  onRename: (sectionId: string, name: string) => Promise<void> | void;
  onSavePermissions: (sectionId: string, viewRoles: string[], manageRoles: string[]) => Promise<void> | void;
}

const SectionSettingsPage: React.FC<SectionSettingsPageProps> = ({
  section,
  roles,
  onBack,
  onRename,
  onSavePermissions,
}) => {
  const [activeTab, setActiveTab] = useState<SectionTab>('overview');

  const navSections: SettingsNavSection[] = [
    {
      label: section.name,
      items: [
        { id: 'overview',    label: 'Overview',    icon: 'fas fa-info-circle' },
        { id: 'permissions', label: 'Permissions', icon: 'fas fa-lock'        },
      ],
    },
  ];

  const identity = (
    <div className="settings-identity">
      <div className="settings-identity__avatar channel-settings__avatar">
        <i className="fas fa-folder-open" />
      </div>
      <div className="settings-identity__meta">
        <span className="settings-identity__name">{section.name}</span>
        <span className="settings-identity__tag">Section Settings</span>
      </div>
    </div>
  );

  return (
    <SettingsLayout
      className="channel-settings-layout"
      sections={navSections}
      activeId={activeTab}
      onSelect={(id) => setActiveTab(id as SectionTab)}
      onClose={onBack}
      closeLabel="Back"
      identity={identity}
    >
      {activeTab === 'overview' && (
        <OverviewSubPage
          section={section}
          onRename={(name) => onRename(section.id, name)}
        />
      )}
      {activeTab === 'permissions' && (
        <SectionPermissionsSubPage
          section={section}
          roles={roles}
          onSave={(viewRoles, manageRoles) => onSavePermissions(section.id, viewRoles, manageRoles)}
        />
      )}
    </SettingsLayout>
  );
};

export default SectionSettingsPage;
