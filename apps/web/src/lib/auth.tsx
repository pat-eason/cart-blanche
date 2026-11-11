import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, useContext, type ReactNode } from "react"
import { api, ApiError, type User } from "./api"

interface Ctx { user: User | null; loading: boolean; refresh: () => void; setUser: (u: User) => void; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ user: null, loading: true, refresh: () => {}, setUser: () => {}, logout: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const dropData = () => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" })
  const q = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try { return await api.me() } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e }
    },
    staleTime: Infinity, retry: false,
  })
  const value: Ctx = {
    user: q.data ?? null,
    loading: q.isLoading,
    refresh: () => { dropData(); qc.invalidateQueries({ queryKey: ["me"] }) },
    setUser: (u) => { dropData(); qc.setQueryData(["me"], u) },
    logout: async () => { await api.logout(); dropData(); qc.setQueryData(["me"], null) },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)
