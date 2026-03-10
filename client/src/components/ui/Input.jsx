import React from 'react';
import './ui.css';

/**
 * Input Component
 * 
 * @param {Object} props
 * @param {string} props.label - Input label
 * @param {string} props.error - Error message
 * @param {boolean} props.required - Whether field is required
 * @param {'sm' | 'md' | 'lg'} props.size - Input size
 * @param {React.ReactNode} props.leftIcon - Icon to show on left
 * @param {React.ReactNode} props.rightIcon - Icon to show on right
 * @param {string} props.className - Additional CSS classes for input
 * @param {string} props.wrapperClassName - Additional CSS classes for wrapper
 */
export function Input({
  label,
  error,
  required = false,
  size = 'md',
  leftIcon,
  rightIcon,
  className = '',
  wrapperClassName = '',
  id,
  ...props
}) {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  const inputClassNames = [
    'ui-input',
    size !== 'md' && `ui-input-${size}`,
    leftIcon && 'ui-input-with-icon-left',
    rightIcon && 'ui-input-with-icon-right',
    error && 'ui-input-error',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={`ui-input-wrapper ${wrapperClassName}`}>
      {label && (
        <label htmlFor={inputId} className="ui-input-label">
          {label}
          {required && <span className="ui-input-required">*</span>}
        </label>
      )}
      <div className="ui-input-container">
        {leftIcon && (
          <span className="ui-input-icon ui-input-icon-left">{leftIcon}</span>
        )}
        <input
          id={inputId}
          className={inputClassNames}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {rightIcon && (
          <span className="ui-input-icon ui-input-icon-right">{rightIcon}</span>
        )}
      </div>
      {error && (
        <span id={`${inputId}-error`} className="ui-input-error-message" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </span>
      )}
    </div>
  );
}

export default Input;
