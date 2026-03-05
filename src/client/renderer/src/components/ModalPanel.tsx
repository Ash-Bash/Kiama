import React, { ReactNode } from 'react';
import '../styles/App.scss';

interface ModalPanelProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  /** If provided, renders this content in an aside column (split layout) */
  aside?: ReactNode;
  /** Enable split (editor) layout where body is side-by-side */
  split?: boolean;
  /** If true, render the aside on the left and main on the right (editor layout) */
  asideLeft?: boolean;
  /** Show a close X button in the top-right of the panel */
  showClose?: boolean;
  /** Close handler for the optional close button */
  onClose?: () => void;
  /** Width of the aside column (CSS value, e.g. '320px' or '30%') */
  asideWidth?: string;
  tone?: 'default' | 'accent';
  /** Center the header title and hide the icon/description (editor use) */
  headerCentered?: boolean;
  children: ReactNode;
  className?: string;
}

// Simple structured panel for modal content with consistent header/body/footer layout.
const ModalPanel: React.FC<ModalPanelProps> = ({
  title,
  description,
  icon,
  footer,
  aside,
  split = false,
  asideWidth = '300px',
  tone = 'default',
  headerCentered = false,
  asideLeft = false,
  showClose = false,
  onClose,
  children,
  className = ''
}) => {
  return (
    <div className={`modal-panel tone-${tone} ${split ? 'modal-panel--split' : ''} ${headerCentered ? 'modal-panel--header-centered' : ''} ${asideLeft ? 'modal-panel--aside-left' : ''} ${className}`.trim()} data-aside-width={asideWidth}>
      {showClose && (
        <button className="modal-panel__close" aria-label="Close" onClick={onClose}>×</button>
      )}
      {(title || description || icon) && (
        <div className="modal-panel__header">
          {icon && <div className="modal-panel__icon">{icon}</div>}
          <div className="modal-panel__titles">
            {title && <h3>{title}</h3>}
            {description && <p>{description}</p>}
          </div>
        </div>
      )}
      <div className="modal-panel__body">
        <div className="modal-panel__main">{children}</div>
        {aside && (
          <div className="modal-panel__aside" style={{ width: asideWidth }}>
            {aside}
          </div>
        )}
      </div>
      {footer && <div className="modal-panel__footer">{footer}</div>}
    </div>
  );
};

export default ModalPanel;
