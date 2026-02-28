import React from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  tintColor?: string;
  // Optional suffix element (e.g. an inline button/icon) rendered inside the
  // field container immediately after the input so it can be positioned
  // visually inline with the input.
  suffix?: React.ReactNode;
}

const TextField: React.FC<TextFieldProps> = ({
  label,
  hint,
  error,
  containerClassName,
  className,
  tintColor,
  suffix,
  ...inputProps
}) => {
  const styleVars = tintColor ? ({ '--field-tint': tintColor } as React.CSSProperties) : undefined;
  const mergedStyle = styleVars || inputProps.style ? { ...styleVars, ...inputProps.style } : inputProps.style;
  return (
    <label className={`field ${containerClassName || ''}`.trim()}>
      {label && <span>{label}</span>}
      <div className="field__row">
        <input className={className} {...inputProps} style={mergedStyle} />
        {suffix && <div className="field__suffix">{suffix}</div>}
      </div>
      {hint && <small className="hint subtle">{hint}</small>}
      {error && <small className="error-text">{error}</small>}
    </label>
  );
};

export default TextField;
