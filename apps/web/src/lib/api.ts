export interface User { id: string; email: string; name: string; householdId: string }
export interface Member { id: string; name: string; email: string }
export interface Household { id: string; name: string; inviteCode: string; members: Member[] }
export interface Ingredient { id: string; name: string; unit: string; category: string; unitCost: number | null }
export interface RecipeIngredient {
  ingredientId: string; name: string; unit: string; category: string
  unitCost: number | null; quantity: number; note: string
}
export interface Recipe {
  id: string; name: string; description: string; mealType: string; tags: string[]
  prepMinutes: number; cookMinutes: number; servings: number; instructions: string
  avoid: boolean; ingredients: RecipeIngredient[]; estCost: number | null
  timesPlanned: number; timesCooked: number; lastPlanned: string | null
}
export type RecipeInput = Omit<Recipe, "id" | "avoid" | "estCost" | "timesPlanned" | "timesCooked" | "lastPlanned" | "ingredients"> & {
  ingredients: { ingredientId: string; quantity: number; note: string }[]
}
export type MealStatus = "planned" | "cooked" | "skipped"
export interface Meal {
  id: string; recipeId: string; name: string; mealType: string; tags: string[]
  day: number | null; slot: string; status: MealStatus; estCost: number | null; minutes: number
}
export interface Menu {
  id: string; title: string; weekStart: string; status: "draft" | "shopping" | "complete"
  budget: number | null; notes: string; meals: Meal[]
  estCost: number; mealsCost: number; extrasCost: number; itemCount: number; checkedCount: number
}
export interface GroceryItem {
  id: string; menuId: string; ingredientId: string | null; name: string; quantity: number
  unit: string; category: string; unitCost: number | null; checked: boolean
  checkedBy: string | null; source: "menu" | "extra"
}
export interface Grocery {
  items: GroceryItem[]; total: number; remaining: number; checked: number; count: number; menuStatus: string
}
export interface Suggestion { recipe: Recipe; score: number; reasons: string[] }
export interface CountItem { id?: string; name: string; count: number; cost: number }
export interface WeekStat {
  weekStart: string; meals: number; cooked: number; skipped: number; mealsCost: number
  extrasCost: number; budget: number | null; items: number; checked: number; byCategory: Record<string, number>
}
export interface Stats {
  weeks: number; weekly: WeekStat[]; topRecipes: CountItem[]; tags: CountItem[]
  mealTypes: CountItem[]; categories: CountItem[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

// Respects the build-time base path, so it works at "/" and under "/cart-blanche/".
const API = `${import.meta.env.BASE_URL}api`

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong")
  return data as T
}

const get = <T,>(p: string) => req<T>("GET", p)
const post = <T,>(p: string, b?: unknown) => req<T>("POST", p, b ?? {})
const patch = <T,>(p: string, b: unknown) => req<T>("PATCH", p, b)
const put = <T,>(p: string, b: unknown) => req<T>("PUT", p, b)
const del = <T,>(p: string) => req<T>("DELETE", p)

export const api = {
  config: () => get<{ registration: "open" | "invite" | "closed" }>("/config"),
  me: () => get<User>("/me"),
  login: (email: string, password: string) => post<User>("/auth/login", { email, password }),
  register: (b: { email: string; password: string; name: string; inviteCode?: string; registrationCode?: string }) => post<User>("/auth/register", b),
  logout: () => post<void>("/auth/logout"),

  household: () => get<Household>("/household"),
  renameHousehold: (name: string) => patch<Household>("/household", { name }),
  joinHousehold: (code: string) => post<Household>("/household/join", { code }),
  resetInvite: () => post<Household>("/household/invite-code/reset"),

  ingredients: () => get<Ingredient[]>("/ingredients"),
  createIngredient: (i: Omit<Ingredient, "id">) => post<Ingredient>("/ingredients", i),
  updateIngredient: (i: Ingredient) => put<Ingredient>(`/ingredients/${i.id}`, i),
  deleteIngredient: (id: string) => del<void>(`/ingredients/${id}`),

  recipes: () => get<Recipe[]>("/recipes"),
  recipe: (id: string) => get<Recipe>(`/recipes/${id}`),
  createRecipe: (r: RecipeInput) => post<Recipe>("/recipes", r),
  updateRecipe: (id: string, r: RecipeInput) => put<Recipe>(`/recipes/${id}`, r),
  deleteRecipe: (id: string) => del<void>(`/recipes/${id}`),
  setAvoid: (id: string, avoid: boolean) => patch<{ avoid: boolean }>(`/recipes/${id}/avoid`, { avoid }),

  menus: () => get<Menu[]>("/menus"),
  menuByWeek: (week: string) => get<Menu>(`/menu-by-week/${week}`),
  createMenu: (weekStart: string) => post<Menu>("/menus", { weekStart }),
  updateMenu: (id: string, b: Partial<Pick<Menu, "title" | "status" | "notes" | "budget">> & { clearBudget?: boolean }) =>
    patch<Menu>(`/menus/${id}`, b),
  deleteMenu: (id: string) => del<void>(`/menus/${id}`),
  addMeal: (menuId: string, recipeId: string, day?: number | null) =>
    post<Menu>(`/menus/${menuId}/meals`, { recipeId, day: day ?? null }),
  updateMeal: (id: string, b: { day?: number; clearDay?: boolean; status?: MealStatus }) => patch<Menu>(`/meals/${id}`, b),
  deleteMeal: (id: string) => del<Menu>(`/meals/${id}`),

  grocery: (menuId: string) => get<Grocery>(`/menus/${menuId}/grocery`),
  generateGrocery: (menuId: string) => post<Grocery>(`/menus/${menuId}/grocery/generate`),
  addItem: (menuId: string, b: { name: string; quantity?: number; unit?: string; category?: string; unitCost?: number | null }) =>
    post<Grocery>(`/menus/${menuId}/grocery/items`, b),
  updateItem: (id: string, b: { checked?: boolean; name?: string; quantity?: number; unitCost?: number; clearCost?: boolean; category?: string }) =>
    patch<Grocery>(`/grocery-items/${id}`, b),
  deleteItem: (id: string) => del<Grocery>(`/grocery-items/${id}`),

  recommend: (p: { count?: number; mealType?: string; include?: string[]; exclude?: string[]; maxMinutes?: number; skip?: string[]; nonce?: number }) => {
    const q = new URLSearchParams()
    if (p.count) q.set("count", String(p.count))
    if (p.mealType) q.set("mealType", p.mealType)
    if (p.include?.length) q.set("include", p.include.join(","))
    if (p.exclude?.length) q.set("exclude", p.exclude.join(","))
    if (p.maxMinutes) q.set("maxMinutes", String(p.maxMinutes))
    if (p.skip?.length) q.set("skip", p.skip.join(","))
    return get<Suggestion[]>(`/recommendations?${q}`)
  },
  stats: (weeks = 12) => get<Stats>(`/stats?weeks=${weeks}`),
}
