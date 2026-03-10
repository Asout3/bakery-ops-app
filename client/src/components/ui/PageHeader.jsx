import React from 'react';
import './ui.css';

/**
 * PageHeader Component
 * Consistent page header with title, subtitle, and action buttons
 * 
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} props.subtitle - Optional subtitle
 * @param {React.ReactNode} props.actions - Action buttons
 * @param {string} props.className - Additional CSS classes
 */
export function PageHeader({ title, subtitle, actions, className = '', children, ...props }) {
  return (
    <div className={`ui-page-header ${className}`} {...props}>
      <div className="ui-page-header-row">
        <div>
          <h1 className="ui-page-title">{title}</h1>
          {subtitle && <p className="ui-page-subtitle">{subtitle}</p>}
        </div>
        {actions && (
          <div className="ui-page-actions">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export default PageHeader;
