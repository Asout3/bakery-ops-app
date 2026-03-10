import React from 'react';
import './ui.css';

/**
 * Select Component
 * 
 * @param {Object} props
 * @param {string} props.label - Select label
 * @param {string} props.error - Error message
 * @param {boolean} props.required - Whether field is required
 * @param {'sm' | 'md'} props.size - Select size
 * @param {Array<{value: string, label: string}>} props.options - Select options
 * @param {string} props.placeholder - Placeholder text for empty option
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.wrapperClassName - Additional CSS classes for wrapper
 */
export function Select({
  label,
  error,
  required = false,
  size = 'md',
  options = [],
  placeholder,
  className = '',
  wrapperClassName = '',
  id,
  children,
  ...props
}) {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  
  const selectClassNames = [
    'ui-select',
    size === 'sm' && 'ui-select-sm',
    error && 'ui-select-error',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={`ui-input-wrapper ${wrapperClassName}`}>
      {label && (
        <label htmlFor={selectId} className="ui-input-label">
          {label}
          {required && <span className="ui-input-required">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={selectClassNames}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${selectId}-error` : undefined}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children || options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={`${selectId}-error`} className="ui-input-error-message" role="alert">
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

export default Select;
