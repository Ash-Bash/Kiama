import React, { ReactNode } from 'react';
import '../styles/App.scss';

interface ModalPanelProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'accent';
  children: ReactNode;
  className?: string;
}

// Simple structured panel for modal content with consistent header/body/footer layout.
const ModalPanel: React.FC<ModalPanelProps> = ({
  title,
  description,
  icon,
  footer,
  tone = 'default',
  children,
  className = ''
}) => {
  return (
    <div className={`modal-panel tone-${tone} ${className}`.trim()}>
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
        {children}
      </div>
      {footer && <div className="modal-panel__footer">{footer}</div>}
    </div>
  );
};

export default ModalPanel;
