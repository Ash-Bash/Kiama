import React from 'react';

export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  tintColor?: string;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  fullWidth = false,
  iconLeft,
  iconRight,
  className = '',
  children,
  type = 'button',
  tintColor,
  style,
  ...rest
}) => {
  const classes = [
    'btn',
    variant !== 'default' ? variant : '',
    size === 'sm' ? 'sm' : '',
    fullWidth ? 'block' : '',
    className
  ].filter(Boolean).join(' ');

  const styleVars = tintColor ? ({ '--btn-tint': tintColor } as React.CSSProperties) : undefined;
  const mergedStyle = styleVars || style ? { ...styleVars, ...style } : style;

  return (
    <button className={classes} type={type} style={mergedStyle} {...rest}>
      {iconLeft && <span className="btn-icon left">{iconLeft}</span>}
      <span className="btn-label">{children}</span>
      {iconRight && <span className="btn-icon right">{iconRight}</span>}
    </button>
  );
};

export default Button;
