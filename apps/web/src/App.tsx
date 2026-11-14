import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Layout } from "./components/Layout"
import { Spinner } from "./components/ui"
import { api } from "./lib/api"
import { useAuth } from "./lib/auth"
import AuthPage from "./pages/Auth"
import Dashboard from "./pages/Dashboard"
import Plan from "./pages/Plan"
import Shop from "./pages/Shop"
import MenuPage from "./pages/Menu"
import Recipes from "./pages/Recipes"
import RecipeEdit from "./pages/RecipeEdit"
import Ingredients from "./pages/Ingredients"
import History from "./pages/History"
import Trends from "./pages/Trends"
import HouseholdPage from "./pages/Household"
import More from "./pages/More"
import SettingsPage from "./pages/Settings"

export default function App() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  const cfg = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: false })
  const canRegister = cfg.data?.registration !== "closed"
  if (loading) return <Spinner />
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={canRegister ? <AuthPage mode="register" /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: loc.pathname }} />} />
      </Routes>
    )
  }
  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          <Routes location={loc}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/plan" element={<Plan />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/recipes/new" element={<RecipeEdit />} />
            <Route path="/recipes/:id" element={<RecipeEdit />} />
            <Route path="/ingredients" element={<Ingredients />} />
            <Route path="/history" element={<History />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/household" element={<HouseholdPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/more" element={<More />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Layout>
  )
}
