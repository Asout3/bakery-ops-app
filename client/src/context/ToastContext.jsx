import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { id, type: 'info', duration: 4000, ...toast };
    setToasts((prev) => [...prev, next]);
    window.setTimeout(() => removeToast(id), next.duration);
  }, [removeToast]);

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
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.type}`}>
            <div>{toast.message}</div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>×</button>
          </div>
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
