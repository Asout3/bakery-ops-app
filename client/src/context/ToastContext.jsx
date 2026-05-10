import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const MAX_VISIBLE_TOASTS = 5;

const ICONS = {
  success: <CheckCircle size={16} />,
  error:   <XCircle size={16} />,
  danger:  <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Info size={16} />,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutIdsRef = useRef(new Map());
  const dedupeKeysRef = useRef(new Map());

  const clearToastTimeout = useCallback((id) => {
    const timeoutId = timeoutIdsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(id);
    }
  }, []);

  const removeToast = useCallback((id) => {
    clearToastTimeout(id);
    setToasts((prev) => {
      const existing = prev.find((toast) => toast.id === id);
      if (existing?.dedupeKey) {
        dedupeKeysRef.current.delete(existing.dedupeKey);
      }
      return prev.filter((toast) => toast.id !== id);
    });
  }, [clearToastTimeout]);

  const clearAllToasts = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current.clear();
    dedupeKeysRef.current.clear();
    setToasts([]);
  }, []);

  const scheduleToastRemoval = useCallback((id, duration) => {
    clearToastTimeout(id);
    timeoutIdsRef.current.set(
      id,
      window.setTimeout(() => {
        removeToast(id);
      }, duration)
    );
  }, [clearToastTimeout, removeToast]);

  const pushToast = useCallback((toast) => {
    const existingId = toast.dedupeKey ? dedupeKeysRef.current.get(toast.dedupeKey) : null;
    const id = existingId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = { id, type: 'info', duration: 10000, title: '', ...toast };

    setToasts((prev) => {
      if (existingId) {
        return prev.map((item) => (item.id === existingId ? { ...item, ...next, id: existingId } : item));
      }
      const nextStack = [...prev, next];
      if (nextStack.length <= MAX_VISIBLE_TOASTS) {
        return nextStack;
      }
      const overflowCount = nextStack.length - MAX_VISIBLE_TOASTS;
      const removed = nextStack.slice(0, overflowCount);
      removed.forEach((item) => {
        clearToastTimeout(item.id);
        if (item?.dedupeKey) {
          dedupeKeysRef.current.delete(item.dedupeKey);
        }
      });
      return nextStack.slice(-MAX_VISIBLE_TOASTS);
    });

    if (next.dedupeKey) {
      dedupeKeysRef.current.set(next.dedupeKey, id);
    }
    scheduleToastRemoval(id, next.duration);
  }, [clearToastTimeout, scheduleToastRemoval]);

  useEffect(() => () => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current.clear();
    dedupeKeysRef.current.clear();
  }, []);

  const value = useMemo(() => ({
    pushToast,
    clearAll: clearAllToasts,
    success: (message, opts = {}) => pushToast({ ...opts, type: 'success', message }),
    error:   (message, opts = {}) => pushToast({ ...opts, type: 'error',   message }),
    warning: (message, opts = {}) => pushToast({ ...opts, type: 'warning', message }),
    info:    (message, opts = {}) => pushToast({ ...opts, type: 'info',    message }),
  }), [clearAllToasts, pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.type}`}
            role="alert"
            style={{ '--toast-duration': `${toast.duration}ms` }}
          >
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
            <div className="toast-progress" aria-hidden="true" />
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
