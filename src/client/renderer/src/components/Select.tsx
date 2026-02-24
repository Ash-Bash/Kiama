import React from 'react';

interface Option {
  value: string | number;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: Option[];
  className?: string;
  tintColor?: string;
}

const Select: React.FC<SelectProps> = ({ options, children, className = '', tintColor, style, ...rest }) => {
  const styleVars = tintColor ? ({ '--select-tint': tintColor } as React.CSSProperties) : undefined;
  const mergedStyle = styleVars || style ? { ...styleVars, ...style } : style;

  return (
    <div className={['ui-select', className].filter(Boolean).join(' ')} style={mergedStyle}>
      <select {...rest}>
        {options?.map(option => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        )) || children}
      </select>
      <span className="ui-select-arrow" aria-hidden="true" />
    </div>
  );
};

export default Select;
