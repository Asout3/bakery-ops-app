import React from 'react';
import './ui.css';

/**
 * Button Component
 * 
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'link'} props.variant - Button style variant
 * @param {'sm' | 'md' | 'lg'} props.size - Button size
 * @param {boolean} props.fullWidth - Whether button takes full width
 * @param {boolean} props.loading - Shows loading spinner
 * @param {boolean} props.iconOnly - For icon-only buttons
 * @param {React.ReactNode} props.leftIcon - Icon to show before text
 * @param {React.ReactNode} props.rightIcon - Icon to show after text
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Button content
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  iconOnly = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) {
  const classNames = [
    'ui-btn',
    `ui-btn-${variant}`,
    `ui-btn-${size}`,
    fullWidth && 'ui-btn-full',
    iconOnly && 'ui-btn-icon',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className={`ui-spinner ui-spinner-sm ${variant === 'primary' || variant === 'danger' ? 'ui-spinner-white' : ''}`} />
          {!iconOnly && children}
        </>
      ) : (
        <>
          {leftIcon && <span className="ui-btn-icon-left">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="ui-btn-icon-right">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

export default Button;
