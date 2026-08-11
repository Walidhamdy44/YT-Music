import { create } from "zustand";
import type { OfflineFolder } from "@/lib/offlineFolderStore";

interface FolderState {
  folders: OfflineFolder[];
  setFolders: (folders: OfflineFolder[]) => void;
  addFolder: (folder: OfflineFolder) => void;
  updateFolder: (folder: OfflineFolder) => void;
  removeFolder: (id: string) => void;
}

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],
  setFolders: (folders) => set({ folders }),
  addFolder: (folder) =>
    set((s) => ({ folders: [...s.folders, folder] })),
  updateFolder: (folder) =>
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folder.id ? folder : f)),
    })),
  removeFolder: (id) =>
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),
}));
