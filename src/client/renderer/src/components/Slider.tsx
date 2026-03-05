import React, { useCallback, useRef, useEffect } from 'react';
import '../styles/components/Slider.scss';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  ariaLabel?: string;
}

const Slider: React.FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className = '',
  ariaLabel = 'Slider'
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Calculate percentage for track fill
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const updateValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.min(1, Math.max(0, x / rect.width));
    const newValue = min + percent * (max - min);
    
    // Round to step
    const steppedValue = Math.round(newValue / step) * step;
    const clampedValue = Math.min(max, Math.max(min, steppedValue));
    
    onChange(clampedValue);
  }, [min, max, step, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    updateValue(e.clientX);
    document.body.style.userSelect = 'none';
  }, [updateValue]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    updateValue(e.clientX);
  }, [updateValue]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={trackRef}
      className={`ui-slider ${className}`.trim()}
      onMouseDown={handleMouseDown}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
    >
      <div className="ui-slider__track">
        <div className="ui-slider__fill" style={{ width: `${percentage}%` }} />
      </div>
      <div
        className="ui-slider__thumb"
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
};

export default Slider;
