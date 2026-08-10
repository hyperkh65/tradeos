'use client';

import { createContext, useContext } from 'react';

interface SidebarContextValue {
  toggle: () => void;
  close: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>({
  toggle: () => {},
  close: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
