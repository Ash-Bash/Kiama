import React, { createContext, useContext } from 'react';

interface SurfaceContextValue {
  soft3DEnabled: boolean;
}

const SurfaceContext = createContext<SurfaceContextValue>({ soft3DEnabled: false });

export const SurfaceProvider: React.FC<{ soft3DEnabled: boolean; children: React.ReactNode }> = ({
  soft3DEnabled,
  children,
}) => (
  <SurfaceContext.Provider value={{ soft3DEnabled }}>
    {children}
  </SurfaceContext.Provider>
);

/** Read the current soft-3D surface mode from anywhere in the tree. */
export const useSurface = () => useContext(SurfaceContext);
