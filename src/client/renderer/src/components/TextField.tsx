import React from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  tintColor?: string;
}

const TextField: React.FC<TextFieldProps> = ({
  label,
  hint,
  error,
  containerClassName,
  className,
  tintColor,
  ...inputProps
}) => {
  const styleVars = tintColor ? ({ '--field-tint': tintColor } as React.CSSProperties) : undefined;
  const mergedStyle = styleVars || inputProps.style ? { ...styleVars, ...inputProps.style } : inputProps.style;
  return (
    <label className={`field ${containerClassName || ''}`.trim()}>
      {label && <span>{label}</span>}
      <input className={className} {...inputProps} style={mergedStyle} />
      {hint && <small className="hint subtle">{hint}</small>}
      {error && <small className="error-text">{error}</small>}
    </label>
  );
};

export default TextField;
