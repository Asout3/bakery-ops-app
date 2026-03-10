import React from 'react';
import './ui.css';

/**
 * FormField Component - Wraps inputs with label, error display, and validation states
 * 
 * @param {Object} props
 * @param {string} props.label - Field label
 * @param {string} props.error - Error message
 * @param {boolean} props.required - Whether field is required
 * @param {string} props.hint - Optional hint text
 * @param {string} props.className - Additional CSS classes
 */
export function FormField({
  label,
  error,
  required = false,
  hint,
  className = '',
  children,
  htmlFor,
  ...props
}) {
  return (
    <div className={`ui-form-field ${className}`} {...props}>
      {label && (
        <label htmlFor={htmlFor} className="ui-input-label">
          {label}
          {required && <span className="ui-input-required">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <span className="ui-input-hint">{hint}</span>
      )}
      {error && (
        <span className="ui-input-error-message" role="alert">
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

export default FormField;
