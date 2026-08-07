'use client';

import { createContext, useContext } from 'react';

interface SidebarContextValue {
  toggle: () => void;
  close: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>({
  toggle: () => {},
  close: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
