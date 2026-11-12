import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { api, ApiError, type Menu } from "./api"
import { weekStartOf } from "./util"

export const useRecipes = () => useQuery({ queryKey: ["recipes"], queryFn: api.recipes })
export const useIngredients = () => useQuery({ queryKey: ["ingredients"], queryFn: api.ingredients })
export const useMenus = () => useQuery({ queryKey: ["menus"], queryFn: api.menus })
export const useHousehold = () => useQuery({ queryKey: ["household"], queryFn: api.household })

/** The menu for a given week, or null when none exists yet. Polls so household edits show up. */
export function useMenuWeek(week: string, poll = true) {
  return useQuery({
    queryKey: ["menu", week],
    queryFn: async (): Promise<Menu | null> => {
      try { return await api.menuByWeek(week) } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e }
    },
    refetchInterval: poll ? 5000 : false,
  })
}

export const useGrocery = (menuId: string | undefined) =>
  useQuery({ queryKey: ["grocery", menuId], queryFn: () => api.grocery(menuId!), enabled: !!menuId, refetchInterval: 4000 })

export function useWeekParam() {
  const [sp, setSp] = useSearchParams()
  const week = sp.get("week") ?? weekStartOf()
  return [week, (w: string) => setSp(w === weekStartOf() ? {} : { week: w }, { replace: true })] as const
}

export function useMenuCache() {
  const qc = useQueryClient()
  return (m: Menu) => {
    qc.setQueryData(["menu", m.weekStart], m)
    qc.invalidateQueries({ queryKey: ["menus"] })
    qc.invalidateQueries({ queryKey: ["recipes"] })
    qc.invalidateQueries({ queryKey: ["grocery", m.id] })
  }
}
