import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import './ToastContext.css';

const ToastContext = createContext(null);

// Toast Icons
const ToastIcons = {
  success: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  danger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
};

// Single Toast Component
function Toast({ toast, onRemove }) {
  const [isExiting, setIsExiting] = useState(false);

  const handleRemove = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 200); // Match animation duration
  }, [toast.id, onRemove]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRemove();
    }, toast.duration);

    return () => clearTimeout(timer);
  }, [toast.duration, handleRemove]);

  return (
    <div 
      className={`toast-item toast-${toast.type} ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      role="alert"
    >
      <span className="toast-icon">{ToastIcons[toast.type]}</span>
      <div className="toast-content">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      <button 
        className="toast-close" 
        onClick={handleRemove}
        aria-label="Close notification"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const MAX_TOASTS = 5;

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Longer duration for errors
    const defaultDuration = toast.type === 'danger' ? 5000 : 4000;
    const next = { id, type: 'info', duration: defaultDuration, ...toast };
    
    setToasts((prev) => {
      // Keep only last MAX_TOASTS - 1 to make room for new one
      const trimmed = prev.slice(-(MAX_TOASTS - 1));
      return [...trimmed, next];
    });
  }, []);

  const value = useMemo(() => ({
    pushToast,
    success: (message, options = {}) => pushToast({ ...options, type: 'success', message }),
    error: (message, options = {}) => pushToast({ ...options, type: 'danger', message }),
    warning: (message, options = {}) => pushToast({ ...options, type: 'warning', message }),
    info: (message, options = {}) => pushToast({ ...options, type: 'info', message }),
  }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
