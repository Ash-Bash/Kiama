import React from 'react';

export interface SettingsNavItem {
  id: string;
  label: string;
  icon?: string; // FontAwesome class, e.g. "fas fa-user"
  danger?: boolean;
}

export interface SettingsNavSection {
  label: string; // section header, e.g. "USER SETTINGS"
  items: SettingsNavItem[];
}

interface SettingsLayoutProps {
  /** Sidebar nav definition */
  sections: SettingsNavSection[];
  /** Currently active nav item id */
  activeId: string;
  /** Called when a nav item is clicked */
  onSelect: (id: string) => void;
  /** Called when the close / back button is clicked */
  onClose: () => void;
  /** Label for the close button (defaults to "Close") */
  closeLabel?: string;
  /** Identity block shown at the top of the sidebar (e.g. username) */
  identity?: React.ReactNode;
  /** The content panel rendered on the right */
  children: React.ReactNode;
  /** Extra class on the root element */
  className?: string;
}

/**
 * Shared shell for settings screens — a fixed left sidebar with grouped nav
 * items and a scrollable right content area, similar to Discord's settings.
 */
const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  sections,
  activeId,
  onSelect,
  onClose,
  closeLabel = 'Close',
  identity,
  children,
  className = '',
}) => {
  return (
    <div className={`settings-layout ${className}`.trim()}>
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside className="settings-layout__sidebar">
        <div className="settings-layout__sidebar-inner">
          {identity && (
            <div className="settings-layout__identity">{identity}</div>
          )}

          <nav className="settings-layout__nav">
            {sections.map((section) => (
              <div key={section.label} className="settings-layout__nav-section">
                <div className="settings-layout__nav-label">{section.label}</div>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={[
                      'settings-layout__nav-item',
                      activeId === item.id ? 'is-active' : '',
                      item.danger ? 'is-danger' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onSelect(item.id)}
                  >
                    {item.icon && (
                      <i className={`settings-layout__nav-icon ${item.icon}`} />
                    )}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* ── Close / Back action ──────────────────────────── */}
          <div className="settings-layout__sidebar-footer">
            <button className="settings-layout__close-btn" onClick={onClose}>
              <span className="settings-layout__close-circle">
                <i className="fas fa-times" />
              </span>
              <span>{closeLabel}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content area ──────────────────────────────────────── */}
      <main className="settings-layout__content">
        {/* Mobile: sticky close header shown only on ≤768px (CSS-controlled) */}
        <div className="settings-layout__mobile-header">
          <h3>{sections.flatMap(s => s.items).find(i => i.id === activeId)?.label ?? 'Settings'}</h3>
          <button className="settings-mobile-close" onClick={onClose} aria-label="Close settings" title="Close settings">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="settings-layout__content-inner">
          {children}
        </div>
      </main>
    </div>
  );
};

export default SettingsLayout;
