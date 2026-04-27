import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSavedLooks } from '../../context/SavedLooksContext'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/try-on', label: 'Try On' },
  { to: '/style', label: 'Style Explorer' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { looks, removeLook } = useSavedLooks()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-16"
        style={{
          backgroundColor: 'rgba(250,247,242,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(232,180,186,0.3)',
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          className="font-serif text-xl tracking-wide"
          style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
        >
          tryon<em style={{ color: '#C97B84' }}>.</em>ai
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to} to={to}
              className="text-sm transition-colors duration-200"
              style={{ color: pathname === to ? '#C97B84' : '#8C7B75' }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Saved looks icon */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative flex items-center gap-1.5 text-sm transition-colors duration-200"
          style={{ color: '#8C7B75' }}
        >
          <span className="text-lg">♡</span>
          <span className="hidden sm:inline">Saved</span>
          {looks.length > 0 && (
            <span
              className="absolute -top-1 -right-2 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center"
              style={{ backgroundColor: '#C97B84' }}
            >
              {looks.length}
            </span>
          )}
        </button>
      </header>

      {/* ── Saved Looks Drawer ─────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              onClick={() => setDrawerOpen(false)}
            />

            {/* Drawer panel */}
            <motion.div
              key="drawer"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-80 flex flex-col"
              style={{ backgroundColor: '#FAF7F2', boxShadow: '-8px 0 40px rgba(139,90,80,0.15)' }}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: '#E8B4BA' }}>
                <h2 className="font-serif text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Saved Looks
                </h2>
                <button onClick={() => setDrawerOpen(false)} style={{ color: '#8C7B75' }}>✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {looks.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 mt-16 text-center">
                    <span className="text-4xl opacity-30">♡</span>
                    <p className="text-sm" style={{ color: '#8C7B75' }}>
                      No saved looks yet. Try something on and save the result!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {looks.map((url, i) => (
                      <div key={i} className="relative group rounded-xl overflow-hidden aspect-[3/4]">
                        <img src={url} alt={`Saved look ${i + 1}`} className="w-full h-full object-cover" />
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                        >
                          <button
                            onClick={() => removeLook(url)}
                            className="text-white text-xs px-3 py-1.5 rounded-full border border-white/60 hover:bg-white/20 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
