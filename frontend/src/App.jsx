import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { SavedLooksProvider } from './context/SavedLooksContext'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/layout/Navbar'
import HomePage from './pages/HomePage'
import TryOnPage from './pages/TryOnPage'
import StylePage from './pages/StylePage'
import AuthPage from './pages/AuthPage'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/try-on" element={<TryOnPage />} />
          <Route path="/style" element={<StylePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SavedLooksProvider>
          <Navbar />
          <div style={{ paddingTop: 64 }}>
            <AnimatedRoutes />
          </div>
        </SavedLooksProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
