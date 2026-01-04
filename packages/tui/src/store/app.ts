import { create } from 'zustand';
import type { Repository, Run, AgentActivityEvent } from '../api/types.js';

interface AppState {
  // Active run
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;

  // Cached repositories
  repos: Repository[];
  setRepos: (repos: Repository[]) => void;
  reposLoaded: boolean;
  setReposLoaded: (loaded: boolean) => void;

  // Cached runs
  runs: Run[];
  setRuns: (runs: Run[]) => void;
  addRun: (run: Run) => void;
  updateRun: (id: string, updates: Partial<Run>) => void;

  // Active run activity log
  activities: AgentActivityEvent[];
  addActivity: (activity: AgentActivityEvent) => void;
  clearActivities: () => void;

  // UI state
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Reset
  reset: () => void;
}

const MAX_ACTIVITIES = 50;

export const useAppStore = create<AppState>((set) => ({
  // Active run
  activeRunId: null,
  setActiveRunId: (id) => set({ activeRunId: id }),

  // Cached repositories
  repos: [],
  setRepos: (repos) => set({ repos }),
  reposLoaded: false,
  setReposLoaded: (loaded) => set({ reposLoaded: loaded }),

  // Cached runs
  runs: [],
  setRuns: (runs) => set({ runs }),
  addRun: (run) =>
    set((state) => ({
      runs: [run, ...state.runs],
    })),
  updateRun: (id, updates) =>
    set((state) => ({
      runs: state.runs.map((run) =>
        run.id === id ? { ...run, ...updates } : run
      ),
    })),

  // Active run activity log
  activities: [],
  addActivity: (activity) =>
    set((state) => ({
      activities: [...state.activities, activity].slice(-MAX_ACTIVITIES),
    })),
  clearActivities: () => set({ activities: [] }),

  // UI state
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),

  // Reset
  reset: () =>
    set({
      activeRunId: null,
      repos: [],
      reposLoaded: false,
      runs: [],
      activities: [],
      isConnected: false,
    }),
}));
