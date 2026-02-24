import React from 'react';
import ReactDOM from 'react-dom';
import { useSurface } from '../utils/SurfaceContext';
import Button from './Button';
import '../styles/components/PopoverPanel.scss';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Bounding-rect of the trigger element that the popover should point at. */
export interface PopoverAnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PopoverPanelProps {
  /** Title rendered in the header bar. */
  title: string;
  onClose: () => void;
  /** Panel width in px (default 360). */
  width?: number;
  /** Panel max-height in px (default 380). */
  height?: number;
  /**
   * When provided the panel is rendered as a fixed popover anchored to this
   * bounding rect.  Without it the panel renders as an absolute tray (e.g.
   * sitting above the message-input bar).
   */
  anchorRect?: PopoverAnchorRect | null;
  /**
   * Extra CSS class(es) added to the panel surface element.
   * Use this to scope content-specific styles without duplicating chrome CSS.
   *
   * @example className="emote-picker"
   */
  className?: string;
  children: React.ReactNode;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ARROW_H = 8; // px height of the directional arrow
const GAP      = 6; // px gap between trigger and panel edge

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Generic floating panel that can act either as an inline tray (no anchorRect)
 * or as an anchored popover (with anchorRect).
 *
 * Responsibilities
 * ─────────────────
 * • Soft-3D surface class via SurfaceContext
 * • Backdrop dismiss when in popover mode
 * • iOS-style directional arrow pointing at the trigger
 * • ReactDOM.createPortal so `position: fixed` works inside CSS transforms
 *
 * Usage
 * ─────
 * For a picker that can be both a tray and a popover, pass `anchorRect` to switch.
 * Plugins / future panels just wrap their content in <PopoverPanel …>…</PopoverPanel>.
 */
const PopoverPanel: React.FC<PopoverPanelProps> = ({
  title,
  onClose,
  width = 360,
  height = 380,
  anchorRect,
  className,
  children,
}) => {
  const { soft3DEnabled } = useSurface();

  // ── Positioning calc ───────────────────────────────────────────────────────
  let panelStyle: React.CSSProperties = {};
  let arrowOffset = 0;
  let arrowAtBottom = true; // true → arrow at bottom (panel is above the button)

  const isPopover = Boolean(anchorRect);

  if (anchorRect) {
    // Centre the panel on the trigger button, clamped to viewport edges.
    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    left = Math.max(8, Math.min(window.innerWidth - width - 8, left));

    // Prefer opening above the trigger.
    let top = anchorRect.top - height - ARROW_H - GAP;
    arrowAtBottom = true;
    if (top < 8) {
      // Not enough room above — open below instead.
      top = anchorRect.top + anchorRect.height + ARROW_H + GAP;
      arrowAtBottom = false;
    }

    // Arrow offset relative to the panel's left edge (clamped to stay on-panel).
    arrowOffset = anchorRect.left + anchorRect.width / 2 - left;
    arrowOffset = Math.max(16, Math.min(width - 16, arrowOffset));

    panelStyle = {
      position: 'fixed',
      left,
      top,
      width,
      maxHeight: height,
      bottom: 'auto',
      right: 'auto',
    };
  }

  // ── Class assembly ─────────────────────────────────────────────────────────
  const panelClasses = [
    'popover-panel',
    isPopover ? 'popover-panel--popover' : '',
    soft3DEnabled ? 'soft-3d' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── Render tree ────────────────────────────────────────────────────────────
  const content = (
    <>
      {/* Transparent backdrop — click to dismiss when used as a popover. */}
      {isPopover && (
        <div className="popover-panel-backdrop" onClick={onClose} />
      )}

      <div
        className={panelClasses}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Directional arrow pointing at the trigger button. */}
        {isPopover && (
          <div
            className={`popover-panel-arrow popover-panel-arrow--${arrowAtBottom ? 'bottom' : 'top'}`}
            style={{ left: arrowOffset }}
          />
        )}

        {/* Header bar */}
        <div className="popover-panel-header">
          <h3>{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </Button>
        </div>

        {/* Picker-specific content */}
        {children}
      </div>
    </>
  );

  // Portal to document.body so position:fixed isn't clipped by transformed parents.
  return isPopover
    ? ReactDOM.createPortal(content, document.body)
    : content;
};

export default PopoverPanel;
