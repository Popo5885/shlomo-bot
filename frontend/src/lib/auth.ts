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
  isFullyActive: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      member: null,
      workspace: null,

      login: async (email: string, password: string) => {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

        let res: Response;
        try {
          res = await fetch(`${apiBase}/api/client/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
        } catch {
          // Network error (tunnel down, no internet, CORS pre-flight fail)
          const err = new Error("בעיית חיבור לשרת — בדוק אינטרנט ונסה שוב") as Error & { code?: string };
          err.code = "NETWORK_ERROR";
          throw err;
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const networkErr = new Error("תשובה לא תקינה מהשרת") as Error & { code?: string };
          networkErr.code = "NETWORK_ERROR";
          throw networkErr;
        }

        const json = await res.json();

        if (!res.ok || !json.success) {
          const loginErr = new Error(json.message || "ההתחברות נכשלה") as Error & { code?: string };
          loginErr.code = json.code ?? "AUTH_ERROR";
          throw loginErr;
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

      /** True if workspace is active AND contract is signed (or not required) */
      isFullyActive: () => {
        const { workspace } = get();
        if (!workspace) return false;
        if (workspace.status !== 'active') return false;
        if (!workspace.contract_signed || workspace.contract_revoked_at) return false;
        return true;
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
