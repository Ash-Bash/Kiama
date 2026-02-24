import React from 'react';
import '../styles/components/ColorPicker.scss';

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  tintColor?: string;
}

// Reusable color picker styled to match Modern Surface controls.
const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange, disabled = false, className = '', tintColor }) => {
  const classes = ['color-picker', 'field', className].filter(Boolean).join(' ');
  const styleVars = tintColor ? ({ '--color-picker-tint': tintColor } as React.CSSProperties) : undefined;

  return (
    <label className={classes} style={styleVars}>
      {label && <span>{label}</span>}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label || 'Color picker'}
        style={{ background: value }}
      />
    </label>
  );
};

export default ColorPicker;
