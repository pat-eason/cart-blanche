export interface User { id: number; email: string; name: string; householdId: number }
export interface Member { id: number; name: string; email: string }
export interface Household { id: number; name: string; inviteCode: string; members: Member[] }
export interface Ingredient { id: number; name: string; unit: string; category: string; unitCost: number | null }
export interface RecipeIngredient {
  ingredientId: number; name: string; unit: string; category: string
  unitCost: number | null; quantity: number; note: string
}
export interface Recipe {
  id: number; name: string; description: string; mealType: string; tags: string[]
  prepMinutes: number; cookMinutes: number; servings: number; instructions: string
  avoid: boolean; ingredients: RecipeIngredient[]; estCost: number | null
  timesPlanned: number; timesCooked: number; lastPlanned: string | null
}
export type RecipeInput = Omit<Recipe, "id" | "avoid" | "estCost" | "timesPlanned" | "timesCooked" | "lastPlanned" | "ingredients"> & {
  ingredients: { ingredientId: number; quantity: number; note: string }[]
}
export type MealStatus = "planned" | "cooked" | "skipped"
export interface Meal {
  id: number; recipeId: number; name: string; mealType: string; tags: string[]
  day: number | null; slot: string; status: MealStatus; estCost: number | null; minutes: number
}
export interface Menu {
  id: number; title: string; weekStart: string; status: "draft" | "shopping" | "complete"
  budget: number | null; notes: string; meals: Meal[]
  estCost: number; mealsCost: number; extrasCost: number; itemCount: number; checkedCount: number
}
export interface GroceryItem {
  id: number; menuId: number; ingredientId: number | null; name: string; quantity: number
  unit: string; category: string; unitCost: number | null; checked: boolean
  checkedBy: string | null; source: "menu" | "extra"
}
export interface Grocery {
  items: GroceryItem[]; total: number; remaining: number; checked: number; count: number; menuStatus: string
}
export interface Suggestion { recipe: Recipe; score: number; reasons: string[] }
export interface CountItem { id?: number; name: string; count: number; cost: number }
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
  me: () => get<User>("/me"),
  login: (email: string, password: string) => post<User>("/auth/login", { email, password }),
  register: (b: { email: string; password: string; name: string; inviteCode?: string }) => post<User>("/auth/register", b),
  logout: () => post<void>("/auth/logout"),

  household: () => get<Household>("/household"),
  renameHousehold: (name: string) => patch<Household>("/household", { name }),
  joinHousehold: (code: string) => post<Household>("/household/join", { code }),
  resetInvite: () => post<Household>("/household/invite-code/reset"),

  ingredients: () => get<Ingredient[]>("/ingredients"),
  createIngredient: (i: Omit<Ingredient, "id">) => post<Ingredient>("/ingredients", i),
  updateIngredient: (i: Ingredient) => put<Ingredient>(`/ingredients/${i.id}`, i),
  deleteIngredient: (id: number) => del<void>(`/ingredients/${id}`),

  recipes: () => get<Recipe[]>("/recipes"),
  recipe: (id: number) => get<Recipe>(`/recipes/${id}`),
  createRecipe: (r: RecipeInput) => post<Recipe>("/recipes", r),
  updateRecipe: (id: number, r: RecipeInput) => put<Recipe>(`/recipes/${id}`, r),
  deleteRecipe: (id: number) => del<void>(`/recipes/${id}`),
  setAvoid: (id: number, avoid: boolean) => patch<{ avoid: boolean }>(`/recipes/${id}/avoid`, { avoid }),

  menus: () => get<Menu[]>("/menus"),
  menuByWeek: (week: string) => get<Menu>(`/menu-by-week/${week}`),
  createMenu: (weekStart: string) => post<Menu>("/menus", { weekStart }),
  updateMenu: (id: number, b: Partial<Pick<Menu, "title" | "status" | "notes" | "budget">> & { clearBudget?: boolean }) =>
    patch<Menu>(`/menus/${id}`, b),
  deleteMenu: (id: number) => del<void>(`/menus/${id}`),
  addMeal: (menuId: number, recipeId: number, day?: number | null) =>
    post<Menu>(`/menus/${menuId}/meals`, { recipeId, day: day ?? null }),
  updateMeal: (id: number, b: { day?: number; clearDay?: boolean; status?: MealStatus }) => patch<Menu>(`/meals/${id}`, b),
  deleteMeal: (id: number) => del<Menu>(`/meals/${id}`),

  grocery: (menuId: number) => get<Grocery>(`/menus/${menuId}/grocery`),
  generateGrocery: (menuId: number) => post<Grocery>(`/menus/${menuId}/grocery/generate`),
  addItem: (menuId: number, b: { name: string; quantity?: number; unit?: string; category?: string; unitCost?: number | null }) =>
    post<Grocery>(`/menus/${menuId}/grocery/items`, b),
  updateItem: (id: number, b: { checked?: boolean; name?: string; quantity?: number; unitCost?: number; clearCost?: boolean; category?: string }) =>
    patch<Grocery>(`/grocery-items/${id}`, b),
  deleteItem: (id: number) => del<Grocery>(`/grocery-items/${id}`),

  recommend: (p: { count?: number; mealType?: string; include?: string[]; exclude?: string[]; maxMinutes?: number; skip?: number[]; nonce?: number }) => {
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
