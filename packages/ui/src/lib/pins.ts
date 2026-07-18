import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PinnedItem {
  /** Stable key: "<kind>:<id>" — also the dnd-kit sortable id. */
  key: string;
  kind: "project" | "run" | "team" | "agent" | "page";
  label: string;
  /** Router href, e.g. /projects/abc123. */
  to: string;
}

interface PinsState {
  pins: PinnedItem[];
  pin: (item: PinnedItem) => void;
  unpin: (key: string) => void;
  reorder: (fromKey: string, toKey: string) => void;
  isPinned: (key: string) => boolean;
}

export const usePins = create<PinsState>()(
  persist(
    (set, get) => ({
      pins: [],
      pin: (item) =>
        set((s) =>
          s.pins.some((p) => p.key === item.key) ? s : { pins: [...s.pins, item] },
        ),
      unpin: (key) => set((s) => ({ pins: s.pins.filter((p) => p.key !== key) })),
      reorder: (fromKey, toKey) =>
        set((s) => {
          const from = s.pins.findIndex((p) => p.key === fromKey);
          const to = s.pins.findIndex((p) => p.key === toKey);
          if (from < 0 || to < 0 || from === to) return s;
          const next = [...s.pins];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved!);
          return { pins: next };
        }),
      isPinned: (key) => get().pins.some((p) => p.key === key),
    }),
    { name: "sparstrow.pins" },
  ),
);

export const pinKey = (kind: PinnedItem["kind"], id: string) => `${kind}:${id}`;
