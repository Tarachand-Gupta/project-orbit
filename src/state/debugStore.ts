/**
 * Central error/debug log store (Tech Doc §5.1). Every object error-boundary trip and
 * generation failure pushes a structured entry here. The top-right indicator badges the
 * unseen count; agents read the same log via the game API for self-correction.
 */

import { create } from "zustand";

export type LogPhase = "generate" | "validate" | "build" | "render" | "physics" | "runtime";

export interface DebugLogEntry {
  id: string;
  objectId?: string;
  prompt?: string;
  phase: LogPhase;
  message: string;
  stack?: string;
  timestamp: number;
  level: "error" | "warn" | "info";
}

export interface DebugState {
  logs: DebugLogEntry[];
  /** Number of entries the user has not yet viewed (drives the indicator badge). */
  unseen: number;
  push: (entry: Omit<DebugLogEntry, "id" | "timestamp"> & { timestamp?: number }) => DebugLogEntry;
  markAllSeen: () => void;
  clear: () => void;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `log_${counter}`;
}

const MAX_LOGS = 500;

export const useDebugStore = create<DebugState>((set) => ({
  logs: [],
  unseen: 0,
  push: (entry) => {
    const full: DebugLogEntry = {
      ...entry,
      id: nextId(),
      timestamp: entry.timestamp ?? Date.now(),
      level: entry.level ?? "error",
    };
    set((state) => {
      const logs = [full, ...state.logs].slice(0, MAX_LOGS);
      return { logs, unseen: state.unseen + 1 };
    });
    return full;
  },
  markAllSeen: () => set({ unseen: 0 }),
  clear: () => set({ logs: [], unseen: 0 }),
}));

/** Read the raw logs (used by the game API and agents). */
export function getLogs(): DebugLogEntry[] {
  return useDebugStore.getState().logs;
}

/** Imperative push usable outside React (loaders, async catch blocks). */
export function logError(entry: Omit<DebugLogEntry, "id" | "timestamp">): DebugLogEntry {
  return useDebugStore.getState().push(entry);
}
