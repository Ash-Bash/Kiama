import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import '../styles/components/UserProfilePopover.scss';
import { getPortalContainer } from '../utils/portalRoot';

interface Role {
  id: string;
  name: string;
  color?: string;
}

export interface UserProfilePopoverProps {
  username: string;
  currentRole?: string;
  status: 'online' | 'offline';
  roles: Role[];
  canAssignRoles: boolean;
  isYou: boolean;
  isOwner: boolean;
  anchorRect: DOMRect;
  onAssignRole: (roleName: string) => Promise<void>;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

const UserProfilePopover: React.FC<UserProfilePopoverProps> = ({
  username,
  currentRole,
  status,
  roles,
  canAssignRoles,
  isYou,
  isOwner,
  anchorRect,
  onAssignRole,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState(currentRole ?? '');
  const [saved, setSaved] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Position: open to the left of the anchor (member list on the right side)
  const CARD_WIDTH = 260;
  const CARD_HEIGHT = canAssignRoles ? 220 : 150;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.left - CARD_WIDTH - 8;
  let top = anchorRect.top;

  // Flip right if no space on left
  if (left < 8) left = anchorRect.right + 8;
  // Clamp vertically
  if (top + CARD_HEIGHT > vh - 8) top = vh - CARD_HEIGHT - 8;
  if (top < 8) top = 8;
  // Clamp horizontally
  if (left + CARD_WIDTH > vw - 8) left = vw - CARD_WIDTH - 8;

  const handleRoleChange = async (roleName: string) => {
    setSelectedRole(roleName);
    setSaving(true);
    setSaved(false);
    await onAssignRole(roleName);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const initials = username.slice(0, 2).toUpperCase();

  const card = (
    <div
      ref={ref}
      className="user-profile-popover"
      style={{ left, top, width: CARD_WIDTH }}
    >
      {/* Banner + avatar */}
      <div className="user-profile-popover__banner">
        <div className="user-profile-popover__avatar">
          <span>{initials}</span>
          <div className={`user-profile-popover__status ${status}`} />
        </div>
        {isOwner && (
          <span className="user-profile-popover__owner-badge">
            <i className="fas fa-crown" /> Owner
          </span>
        )}
      </div>

      {/* Info */}
      <div className="user-profile-popover__body">
        <div className="user-profile-popover__username">
          {username}
          {isYou && <span className="user-profile-popover__you-badge">you</span>}
        </div>
        <div className="user-profile-popover__subtitle">
          {STATUS_LABELS[status] ?? status}
          {currentRole && !isOwner && (
            <> · <span style={{ opacity: 0.8 }}>{currentRole}</span></>
          )}
        </div>

        {/* Role assignment — only for managers, not for the owner */}
        {canAssignRoles && !isOwner && (
          <div className="user-profile-popover__role-section">
            <label className="user-profile-popover__role-label">Assign role</label>
            <div className="user-profile-popover__role-row">
              <select
                className="user-profile-popover__role-select"
                value={selectedRole}
                onChange={e => handleRoleChange(e.target.value)}
                disabled={saving}
              >
                <option value="">— no role —</option>
                {roles.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
              {saving && <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6, opacity: 0.6 }} />}
              {saved && <i className="fas fa-check" style={{ marginLeft: 6, color: 'var(--green, #4caf50)' }} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(card, getPortalContainer('kiama-profile-popover-root'));
};

export default UserProfilePopover;
