import { api } from "./api"

interface I { n: string; u: string; c: string; $?: number }
const ING: Record<string, I> = {
  chicken: { n: "Chicken thighs", u: "lb", c: "Meat & Seafood", $: 4.5 },
  salmon: { n: "Salmon fillet", u: "lb", c: "Meat & Seafood", $: 11 },
  beef: { n: "Ground beef", u: "lb", c: "Meat & Seafood", $: 6 },
  chorizo: { n: "Chorizo", u: "lb", c: "Meat & Seafood", $: 7 },
  rice: { n: "Rice", u: "cup", c: "Pantry", $: 0.4 },
  pasta: { n: "Spaghetti", u: "box", c: "Pantry", $: 2 },
  tortillas: { n: "Flour tortillas", u: "pack", c: "Bakery", $: 3.5 },
  beans: { n: "Black beans", u: "can", c: "Pantry", $: 1.2 },
  tomatoes: { n: "Canned tomatoes", u: "can", c: "Pantry", $: 1.5 },
  onion: { n: "Yellow onion", u: "pc", c: "Produce", $: 0.9 },
  garlic: { n: "Garlic", u: "head", c: "Produce", $: 0.7 },
  pepper: { n: "Bell peppers", u: "pc", c: "Produce", $: 1.3 },
  broccoli: { n: "Broccoli", u: "head", c: "Produce", $: 2.2 },
  avocado: { n: "Avocado", u: "pc", c: "Produce", $: 1.5 },
  lemon: { n: "Lemon", u: "pc", c: "Produce", $: 0.8 },
  basil: { n: "Fresh basil", u: "bunch", c: "Produce", $: 2.5 },
  eggs: { n: "Eggs", u: "dozen", c: "Dairy & Eggs", $: 4 },
  cheese: { n: "Shredded cheese", u: "bag", c: "Dairy & Eggs", $: 3.5 },
  parmesan: { n: "Parmesan", u: "wedge", c: "Dairy & Eggs", $: 5 },
  soy: { n: "Soy sauce", u: "bottle", c: "Pantry", $: 3 },
  potato: { n: "Potatoes", u: "lb", c: "Produce", $: 1 },
}

interface R { name: string; description: string; mealType: string; tags: string[]; prep: number; cook: number; ings: [keyof typeof ING, number][] }
const RECIPES: R[] = [
  { name: "Chorizo breakfast burritos", description: "Smoky chorizo, eggs, beans and avocado in a warm tortilla.", mealType: "dinner", tags: ["mexican", "quick"], prep: 10, cook: 15, ings: [["chorizo", 0.5], ["eggs", 0.5], ["beans", 1], ["avocado", 2], ["tortillas", 1], ["cheese", 0.5]] },
  { name: "Seared salmon & rice", description: "Crispy-skinned salmon with lemon and fluffy rice.", mealType: "dinner", tags: ["fish", "healthy"], prep: 10, cook: 15, ings: [["salmon", 1.5], ["rice", 2], ["lemon", 1], ["broccoli", 1]] },
  { name: "Weeknight spaghetti & meat sauce", description: "A saucy classic the whole table agrees on.", mealType: "dinner", tags: ["italian", "comfort"], prep: 10, cook: 30, ings: [["pasta", 1], ["beef", 1], ["tomatoes", 2], ["onion", 1], ["garlic", 1], ["parmesan", 0.25]] },
  { name: "Sheet-pan chicken & potatoes", description: "One pan, minimal cleanup.", mealType: "dinner", tags: ["chicken", "easy"], prep: 10, cook: 40, ings: [["chicken", 2], ["potato", 2], ["onion", 1], ["garlic", 1], ["lemon", 1]] },
  { name: "Veggie fried rice", description: "Better than takeout, ready in 20.", mealType: "dinner", tags: ["vegetarian", "quick"], prep: 10, cook: 10, ings: [["rice", 3], ["eggs", 0.33], ["pepper", 2], ["broccoli", 1], ["soy", 0.25], ["garlic", 1]] },
  { name: "Chicken fajita bowls", description: "Sizzling peppers and chicken over rice and beans.", mealType: "dinner", tags: ["mexican", "chicken"], prep: 15, cook: 20, ings: [["chicken", 1.5], ["pepper", 3], ["onion", 1], ["rice", 2], ["beans", 1], ["cheese", 0.5]] },
  { name: "Caprese pasta", description: "Summery pasta with tomatoes, basil and parmesan.", mealType: "dinner", tags: ["vegetarian", "italian", "quick"], prep: 5, cook: 15, ings: [["pasta", 1], ["tomatoes", 1], ["basil", 1], ["garlic", 1], ["parmesan", 0.25]] },
  { name: "Black bean quesadillas", description: "Crispy, cheesy and on the table in 15.", mealType: "dinner", tags: ["vegetarian", "mexican", "quick"], prep: 5, cook: 10, ings: [["tortillas", 1], ["beans", 1], ["cheese", 1], ["pepper", 1], ["avocado", 1]] },
]

export async function loadStarter(): Promise<number> {
  const existing = await api.ingredients()
  const byName = new Map(existing.map((i) => [i.name.toLowerCase(), i.id]))
  const ids: Record<string, number> = {}
  for (const [key, i] of Object.entries(ING)) {
    const have = byName.get(i.n.toLowerCase())
    ids[key] = have ?? (await api.createIngredient({ name: i.n, unit: i.u, category: i.c, unitCost: i.$ ?? null })).id
  }
  const haveRecipes = new Set((await api.recipes()).map((r) => r.name.toLowerCase()))
  let n = 0
  for (const r of RECIPES) {
    if (haveRecipes.has(r.name.toLowerCase())) continue
    await api.createRecipe({
      name: r.name, description: r.description, mealType: r.mealType, tags: r.tags, prepMinutes: r.prep, cookMinutes: r.cook,
      servings: 4, instructions: "",
      ingredients: r.ings.map(([k, q]) => ({ ingredientId: ids[k], quantity: q, note: "" })),
    })
    n++
  }
  return n
}
