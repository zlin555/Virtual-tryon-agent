import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSavedLooks } from '../../context/SavedLooksContext'
import useAuth from '../../hooks/useAuth'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/try-on', label: 'Try On' },
  { to: '/style', label: 'Style Explorer' },
]

const USER_MENU_ITEMS = [
  'Review History',
  'Purchase History',
  'Token Purchase',
  'Settings',
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { looks, removeLook } = useSavedLooks()
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = () => {
    setUserMenuOpen(false)
    logout()
  }

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
        <Link
          to="/"
          className="font-serif text-xl tracking-wide"
          style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
        >
          tryon<em style={{ color: '#C97B84' }}>.</em>ai
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-sm transition-colors duration-200"
              style={{ color: pathname === to ? '#C97B84' : '#8C7B75' }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="text-sm transition-colors duration-200"
                  style={{ color: userMenuOpen ? '#C97B84' : '#8C7B75' }}
                >
                  {user.username}
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute right-0 top-9 w-64 rounded-xl overflow-hidden border z-50"
                      style={{
                        backgroundColor: '#FAF7F2',
                        borderColor: '#E8B4BA',
                        boxShadow: '0 18px 45px rgba(61,43,43,0.16)',
                      }}
                    >
                      <div className="px-5 py-4 border-b" style={{ borderColor: '#E8B4BA' }}>
                        <p className="font-serif text-lg" style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}>
                          {user.username}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#8C7B75' }}>
                          Style profile
                        </p>
                      </div>

                      <div className="py-2">
                        {USER_MENU_ITEMS.map((item) => (
                          <button
                            key={item}
                            className="w-full text-left px-5 py-2.5 text-sm transition-colors hover:bg-[#F0EBE3]"
                            style={{ color: '#3D3535' }}
                            type="button"
                          >
                            {item}
                          </button>
                        ))}
                      </div>

                      <div className="border-t py-2" style={{ borderColor: '#E8B4BA' }}>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-5 py-2.5 text-sm transition-colors hover:bg-[#F0EBE3]"
                          style={{ color: '#C97B84' }}
                          type="button"
                        >
                          Logout
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setDrawerOpen(true)}
                className="relative text-sm transition-colors duration-200"
                style={{ color: '#8C7B75' }}
              >
                Saved
                {looks.length > 0 && (
                  <span
                    className="absolute -top-2 -right-3 w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center"
                    style={{ backgroundColor: '#C97B84' }}
                  >
                    {looks.length}
                  </span>
                )}
              </button>
            </>
          ) : (
            <div className="hidden sm:flex items-center gap-3 text-sm">
              <Link to="/login" style={{ color: pathname === '/login' ? '#C97B84' : '#8C7B75' }}>
                Login
              </Link>
              <Link
                to="/register"
                className="px-4 py-1.5 rounded-full text-white"
                style={{ backgroundColor: '#C97B84' }}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence>
        {drawerOpen && user && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              onClick={() => setDrawerOpen(false)}
            />

            <motion.div
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-80 flex flex-col"
              style={{ backgroundColor: '#FAF7F2', boxShadow: '-8px 0 40px rgba(139,90,80,0.15)' }}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: '#E8B4BA' }}>
                <h2 className="font-serif text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Saved Looks
                </h2>
                <button onClick={() => setDrawerOpen(false)} style={{ color: '#8C7B75' }}>Close</button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {looks.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 mt-16 text-center">
                    <p className="text-sm" style={{ color: '#8C7B75' }}>
                      No saved looks yet. Try something on and save the result.
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
