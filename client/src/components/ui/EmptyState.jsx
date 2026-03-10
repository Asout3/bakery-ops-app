import React from 'react';
import './ui.css';

/**
 * EmptyState Component
 * Shows when there's no data to display
 * 
 * @param {Object} props
 * @param {string} props.title - Empty state title
 * @param {string} props.description - Empty state description
 * @param {React.ReactNode} props.icon - Optional custom icon
 * @param {React.ReactNode} props.action - Optional action button
 * @param {string} props.className - Additional CSS classes
 */
export function EmptyState({ 
  title = 'No data', 
  description, 
  icon,
  action,
  className = '', 
  ...props 
}) {
  const defaultIcon = (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
    </svg>
  );

  return (
    <div className={`ui-empty-state ${className}`} {...props}>
      <div className="ui-empty-state-icon">
        {icon || defaultIcon}
      </div>
      <h3 className="ui-empty-state-title">{title}</h3>
      {description && (
        <p className="ui-empty-state-description">{description}</p>
      )}
      {action}
    </div>
  );
}

export default EmptyState;
