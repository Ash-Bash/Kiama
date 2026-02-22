import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  inline?: boolean; // Toggle rendered before the label when true
  size?: 'default' | 'small';
  ariaLabel?: string;
}

const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
  inline = false,
  size = 'default',
  ariaLabel
}) => {
  const containerClass = ['toggle-row', inline ? 'inline' : '', className].filter(Boolean).join(' ');
  const toggleClass = ['ios-toggle', checked ? 'on' : 'off', size === 'small' ? 'small' : '', 'toggle-control']
    .filter(Boolean)
    .join(' ');

  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  const toggleButton = (
    <button
      type="button"
      className={toggleClass}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
      onClick={handleToggle}
      disabled={disabled}
    >
      <span className="thumb" />
    </button>
  );

  return (
    <div className={containerClass}>
      {inline && toggleButton}
      {(label || description) && (
        <div className="toggle-copy">
          {label && (typeof label === 'string' ? <span>{label}</span> : label)}
          {description && <p className="hint">{description}</p>}
        </div>
      )}
      {!inline && toggleButton}
    </div>
  );
};

export default Toggle;
