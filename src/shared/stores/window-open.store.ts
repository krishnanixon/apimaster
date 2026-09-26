import { create } from 'zustand'

interface WindowOpenState {
  active: boolean
  message: string
  begin: (message: string) => void
  end: () => void
}

/** Optimistic feedback while Electron creates / focuses another window. */
export const useWindowOpenStore = create<WindowOpenState>((set) => ({
  active: false,
  message: 'Opening…',
  begin: (message) => set({ active: true, message }),
  end: () => set({ active: false })
}))
