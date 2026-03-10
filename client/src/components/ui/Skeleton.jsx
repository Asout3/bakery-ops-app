import React from 'react';
import './ui.css';

/**
 * Skeleton Component
 * 
 * @param {Object} props
 * @param {'text' | 'title' | 'avatar' | 'card' | 'button'} props.variant - Skeleton variant
 * @param {string} props.width - Custom width
 * @param {string} props.height - Custom height
 * @param {string} props.className - Additional CSS classes
 */
export function Skeleton({ 
  variant = 'text', 
  width, 
  height, 
  className = '',
  style = {},
  ...props 
}) {
  const variantClass = `ui-skeleton-${variant}`;
  const classNames = ['ui-skeleton', variant !== 'text' && variantClass, className].filter(Boolean).join(' ');

  const customStyle = {
    ...style,
    ...(width && { width }),
    ...(height && { height }),
  };

  return (
    <div 
      className={classNames} 
      style={customStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * Skeleton Text - Multiple lines of text
 */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          variant="text" 
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton Card - Card loading state
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`ui-card ${className}`}>
      <div className="ui-card-body">
        <Skeleton variant="title" />
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

/**
 * Skeleton Table Row
 */
export function SkeletonTableRow({ columns = 4, className = '' }) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} style={{ padding: '0.875rem 1rem' }}>
          <Skeleton variant="text" />
        </td>
      ))}
    </tr>
  );
}

export default Skeleton;
