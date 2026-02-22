import React from 'react';

interface Option {
  value: string | number;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: Option[];
  className?: string;
}

const Select: React.FC<SelectProps> = ({ options, children, className = '', ...rest }) => {
  return (
    <div className={['ui-select', className].filter(Boolean).join(' ')}>
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
