import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SettingsLayout, { SettingsNavSection } from '../components/SettingsLayout';
import ModalWindowPanel from '../components/ModalWindowPanel';
import Toggle from '../components/Toggle';
import Button from '../components/Button';
import Select from '../components/Select';
import TextField from '../components/TextField';
import ColorPicker from '../components/ColorPicker';
import Slider from '../components/Slider';
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
  manageEmotes?: boolean;
}

const permissionLabels: Record<keyof RolePermissions, string> = {
  manageServer: 'Manage Server',
  manageChannels: 'Manage Channels',
  manageRoles: 'Manage Roles',
  kickMembers: 'Kick Members',
  banMembers: 'Ban Members',
  sendMessages: 'Send Messages',
  viewChannels: 'View Channels'
  ,
  manageEmotes: 'Manage Emotes'
};

interface Server {
  id: string;
  name: string;
  url: string;
  icon?: string;
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
  onDeleteRole?: (id: string) => Promise<void> | void;
  loading?: boolean;
  passwordRequired?: boolean | null;
  adminToken?: string;
  onUpdateServerIcon?: (serverId: string, dataUri: string) => Promise<{ success: boolean; error?: string }>;
  /** The username of the current server owner (null = not set, undefined = unknown). */
  ownerUsername?: string | null;
  ownerAccountId?: string | null;
  /** The username of the currently logged-in account. */
  currentUsername?: string;
  currentUserAccountId?: string | null;
  /** Claim or transfer server ownership. */
  onClaimOwner?: (username: string, adminToken?: string) => Promise<{ success: boolean; requiresToken?: boolean; error?: string }>;
}

type ServerTab = 'overview' | 'roles' | 'permissions' | 'security' | 'backups' | 'ownership' | 'emotes';

const defaultRolePermissions: RolePermissions = {
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  kickMembers: false,
  banMembers: false,
  sendMessages: true,
  viewChannels: true
  ,manageEmotes: false
};

const permissionKeys = Object.keys(permissionLabels) as Array<keyof RolePermissions>;

// == Overview sub-page =========================================================

interface OverviewSubPageProps {
  server: Server;
  onUpdateServerIcon?: (serverId: string, dataUri: string) => Promise<{ success: boolean; error?: string }>;
}

const OverviewSubPage: React.FC<OverviewSubPageProps> = ({ server, onUpdateServerIcon }) => {
  const [localIcon, setLocalIcon] = useState<string | undefined>(server.icon);
  const [iconStatus, setIconStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [iconError, setIconError] = useState<string | undefined>(undefined);

  const handleIconChange = async (dataUri: string) => {
    setLocalIcon(dataUri);
    if (onUpdateServerIcon) {
      setIconStatus('saving');
      setIconError(undefined);
      const result = await onUpdateServerIcon(server.id, dataUri);
      if (result.success) {
        setIconStatus('saved');
        setTimeout(() => setIconStatus('idle'), 2000);
      } else {
        setIconStatus('error');
        setIconError(result.error ?? 'Failed to save icon.');
      }
    }
  };

  return (
  <div className="settings-sub-page">
    <div className="settings-sub-page__header">
      <h2>Overview</h2>
      <p>General information about this server.</p>
    </div>
    <div className="settings-sub-page__section">
      <p className="settings-sub-page__section-title">Server Icon</p>
      <div className="settings-sub-page__card">
        <div className="settings-sub-page__row">
          <div className="settings-sub-page__row-label">
            <strong>Server icon</strong>
            <span>Click the icon to upload a new image (PNG, JPG, GIF, WebP).</span>
          </div>
          <div className="settings-sub-page__row-control">
            <label className="settings-avatar-upload" title="Change server icon">
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUri = ev.target?.result as string;
                    if (dataUri) handleIconChange(dataUri);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              <div className="settings-avatar-large" style={{ borderRadius: 8 }}>
                {localIcon
                  ? <img src={localIcon} alt="Server icon" />
                  : <i className="fas fa-server" style={{ fontSize: 20 }} />}
              </div>
              <span className="settings-avatar-hint">
                {iconStatus === 'saving' ? 'Saving…' : iconStatus === 'saved' ? 'Saved!' : 'Change'}
              </span>
            </label>
          </div>
        </div>
        {iconStatus === 'error' && iconError && (
          <div className="settings-sub-page__row">
            <p className="settings-sub-page__hint" style={{ color: 'var(--danger)', margin: 0 }}>{iconError}</p>
          </div>
        )}
      </div>
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
};

// == Roles sub-page ============================================================

interface RolesSubPageProps {
  roles: Role[];
  onCreateRole: (input: { name: string; color?: string; permissions: RolePermissions }) => Promise<void> | void;
  onUpdateRole?: (id: string, input: { name: string; color?: string; permissions: RolePermissions }) => Promise<void> | void;
  onDeleteRole?: (id: string) => Promise<void> | void;
}

const RolesSubPage: React.FC<RolesSubPageProps> = ({ roles, onCreateRole, onUpdateRole, onDeleteRole }) => {
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

  // The owner role must always retain all permissions to prevent self-lockout.
  const isOwnerRole = selectedRoleId === 'owner' || ['owner', 'server owner'].includes(roleName.trim().toLowerCase());
  const allPermissionsOn: RolePermissions = {
    manageServer: true, manageChannels: true, manageRoles: true,
    kickMembers: true, banMembers: true, sendMessages: true, viewChannels: true
  };

  const submit = async () => {
    if (!roleName.trim()) return;
    setIsSubmitting(true);
    // Force all permissions on when saving the owner role.
    const permsToSave = isOwnerRole ? allPermissionsOn : rolePermissions;
    if (selectedRoleId && onUpdateRole) {
      await onUpdateRole(selectedRoleId, { name: roleName.trim(), color: roleColor, permissions: permsToSave });
    } else {
      await onCreateRole({ name: roleName.trim(), color: roleColor, permissions: permsToSave });
      clearSelection();
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selectedRoleId || !onDeleteRole) return;
    if (!confirm(`Delete role "${roleName}"? This cannot be undone.`)) return;
    setIsSubmitting(true);
    try {
      await onDeleteRole(selectedRoleId);
      clearSelection();
    } catch (err) {
      // swallow — parent will log/handle
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
            {isOwnerRole && (
              <p className="settings-sub-page__hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-lock" style={{ color: 'var(--accent)' }} />
                Owner role always has full permissions and cannot be restricted.
              </p>
            )}
            <div className="role-editor__perm-grid">
              {permissionKeys.map(key => (
                <Toggle
                  key={key}
                  inline
                  label={permissionLabels[key]}
                  checked={isOwnerRole ? true : (rolePermissions[key] ?? false)}
                  onChange={(next) => {
                    if (isOwnerRole) return;
                    setRolePermissions(prev => ({ ...prev, [key]: next }));
                  }}
                  disabled={isSubmitting || isOwnerRole}
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
            {selectedRoleId && (
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={isSubmitting || selectedRoleId === 'owner' || selectedRoleId === 'member'}
              >
                Delete role
              </Button>
            )}
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
    const availableRoleIds = new Set(roles.map(r => r.id));
    setReadRoles(nextRead.filter((id: string) => availableRoleIds.has(id)));
    setWriteRoles(nextWrite.filter((id: string) => availableRoleIds.has(id)));
  }, [currentChannel]);
  const availableRoleIds = React.useMemo(() => new Set(roles.map(r => r.id)), [roles]);
  const initialRead = React.useMemo(() => (currentChannel?.permissions?.readRoles ?? currentChannel?.permissions?.roles ?? []).filter((id: string) => availableRoleIds.has(id)), [currentChannel, availableRoleIds]);
  const initialWrite = React.useMemo(() => (currentChannel?.permissions?.writeRoles ?? currentChannel?.permissions?.roles ?? []).filter((id: string) => availableRoleIds.has(id)), [currentChannel, availableRoleIds]);

  const setsEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    return b.every(x => sa.has(x));
  };

  const isDirty = !setsEqual(readRoles, initialRead) || !setsEqual(writeRoles, initialWrite);

  const ownerRoleId = roles.find(r => r.id === 'owner' || (r.name || '').toLowerCase() === 'owner')?.id;

  const toggleRole = (target: 'read' | 'write', roleId: string) => {
    if (roleId === ownerRoleId) return; // owner cannot be toggled
    if (target === 'read') {
      setReadRoles(prev => prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]);
    } else {
      setWriteRoles(prev => prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]);
    }
  };

  const save = async () => {
    if (!currentChannel) return;
    setIsSaving(true);
    const finalRead = ownerRoleId ? Array.from(new Set([...readRoles, ownerRoleId])) : readRoles;
    const finalWrite = ownerRoleId ? Array.from(new Set([...writeRoles, ownerRoleId])) : writeRoles;
    await onSavePermissions(currentChannel.id, finalRead, finalWrite);
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
              {roles.map(role => {
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
                    disabled={isOwner}
                  />
                );
              })}
            </div>
          </div>
          <div className="channel-perms__col">
            <div className="channel-perms__col-header">Can write</div>
            <div className="channel-perms__col-body">
              {roles.length === 0 && <span className="settings-sub-page__hint">No roles defined.</span>}
              {roles.map(role => {
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
                    disabled={isOwner}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant="primary" onClick={save} disabled={loading || isSaving || !currentChannel || !isDirty} iconLeft={<i className="fas fa-save" />}>
          {isSaving ? 'Saving...' : 'Save permissions'}
        </Button>
        <span className="settings-sub-page__hint">Applies to the selected channel.</span>
      </div>
    </div>
  );
};

// == Emotes sub-page ==========================================================

interface EmoteEntry { name: string; url: string; uploadedBy?: string | null }

const EmotesSubPage: React.FC<{ serverId: string; serverUrl: string; currentUsername?: string }> = ({ serverId, serverUrl, currentUsername }) => {
  const [emotes, setEmotes] = useState<EmoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFileUrl, setEditorFileUrl] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorName, setEditorName] = useState<string>('');
  const [isGif, setIsGif] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0); // degrees
  const FRAME_SIZE = 320; // inner crop size in px (export size)
  const CANVAS_SIZE = 480; // visible canvas size (larger to show image outside frame)
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewLargeRef = useRef<HTMLCanvasElement | null>(null);
  const previewSmallRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/emotes-list`);
      if (!res.ok) throw new Error('Failed to load emotes');
      const list = await res.json();
      // Prepend serverUrl to emote URLs so they load from the correct server
      setEmotes(list.map((e: any) => ({ name: e.name, url: `${serverUrl}${e.url}`, uploadedBy: e.uploadedBy })));
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [serverUrl]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append('emote', file);
    form.append('name', file.name.replace(/\.[^.]+$/, ''));
    try {
      const headers: Record<string, string> = {};
      if (currentUsername) headers['x-username'] = currentUsername;
      const res = await fetch(`${serverUrl}/upload-emote`, { method: 'POST', body: form, headers });
      if (!res.ok) throw new Error('Upload failed');
      await load();
    } catch (e) { console.error(e); }
  };

  const generateRandomName = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let name = '';
    for (let i = 0; i < 6; i++) {
      name += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return name;
  };

  const openEditorWithFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const fileIsGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    setEditorFile(file);
    setEditorFileUrl(url);
    setEditorName(generateRandomName());
    setIsGif(fileIsGif);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setEditorOpen(true);
  };

  // Draw image into square canvas keeping aspect/zoom/offset
  useEffect(() => {
    if (!editorOpen || !editorFileUrl) return;
    const img = new Image();
    img.src = editorFileUrl;
    imgRef.current = img;
    img.onload = () => {
      drawCanvas();
    };
    return () => { imgRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, editorFileUrl]);

  useEffect(() => { if (editorOpen) drawCanvas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [zoom, offset, rotation]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const size = CANVAS_SIZE; // visible canvas size
    const frameSize = FRAME_SIZE; // crop area
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    // clear (keep transparency)
    ctx.clearRect(0, 0, size, size);
    // base scale to fit the largest image dimension to the frame size
    const iw = img.width;
    const ih = img.height;
    const baseScale = frameSize / Math.max(iw, ih);
    const drawW = iw * baseScale * zoom;
    const drawH = ih * baseScale * zoom;
    // center position plus offset (offset is in px relative to frame)
    const cx = size / 2 + offset.x;
    const cy = size / 2 + offset.y;
    // apply rotation around center
    const rad = (rotation % 360) * Math.PI / 180;
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // update previews (crop to frame area from center of canvas)
    const updatePreview = (ref: React.RefObject<HTMLCanvasElement>, outSize: number) => {
      const p = ref.current;
      if (!p) return;
      p.width = outSize;
      p.height = outSize;
      const pc = p.getContext('2d');
      if (!pc) return;
      pc.clearRect(0, 0, outSize, outSize);
      // Extract the center FRAME_SIZE portion from the CANVAS_SIZE canvas
      const cropOffset = (CANVAS_SIZE - FRAME_SIZE) / 2;
      pc.drawImage(canvas, cropOffset, cropOffset, FRAME_SIZE, FRAME_SIZE, 0, 0, outSize, outSize);
    };
    updatePreview(previewLargeRef, 64);
    updatePreview(previewSmallRef, 40);
  };

  const startDrag = (ev: React.MouseEvent) => {
    dragging.current.active = true;
    dragging.current.lastX = ev.clientX;
    dragging.current.lastY = ev.clientY;
  };

  const endDrag = () => { dragging.current.active = false; };

  const onPointerMove = (ev: React.MouseEvent) => {
    if (!dragging.current.active) return;
    const dx = ev.clientX - dragging.current.lastX;
    const dy = ev.clientY - dragging.current.lastY;
    dragging.current.lastX = ev.clientX;
    dragging.current.lastY = ev.clientY;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const closeEditor = () => {
    setEditorOpen(false);
    if (editorFileUrl) {
      URL.revokeObjectURL(editorFileUrl);
    }
    setEditorFile(null);
    setEditorFileUrl(null);
    setRotation(0);
    setIsGif(false);
  };

  const finishUploadFromEditor = async () => {
    const headers: Record<string, string> = {};
    if (currentUsername) headers['x-username'] = currentUsername;
    
    // For GIFs, upload the original file directly (to preserve animation)
    if (isGif && editorFile) {
      const form = new FormData();
      form.append('emote', editorFile, `${editorName}.gif`);
      form.append('name', editorName);
      try {
        const res = await fetch(`${serverUrl}/upload-emote`, { method: 'POST', body: form, headers });
        if (!res.ok) throw new Error('Upload failed');
        await load();
      } catch (e) {
        console.error(e);
      } finally {
        closeEditor();
      }
      return;
    }

    // For static images, use the cropped canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Create a cropped canvas with just the frame area
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = FRAME_SIZE;
    cropCanvas.height = FRAME_SIZE;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;
    
    // Extract center FRAME_SIZE portion from CANVAS_SIZE
    const cropOffset = (CANVAS_SIZE - FRAME_SIZE) / 2;
    cropCtx.drawImage(canvas, cropOffset, cropOffset, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
    
    await new Promise<void>((resolve) => {
      cropCanvas.toBlob(async (blob) => {
        if (!blob) { resolve(); return; }
        const form = new FormData();
        form.append('emote', blob, `${editorName}.png`);
        form.append('name', editorName);
        try {
          const res = await fetch(`${serverUrl}/upload-emote`, { method: 'POST', body: form, headers });
          if (!res.ok) throw new Error('Upload failed');
          await load();
        } catch (e) {
          console.error(e);
        } finally {
          resolve();
          closeEditor();
        }
      }, 'image/png');
    });
  };

  const rotateCW = () => setRotation(r => (r + 90) % 360);
  const rotateCCW = () => setRotation(r => (r - 90 + 360) % 360);
  const resetTransform = () => { setZoom(1); setOffset({ x: 0, y: 0 }); setRotation(0); };

  // Fill: Scale image to completely fill frame (may crop)
  const fillFrame = () => {
    const img = imgRef.current;
    if (!img) return;
    const iw = img.width;
    const ih = img.height;
    // Base scale fits largest dimension to frame - we need smallest dimension to fill
    const baseScale = FRAME_SIZE / Math.max(iw, ih);
    const fillScale = FRAME_SIZE / Math.min(iw, ih);
    // Zoom needed = fillScale / baseScale
    setZoom(fillScale / baseScale);
    setOffset({ x: 0, y: 0 });
  };

  // Fit: Scale image to fit entirely within frame (may have empty space)
  const fitFrame = () => {
    const img = imgRef.current;
    if (!img) return;
    // Base scale already fits largest dimension to frame, so zoom = 1
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete emote "${name}"?`)) return;
    try {
      const headers: Record<string, string> = {};
      if (currentUsername) headers['x-username'] = currentUsername;
      const res = await fetch(`${serverUrl}/emotes/${encodeURIComponent(name)}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Delete failed');
      await load();
    } catch (e) { console.error(e); }
  };

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    const f = ev.dataTransfer.files?.[0];
    if (f) openEditorWithFile(f);
  };

  const onDragOver = (ev: React.DragEvent) => ev.preventDefault();

  const hasEmotes = emotes.length > 0;

  return (
    <div className="settings-sub-page emotes-page" onDrop={onDrop} onDragOver={onDragOver}>
      <div className="emotes-page__header">
        <div className="emotes-page__header-content">
          <h2 className="emotes-page__title">Emoji</h2>
          <p className="emotes-page__description">
            Add custom emoji that anyone can use in this server. Animated GIF emoji may be used by members.
          </p>
          <label className="button button--primary emotes-page__upload-btn">
            <input 
              aria-label="Upload emote" 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={(e) => { const f = e.target.files?.[0]; if (f) openEditorWithFile(f); e.currentTarget.value = ''; }} 
            />
            Upload Emoji
          </label>
          <p className="emotes-page__hint">
            If you want to upload multiple emojis or skip the editor, drag and drop the file(s) onto this page. The emojis will be named using the file name.
          </p>
        </div>
      </div>

      <hr className="emotes-page__divider" />

      {!hasEmotes && (
        <div className="emotes-page__empty">
          <h3 className="emotes-page__empty-title">NO EMOJI</h3>
          <p className="emotes-page__empty-text">Get the party started by uploading an emoji</p>
        </div>
      )}

      {/* Add Emote Editor Modal */}
      {editorOpen && (
        <div className="login-delete-overlay" onClick={closeEditor} style={{ zIndex: 9999 }}>
          <div className={`login-delete-container modal-wide`} onClick={(e) => e.stopPropagation()}>
            <ModalWindowPanel
              className="emoji-editor-modal emoji-editor-modal--splitview"
              asidePosition="right"
              asideWidth="280px"
              aside={(
                <div className="emoji-editor-aside">
                  <div className="emoji-editor-aside__section">
                    <div className="emoji-editor-aside__label">Preview</div>
                    <div className="emoji-editor-aside__previews">
                      <div className="emoji-preview-box">
                        <div className="emoji-preview-reaction">
                          <div className="emoji-preview-reaction__icon">
                            {isGif ? (
                              <img src={editorFileUrl || ''} alt="preview" />
                            ) : (
                              <canvas ref={previewSmallRef} />
                            )}
                          </div>
                          <span className="emoji-preview-reaction__count">6</span>
                        </div>
                      </div>
                      <div className="emoji-preview-box">
                        <div className="emoji-preview-tile">
                          {isGif ? (
                            <img src={editorFileUrl || ''} alt="preview" />
                          ) : (
                            <canvas ref={previewLargeRef} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="emoji-editor-aside__section">
                    <TextField label="Emote name *" value={editorName} onChange={(e) => setEditorName(e.target.value)} />
                  </div>
                  <div className="emoji-editor-aside__actions">
                    <Button variant="primary" onClick={finishUploadFromEditor} style={{ width: '100%' }}>Finish</Button>
                  </div>
                </div>
              )}
            >
              <div className="emoji-editor-main">
                {/* Panel header inside main view */}
                <div className="emoji-editor-main__header">
                  <button className="emoji-editor-main__close icon-btn" aria-label="Close" onClick={closeEditor}>
                    <i className="fas fa-times" />
                  </button>
                  <h3 className="emoji-editor-main__title">
                    Add Emote
                    {isGif && <span className="emoji-editor-gif-badge">GIF</span>}
                  </h3>
                  {!isGif && (
                    <button className="emoji-editor-main__reset icon-btn" title="Reset" onClick={resetTransform}>
                      <i className="fas fa-undo" />
                    </button>
                  )}
                </div>

                {/* Checkerboard stage with canvas or GIF preview */}
                <div className="emoji-editor-stage" onMouseDown={!isGif ? startDrag : undefined} onMouseMove={!isGif ? onPointerMove : undefined} onMouseUp={!isGif ? endDrag : undefined} onMouseLeave={!isGif ? endDrag : undefined}>
                  {isGif ? (
                    <div className="emoji-editor-gif-preview" style={{ width: FRAME_SIZE, height: FRAME_SIZE }}>
                      <img src={editorFileUrl || ''} alt="GIF preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div className="emoji-editor-canvas-wrapper" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, position: 'relative' }}>
                      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} />
                      <div className="emoji-editor-frame" style={{ width: FRAME_SIZE, height: FRAME_SIZE }} aria-hidden />
                    </div>
                  )}
                  <p className="emoji-editor-hint">{isGif ? 'GIF will be uploaded as-is' : 'Drag image to reposition'}</p>
                </div>

                {/* Bottom controls - hidden for GIFs */}
                {!isGif && (
                  <div className="emoji-editor-controls">
                    <div className="emoji-editor-controls__left">
                      <button className="icon-btn emoji-editor-text-btn" title="Fill frame" onClick={fillFrame}>Fill</button>
                      <button className="icon-btn emoji-editor-text-btn" title="Fit to frame" onClick={fitFrame}>Fit</button>
                    </div>
                    <div className="emoji-editor-controls__center">
                      <button className="icon-btn" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Zoom out"><i className="fas fa-search-minus" /></button>
                      <Slider
                        className="emoji-editor-slider"
                        value={zoom}
                        min={0.25}
                        max={3}
                        step={0.01}
                        onChange={setZoom}
                        ariaLabel="Zoom"
                      />
                      <button className="icon-btn" onClick={() => setZoom(z => Math.min(3, z + 0.1))} title="Zoom in"><i className="fas fa-search-plus" /></button>
                    </div>
                  </div>
                )}
              </div>
            </ModalWindowPanel>
          </div>
        </div>
      )}

      {hasEmotes && (
        <>
          <div className="emotes-page__list-header">
            <h3 className="emotes-page__list-title">Emoji</h3>
            <span className="emotes-page__list-count">{emotes.length} emoji</span>
          </div>
          <div className="emotes-page__table">
            <div className="emotes-page__table-head">
              <div className="emotes-page__table-col emotes-page__table-col--image">Image</div>
              <div className="emotes-page__table-col emotes-page__table-col--name">Name</div>
              <div className="emotes-page__table-col emotes-page__table-col--uploader">Uploaded By</div>
              <div className="emotes-page__table-col emotes-page__table-col--actions"></div>
            </div>
            {loading && <div style={{ padding: 16 }}>Loading…</div>}
            {emotes.map(e => (
              <div key={e.name} className="emotes-page__table-row">
                <div className="emotes-page__table-col emotes-page__table-col--image">
                  <img src={e.url} alt={e.name} className="emotes-page__emote-img" />
                </div>
                <div className="emotes-page__table-col emotes-page__table-col--name">
                  <span className="emotes-page__emote-name">:{e.name}:</span>
                </div>
                <div className="emotes-page__table-col emotes-page__table-col--uploader">
                  <span className="emotes-page__uploader">{e.uploadedBy || '—'}</span>
                </div>
                <div className="emotes-page__table-col emotes-page__table-col--actions">
                  <button className="emotes-page__row-delete" onClick={() => handleDelete(e.name)} title="Delete">
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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
  ownerUsername?: string | null;
  ownerAccountId?: string | null;
  currentUsername?: string | null;
  currentUserAccountId?: string | null;
}

const BackupsSubPage: React.FC<BackupsSubPageProps> = ({ serverUrl, adminToken: tokenProp, ownerUsername, ownerAccountId, currentUsername, currentUserAccountId }) => {
  const [token, setToken]             = useState(tokenProp || '');
  const ownerIsCurrent = !!(
    (ownerAccountId && currentUserAccountId && ownerAccountId === currentUserAccountId) ||
    (currentUsername && ownerUsername && currentUsername.toLowerCase() === ownerUsername.toLowerCase())
  );
  const [tokenSaved, setTokenSaved]   = useState(!!tokenProp || ownerIsCurrent);
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

  const authHeaders = useCallback(() => {
    const h: any = { 'Content-Type': 'application/json' };
    if (token) h['x-admin-token'] = token;
    if (ownerIsCurrent && currentUsername) h['x-username'] = currentUsername;
    return h;
  }, [token, ownerIsCurrent, currentUsername]);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusMsg(null), 4000);
  };

  const fetchBackups = useCallback(async () => {
    if (!token && !ownerIsCurrent) return;
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
        <p>
          Create and manage server data backups. {ownerIsCurrent ? 'You are the server owner; an admin token is not required.' : 'Requires your admin token.'}
        </p>
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
                        href={`${serverUrl}/admin/backups/download/${encodeURIComponent(b.filename)}${token ? `?token=${encodeURIComponent(token)}` : ownerIsCurrent && currentUsername ? `?username=${encodeURIComponent(currentUsername)}` : ''}`}
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

// == Ownership sub-page ========================================================

interface OwnershipSubPageProps {
  server: Server;
  ownerUsername?: string | null;
  ownerAccountId?: string | null;
  currentUsername?: string;
  currentUserAccountId?: string | null;
  onClaimOwner?: (username: string, adminToken?: string) => Promise<{ success: boolean; requiresToken?: boolean; error?: string }>;
}

const OwnershipSubPage: React.FC<OwnershipSubPageProps> = ({ ownerUsername, ownerAccountId, currentUsername, currentUserAccountId, onClaimOwner }) => {
  const [ownerInput, setOwnerInput] = useState(currentUsername ?? '');
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<'idle' | 'busy' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [needsToken, setNeedsToken] = useState(false);

  const isOwnerSet = !!(ownerUsername || ownerAccountId);
  const isCurrentOwner = !!(
    (ownerAccountId && currentUserAccountId && ownerAccountId === currentUserAccountId) ||
    (ownerUsername && currentUsername && ownerUsername.toLowerCase() === currentUsername.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!onClaimOwner || !ownerInput.trim()) return;
    setStatus('busy');
    setStatusMsg('');
    const result = await onClaimOwner(ownerInput.trim(), tokenInput || undefined);
    if (result.success) {
      setStatus('success');
      setStatusMsg(`Ownership set to "${ownerInput.trim()}".`);
      setNeedsToken(false);
    } else if (result.requiresToken) {
      setStatus('error');
      setStatusMsg(result.error ?? 'An admin token is required to change ownership.');
      setNeedsToken(true);
    } else {
      setStatus('error');
      setStatusMsg(result.error ?? 'Failed to update ownership.');
    }
  };

  return (
    <div className="settings-sub-page">
      <div className="settings-sub-page__header">
        <h2>Ownership</h2>
        <p>Designate which account is the server owner. Owners bypass all permission checks.</p>
      </div>

      {/* Current owner status */}
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">Current Owner</p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__row">
            <div className="settings-sub-page__row-label">
              <strong>Server owner</strong>
              {isOwnerSet
                ? <span style={{ color: 'var(--text-muted)' }}>{ownerUsername}{isCurrentOwner ? ' (you)' : ''}</span>
                : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No owner set</span>}
            </div>
            <div className="settings-sub-page__row-control">
              {isCurrentOwner && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--accent)', color: '#fff',
                  padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                }}>
                  <i className="fas fa-crown" />&nbsp;Owner
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Claim / transfer form */}
      <div className="settings-sub-page__section">
        <p className="settings-sub-page__section-title">
          {isOwnerSet ? 'Transfer Ownership' : 'Claim Ownership'}
        </p>
        <div className="settings-sub-page__card">
          <div className="settings-sub-page__row settings-sub-page__row--vertical">
            <div className="settings-sub-page__row-label">
              <strong>Account username</strong>
              <span>The username to assign as server owner.</span>
            </div>
            <TextField
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value)}
              placeholder="Enter username"
              disabled={status === 'busy'}
            />
          </div>
          {(isOwnerSet || needsToken) && (
            <div className="settings-sub-page__row settings-sub-page__row--vertical" style={{ marginTop: 12 }}>
              <div className="settings-sub-page__row-label">
                <strong>Admin token</strong>
                <span>
                  {needsToken
                    ? 'This server requires an admin token to transfer ownership.'
                    : 'Required if an admin token is configured on the server.'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <TextField
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Admin token (optional)"
                  type={showToken ? 'text' : 'password'}
                  disabled={status === 'busy'}
                />
                <Button
                  variant="ghost"
                  onClick={() => setShowToken(v => !v)}
                  iconLeft={<i className={showToken ? 'fas fa-eye-slash' : 'fas fa-eye'} />}
                />
              </div>
            </div>
          )}
          {status === 'success' && (
            <p style={{ color: 'var(--green, #4caf50)', marginTop: 10, fontSize: 13 }}>
              <i className="fas fa-check" /> {statusMsg}
            </p>
          )}
          {status === 'error' && (
            <p style={{ color: 'var(--red, #f44336)', marginTop: 10, fontSize: 13 }}>
              <i className="fas fa-exclamation-triangle" /> {statusMsg}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={status === 'busy' || !ownerInput.trim()}
              iconLeft={<i className={status === 'busy' ? 'fas fa-spinner fa-spin' : 'fas fa-crown'} />}
            >
              {isOwnerSet ? 'Transfer Ownership' : 'Claim Ownership'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  onDeleteRole,
  loading = false,
  passwordRequired = null,
  adminToken,
  onUpdateServerIcon,
  ownerUsername,
  ownerAccountId,
  currentUsername,
  currentUserAccountId,
  onClaimOwner,
}) => {
  const [activeTab, setActiveTab] = useState<ServerTab>('overview');

  const navSections: SettingsNavSection[] = [
    {
      label: server.name,
      items: [
        { id: 'overview',    label: 'Overview',    icon: 'fas fa-info-circle' },
        { id: 'roles',       label: 'Roles',       icon: 'fas fa-shield-alt'  },
            { id: 'emotes',      label: 'Emotes',      icon: 'fas fa-smile'       },
        { id: 'permissions', label: 'Permissions', icon: 'fas fa-lock'        },
        { id: 'security',    label: 'Security',    icon: 'fas fa-key'         },
        { id: 'backups',     label: 'Backups',     icon: 'fas fa-archive'     },
        { id: 'ownership',   label: 'Ownership',   icon: 'fas fa-crown'       },
      ],
    },
  ];

  const identity = (
    <div className="settings-identity">
      <div className="settings-identity__avatar" style={{ borderRadius: 8, overflow: 'hidden', padding: server.icon ? 0 : undefined }}>
        {server.icon
          ? <img src={server.icon} alt={server.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <i className="fas fa-server" style={{ fontSize: 14 }} />}
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
      {activeTab === 'overview'    && <OverviewSubPage server={server} onUpdateServerIcon={onUpdateServerIcon} />}
      {activeTab === 'roles'       && <RolesSubPage roles={roles} onCreateRole={onCreateRole} onUpdateRole={onUpdateRole} onDeleteRole={onDeleteRole} />}
      {activeTab === 'emotes'      && <EmotesSubPage serverId={server.id} serverUrl={server.url} currentUsername={currentUsername} />}
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
      {activeTab === 'backups'     && <BackupsSubPage serverUrl={server.url} adminToken={adminToken} ownerUsername={ownerUsername} ownerAccountId={ownerAccountId} currentUsername={currentUsername} currentUserAccountId={currentUserAccountId} />}
      {activeTab === 'ownership'   && (
        <OwnershipSubPage
          server={server}
          ownerUsername={ownerUsername}
          ownerAccountId={ownerAccountId}
          currentUsername={currentUsername}
          currentUserAccountId={currentUserAccountId}
          onClaimOwner={onClaimOwner}
        />
      )}
    </SettingsLayout>
  );
};

export default ServerSettingsPage;
