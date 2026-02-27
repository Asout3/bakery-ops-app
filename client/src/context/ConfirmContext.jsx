import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setState({
      title: options?.title || 'Please Confirm',
      message: options?.message || 'Are you sure?',
      confirmText: options?.confirmText || 'Confirm',
      cancelText: options?.cancelText || 'Cancel',
      variant: options?.variant || 'primary',
      resolve,
    });
  }), []);

  const handleClose = useCallback((value) => {
    if (!state) return;
    state.resolve(value);
    setState(null);
  }, [state]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state && (
        <div className="confirm-overlay" onClick={() => handleClose(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{state.title}</h3>
            <p>{state.message}</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => handleClose(false)}>{state.cancelText}</button>
              <button className={`btn btn-${state.variant}`} onClick={() => handleClose(true)}>{state.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
}
