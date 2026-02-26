import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import { useSurface } from '../utils/SurfaceContext';
import { getPortalContainer } from '../utils/portalRoot';
import '../styles/components/ContextMenu.scss';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContextMenuItemVariant = 'default' | 'danger' | 'success' | 'warning';

export interface ContextMenuItemDef {
  /** Unique key */
  key: string;
  /** `item` = clickable row, `separator` = horizontal divider, `header` = non-clickable label */
  type?: 'item' | 'separator' | 'header';
  /** Row label text */
  label?: string;
  /** Left-side icon node (e.g. <i className="fas fa-cog" />) */
  icon?: ReactNode;
  /** Colour variant */
  variant?: ContextMenuItemVariant;
  /** Disabled — shows the row but prevents interaction */
  disabled?: boolean;
  /** Click handler (for type === 'item') */
  onClick?: () => void;
  /** Nested items — renders a submenu on hover */
  children?: ContextMenuItemDef[];
}

export interface ContextMenuProps {
  /** Menu items definition */
  items: ContextMenuItemDef[];
  /** Viewport X coordinate for the anchor point */
  x: number;
  /** Viewport Y coordinate for the anchor point */
  y: number;
  /** Called when the menu should be dismissed */
  onClose: () => void;
  /** Minimum width in px (default 200) */
  minWidth?: number;
  /** Optional content rendered above the item list (e.g. quick-reaction row) */
  header?: ReactNode;
}

// ── Context (lets nested submenus call onClose) ───────────────────────────────

const CloseCtx = createContext<() => void>(() => {});

// ── Sub-menu panel ────────────────────────────────────────────────────────────

interface SubMenuProps {
  items: ContextMenuItemDef[];
  parentRef: React.RefObject<HTMLButtonElement | null>;
  minWidth: number;
}

const SubMenu: React.FC<SubMenuProps> = ({ items, parentRef, minWidth }) => {
  const onClose = useContext(CloseCtx);
  const { soft3DEnabled } = useSurface();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!parentRef.current) return;
    const pb  = parentRef.current.getBoundingClientRect();
    const pw  = panelRef.current?.offsetWidth  ?? minWidth;
    const ph  = panelRef.current?.offsetHeight ?? 200;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const pad = 6;

    // Default: open to the right
    let left = pb.right + pad;
    if (left + pw > vw - pad) {
      // Would overflow right → open to the left
      left = pb.left - pw - pad;
    }
    if (left < pad) left = pad;

    let top = pb.top;
    if (top + ph > vh - pad) {
      top = vh - ph - pad;
    }
    if (top < pad) top = pad;

    setPos({ top, left });
  }, [parentRef, minWidth]);

  return (
    <div
      ref={panelRef}
      className={`ctx-menu__panel ctx-menu__sub-panel${soft3DEnabled ? ' soft-3d' : ''}`}
      style={pos ? { top: pos.top, left: pos.left, minWidth } : { visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <ItemList items={items} minWidth={minWidth} onClose={onClose} />
    </div>
  );
};

// ── Single item row ───────────────────────────────────────────────────────────

interface ItemRowProps {
  item: ContextMenuItemDef;
  minWidth: number;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, minWidth }) => {
  const onClose   = useContext(CloseCtx);
  const btnRef    = useRef<HTMLButtonElement | null>(null);
  const [openSub, setOpenSub] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  if (item.type === 'separator') {
    return <div className="ctx-menu__separator" />;
  }

  if (item.type === 'header') {
    return <div className="ctx-menu__header">{item.label}</div>;
  }

  const variantClass = item.variant && item.variant !== 'default'
    ? `ctx-menu__item--${item.variant}`
    : '';

  const handleClick = () => {
    if (item.disabled || hasChildren) return;
    item.onClick?.();
    onClose();
  };

  return (
    <div
      className="ctx-menu__item-wrapper"
      onMouseEnter={() => hasChildren && setOpenSub(true)}
      onMouseLeave={() => hasChildren && setOpenSub(false)}
    >
      <button
        ref={btnRef}
        className={['ctx-menu__item', variantClass, item.disabled ? 'ctx-menu__item--disabled' : ''].filter(Boolean).join(' ')}
        onClick={handleClick}
        disabled={item.disabled}
        type="button"
      >
        {item.icon && <span className="ctx-menu__item-icon">{item.icon}</span>}
        <span className="ctx-menu__item-label">{item.label}</span>
        {hasChildren && (
          <span className="ctx-menu__item-end">
            <i className="fas fa-chevron-right" />
          </span>
        )}
      </button>
      {hasChildren && openSub && (
        <SubMenu items={item.children!} parentRef={btnRef} minWidth={minWidth} />
      )}
    </div>
  );
};

// ── Item list (reused by root panel + sub-panels) ────────────────────────────

interface ItemListProps {
  items: ContextMenuItemDef[];
  minWidth: number;
  onClose: () => void;
}

const ItemList: React.FC<ItemListProps> = ({ items, minWidth, onClose }) => (
  <CloseCtx.Provider value={onClose}>
    {items.map((item) => (
      <ItemRow key={item.key} item={item} minWidth={minWidth} />
    ))}
  </CloseCtx.Provider>
);

// ── Root context menu panel ───────────────────────────────────────────────────

/**
 * Generic context menu with optional submenu support.
 *
 * Renders via a React portal into `document.body` so it always appears above
 * all other content regardless of stacking context.
 *
 * @example
 * <ContextMenu
 *   x={evt.clientX}
 *   y={evt.clientY}
 *   onClose={() => setMenu(null)}
 *   items={[
 *     { key: 'edit', label: 'Edit', icon: <i className="fas fa-pen" />, onClick: handleEdit },
 *     { key: 'sep', type: 'separator' },
 *     { key: 'del', label: 'Delete', icon: <i className="fas fa-trash" />, variant: 'danger', onClick: handleDelete },
 *   ]}
 * />
 */
const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  x,
  y,
  onClose,
  minWidth = 200,
  header,
}) => {
  const { soft3DEnabled } = useSurface();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Calculate clamped position once the panel is mounted (so we know its size).
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const pw  = panel.offsetWidth  || minWidth;
    const ph  = panel.offsetHeight || 100;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const pad = 8;

    const left = Math.min(x, vw - pw - pad);
    const top  = Math.min(y, vh - ph - pad);
    setPos({ top: Math.max(pad, top), left: Math.max(pad, left) });
  }, [x, y, minWidth]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close on outside click/mousedown
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the originating mousedown doesn't immediately close the menu
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const panel = (
    <div
      ref={panelRef}
      className={`ctx-menu__panel ctx-menu__root-panel${soft3DEnabled ? ' soft-3d' : ''}`}
      style={pos ? { top: pos.top, left: pos.left, minWidth } : { visibility: 'hidden', top: y, left: x, minWidth }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {header && <div className="ctx-menu__custom-header">{header}</div>}
      <CloseCtx.Provider value={onClose}>
        {items.map((item) => (
          <ItemRow key={item.key} item={item} minWidth={minWidth} />
        ))}
      </CloseCtx.Provider>
    </div>
  );

  return ReactDOM.createPortal(panel, getPortalContainer('kiama-context-menu-root'));
};

export default ContextMenu;

// ── Hook helper ───────────────────────────────────────────────────────────────

export interface ContextMenuState {
  x: number;
  y: number;
}

/**
 * Convenience hook for driving a ContextMenu from a right-click event.
 *
 * @example
 * const { menuState, openMenu, closeMenu } = useContextMenu();
 *
 * <div onContextMenu={openMenu}>...</div>
 * {menuState && (
 *   <ContextMenu x={menuState.x} y={menuState.y} onClose={closeMenu} items={...} />
 * )}
 */
export function useContextMenu() {
  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenuState(null), []);

  return { menuState, openMenu, closeMenu };
}
