import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkspaceTab {
  id: string;
  /** Full in-app href: pathname + search (e.g. /chat?session=abc). */
  path: string;
}

interface WorkspaceTabsState {
  tabs: WorkspaceTab[];
  activeId: string;
  sidebarCollapsed: boolean;
  /** Navigation happened in the active tab — keep its path current. */
  syncActivePath: (path: string) => void;
  activate: (id: string) => WorkspaceTab | undefined;
  openTab: (path?: string) => WorkspaceTab;
  /** Returns the tab to navigate to when the active tab was closed, else null. */
  closeTab: (id: string) => WorkspaceTab | null;
  toggleSidebar: () => void;
}

let counter = 0;
const newId = () => `wt-${Date.now().toString(36)}-${counter++}`;

export const useWorkspaceTabs = create<WorkspaceTabsState>()(
  persist(
    (set, get) => ({
      tabs: [{ id: "wt-initial", path: "/" }],
      activeId: "wt-initial",
      sidebarCollapsed: false,
      syncActivePath: (path) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, path } : t)),
        })),
      activate: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (tab) set({ activeId: id });
        return tab;
      },
      openTab: (path = "/") => {
        const tab: WorkspaceTab = { id: newId(), path };
        set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
        return tab;
      },
      closeTab: (id) => {
        const { tabs, activeId } = get();
        if (tabs.length === 1) return null;
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < 0) return null;
        const next = tabs.filter((t) => t.id !== id);
        if (id !== activeId) {
          set({ tabs: next });
          return null;
        }
        const neighbor = next[Math.min(idx, next.length - 1)]!;
        set({ tabs: next, activeId: neighbor.id });
        return neighbor;
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "sparstrow.workspace-tabs" },
  ),
);
