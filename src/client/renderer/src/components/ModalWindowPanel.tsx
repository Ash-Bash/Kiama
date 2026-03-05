import React, { ReactNode } from 'react';
import '../styles/App.scss';

interface ModalWindowPanelProps {
  title?: string;
  aside?: ReactNode;
  asidePosition?: 'left' | 'right';
  asideWidth?: string;
  headerCentered?: boolean;
  footer?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

const ModalWindowPanel: React.FC<ModalWindowPanelProps> = ({
  title,
  aside,
  asidePosition = 'right',
  asideWidth = '320px',
  headerCentered = false,
  footer,
  onClose,
  children,
  className = ''
}) => {
  const sideClass = asidePosition === 'left' ? 'modal-window-panel--aside-left' : 'modal-window-panel--aside-right';

  return (
    <div className={`modal-window-panel ${sideClass} ${headerCentered ? 'modal-window-panel--header-centered' : ''} ${className}`.trim()} data-aside-width={asideWidth}>
      {onClose && (
        <button className="modal-window-panel__close" aria-label="Close" onClick={onClose}>×</button>
      )}

      {title && (
        <div className="modal-window-panel__header">
          <div className="modal-window-panel__titles">
            <h3>{title}</h3>
          </div>
        </div>
      )}

      <div className="modal-window-panel__body">
        <div className="modal-window-panel__aside" style={{ width: asideWidth }}>
          {aside}
        </div>
        <div className="modal-window-panel__main">{children}</div>
      </div>

      {footer && <div className="modal-window-panel__footer">{footer}</div>}
    </div>
  );
};

export default ModalWindowPanel;
