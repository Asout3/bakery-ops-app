import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';

/**
 * Modal Component
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Function to call when modal closes
 * @param {string} props.title - Modal title
 * @param {'sm' | 'md' | 'lg' | 'xl'} props.size - Modal size
 * @param {boolean} props.closeOnOverlay - Whether clicking overlay closes modal
 * @param {boolean} props.showCloseButton - Whether to show close button
 * @param {string} props.className - Additional CSS classes
 */
export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  closeOnOverlay = true,
  showCloseButton = true,
  className = '',
  children,
  footer,
  ...props
}) {
  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClass = size !== 'md' ? `ui-modal-${size}` : '';

  const modalContent = (
    <div 
      className="ui-modal-overlay" 
      onClick={closeOnOverlay ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div 
        className={`ui-modal ${sizeClass} ${className}`}
        onClick={e => e.stopPropagation()}
        {...props}
      >
        {(title || showCloseButton) && (
          <div className="ui-modal-header">
            {title && <h2 id="modal-title" className="ui-modal-title">{title}</h2>}
            {showCloseButton && (
              <button 
                className="ui-modal-close" 
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="ui-modal-body">
          {children}
        </div>
        {footer && (
          <div className="ui-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default Modal;
