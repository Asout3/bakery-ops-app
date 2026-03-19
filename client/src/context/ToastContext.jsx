import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle size={16} />,
  error:   <XCircle size={16} />,
  danger:  <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Info size={16} />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { id, type: 'info', duration: 4500, title: '', ...toast };
    setToasts((prev) => [...prev, next]);
    window.setTimeout(() => removeToast(id), next.duration);
  }, [removeToast]);

  const value = useMemo(() => ({
    pushToast,
    success: (message, opts = {}) => pushToast({ ...opts, type: 'success', message }),
    error:   (message, opts = {}) => pushToast({ ...opts, type: 'error',   message }),
    warning: (message, opts = {}) => pushToast({ ...opts, type: 'warning', message }),
    info:    (message, opts = {}) => pushToast({ ...opts, type: 'info',    message }),
  }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.type}`} role="alert">
            <div className="toast-accent" />
            <span className="toast-icon">{ICONS[toast.type] || ICONS.info}</span>
            <div className="toast-copy">
              {toast.title ? <div className="toast-title">{toast.title}</div> : null}
              <div className="toast-message">{toast.message}</div>
              {toast.actionLabel && typeof toast.onAction === 'function' ? (
                <button className="toast-action" onClick={() => toast.onAction()}>
                  {toast.actionLabel}
                </button>
              ) : null}
            </div>
            <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
