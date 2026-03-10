import React from 'react';
import './ui.css';

/**
 * Card Component
 * 
 * @param {Object} props
 * @param {'default' | 'accent' | 'flat'} props.variant - Card style variant
 * @param {boolean} props.hover - Enable hover effect
 * @param {string} props.className - Additional CSS classes
 */
export function Card({ variant = 'default', hover = false, className = '', children, ...props }) {
  const classNames = [
    'ui-card',
    variant === 'accent' && 'ui-card-accent',
    variant === 'flat' && 'ui-card-flat',
    hover && 'ui-card-hover',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
}

/**
 * Card Header Component
 */
export function CardHeader({ title, subtitle, children, className = '', ...props }) {
  return (
    <div className={`ui-card-header ${className}`} {...props}>
      {title && <h3 className="ui-card-header-title">{title}</h3>}
      {subtitle && <p className="ui-card-header-subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}

/**
 * Card Body Component
 */
export function CardBody({ className = '', children, ...props }) {
  return (
    <div className={`ui-card-body ${className}`} {...props}>
      {children}
    </div>
  );
}

/**
 * Card Footer Component
 */
export function CardFooter({ className = '', children, ...props }) {
  return (
    <div className={`ui-card-footer ${className}`} {...props}>
      {children}
    </div>
  );
}

export default Card;
