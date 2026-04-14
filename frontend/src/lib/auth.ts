"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LoginResponse, Workspace, WorkspaceMember } from "@/types/api";

interface AuthState {
  token: string | null;
  member: WorkspaceMember | null;
  workspace: Workspace | null;

  login: (email: string, password: string) => Promise<void>;
  setSession: (data: LoginResponse) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      member: null,
      workspace: null,

      login: async (email: string, password: string) => {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(`${apiBase}/api/client/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("שגיאת חיבור לשרת");
        }

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.message || "Login failed");
        }

        const data = json.data as LoginResponse;
        set({
          token: data.token,
          member: data.member,
          workspace: data.workspace,
        });
      },

      setSession: (data: LoginResponse) => {
        set({
          token: data.token,
          member: data.member,
          workspace: data.workspace,
        });
      },

      logout: () => {
        set({ token: null, member: null, workspace: null });
      },

      isAuthenticated: () => {
        return get().token !== null;
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        token: state.token,
        member: state.member,
        workspace: state.workspace,
      }),
    }
  )
);
