import { create } from 'zustand';
import type { AppSession, AppUser } from '@/lib/types';

type AuthState = {
  session: AppSession | null;
  user: AppUser | null;
  hydrated: boolean;
  setSession: (session: AppSession | null) => void;
  setUser: (user: AppUser | null) => void;
  hydrate: () => void;
  logout: () => void;
};

const storageKey = 'saas-pagamentos-pix-auth';

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  hydrated: false,
  setSession: (session) => {
    set((state) => {
      const nextState = { ...state, session };
      localStorage.setItem(storageKey, JSON.stringify({ session, user: state.user }));
      return nextState;
    });
  },
  setUser: (user) => {
    set((state) => {
      const nextState = { ...state, user };
      localStorage.setItem(storageKey, JSON.stringify({ session: state.session, user }));
      return nextState;
    });
  },
  hydrate: () => {
    const raw = localStorage.getItem(storageKey);

    if (!raw) {
      set({ hydrated: true });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { session: AppSession | null; user: AppUser | null };
      set({
        session: parsed.session,
        user: parsed.user,
        hydrated: true,
      });
    } catch {
      localStorage.removeItem(storageKey);
      set({ session: null, user: null, hydrated: true });
    }
  },
  logout: () => {
    localStorage.removeItem(storageKey);
    set({
      session: null,
      user: null,
      hydrated: true,
    });
  },
}));
