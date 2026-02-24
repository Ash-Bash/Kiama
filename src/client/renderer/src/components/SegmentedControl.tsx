import React from 'react';

interface SegmentedOption<T extends string> {
  label: React.ReactNode;
  value: T;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

// Reusable segmented control that keeps the existing button structure and styling hooks.
const SegmentedControl = <T extends string>({ value, options, onChange, className = '' }: SegmentedControlProps<T>) => {
  return (
    <div className={["segmented", className].filter(Boolean).join(" ")}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'active' : ''}
          onClick={() => !option.disabled && onChange(option.value)}
          disabled={option.disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default SegmentedControl;
