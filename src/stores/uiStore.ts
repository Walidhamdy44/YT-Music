import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  // Player UI state
  isFullscreenPlayer: boolean;
  isQueueOpen: boolean;
  isSidebarCollapsed: boolean;

  // Search
  searchQuery: string;
  searchHistory: string[];

  // Actions
  toggleFullscreenPlayer: () => void;
  setFullscreenPlayer: (open: boolean) => void;
  toggleQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSearchQuery: (query: string) => void;
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isFullscreenPlayer: false,
      isQueueOpen: false,
      isSidebarCollapsed: false,
      searchQuery: "",
      searchHistory: [],

      toggleFullscreenPlayer: () =>
        set((state) => ({ isFullscreenPlayer: !state.isFullscreenPlayer })),
      setFullscreenPlayer: (open) => set({ isFullscreenPlayer: open }),
      toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
      setQueueOpen: (open) => set({ isQueueOpen: open }),
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed) =>
        set({ isSidebarCollapsed: collapsed }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      addToSearchHistory: (query) =>
        set((state) => ({
          searchHistory: [
            query,
            ...state.searchHistory.filter((q) => q !== query),
          ].slice(0, 20),
        })),
      clearSearchHistory: () => set({ searchHistory: [] }),
    }),
    {
      name: "ytmusic-ui",
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        searchHistory: state.searchHistory,
      }),
    }
  )
);
