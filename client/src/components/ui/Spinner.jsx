import React from 'react';
import './ui.css';

/**
 * Spinner Component
 * 
 * @param {Object} props
 * @param {'sm' | 'md' | 'lg' | 'xl'} props.size - Spinner size
 * @param {boolean} props.white - Use white color (for dark backgrounds)
 * @param {string} props.className - Additional CSS classes
 */
export function Spinner({ size = 'md', white = false, className = '', ...props }) {
  const classNames = [
    'ui-spinner',
    `ui-spinner-${size}`,
    white && 'ui-spinner-white',
    className
  ].filter(Boolean).join(' ');

  return (
    <span 
      className={classNames} 
      role="status" 
      aria-label="Loading"
      {...props}
    />
  );
}

/**
 * Loading Overlay - Full container loading state
 */
export function LoadingOverlay({ message = 'Loading...', className = '' }) {
  return (
    <div className={`ui-flex ui-flex-col ui-items-center ui-justify-center ui-gap-3 ${className}`} style={{ padding: '3rem' }}>
      <Spinner size="lg" />
      <span className="ui-text-muted">{message}</span>
    </div>
  );
}

export default Spinner;
