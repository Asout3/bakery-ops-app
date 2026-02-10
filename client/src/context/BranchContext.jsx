import { createContext, useContext, useMemo, useState } from 'react';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const [selectedLocationId, setSelectedLocationId] = useState(localStorage.getItem('selectedLocationId') || '');

  const setLocation = (locationId) => {
    setSelectedLocationId(locationId || '');
    if (locationId) {
      localStorage.setItem('selectedLocationId', String(locationId));
    } else {
      localStorage.removeItem('selectedLocationId');
    }
  };

  const value = useMemo(() => ({ selectedLocationId, setLocation }), [selectedLocationId]);
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error('useBranch must be used within BranchProvider');
  }
  return ctx;
}
