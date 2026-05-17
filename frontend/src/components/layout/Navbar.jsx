import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSavedLooks } from '../../context/SavedLooksContext'
import useAuth from '../../hooks/useAuth'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/try-on', label: 'Try On' },
  { to: '/style', label: 'Style Explorer' },
]

const USER_VIEWS = {
  overview: {
    title: 'Profile Home',
    subtitle: 'A quiet home base for your style identity and account tools.',
    cards: [
      { title: 'Style signals', body: 'Preference memory, compacted style traits, and future saved summaries will land here.' },
      { title: 'Recent activity', body: 'Your latest try-ons, saves, and recommendation sessions will be surfaced in one timeline.' },
    ],
  },
  reviewHistory: {
    title: 'Review History',
    subtitle: 'This section will collect the looks you explored, compared, and revisited.',
    cards: [
      { title: 'Product revisits', body: 'We will keep a browsable history of recommendation cards and try-on entries.' },
      { title: 'Preference drift', body: 'You will be able to see how your taste changes over time across seasons and moods.' },
    ],
  },
  purchaseHistory: {
    title: 'Purchase History',
    subtitle: 'A future account page for order-linked outfits and post-purchase tracking.',
    cards: [
      { title: 'Closet trail', body: 'Purchased items can later connect to your saved looks and long-term preference memory.' },
      { title: 'Wear again ideas', body: 'We can use past purchases to recommend styling companions instead of starting from zero.' },
    ],
  },
  tokenPurchase: {
    title: 'Token Purchase',
    subtitle: 'A future credits page for try-on generations, premium memory, or faster recommendation loops.',
    cards: [
      { title: 'Usage snapshot', body: 'Token balances, try-on consumption, and upgrade paths can live in this module.' },
      { title: 'Plan design', body: 'This page is a placeholder so the navigation already has a stable home for billing later.' },
    ],
  },
  settings: {
    title: 'Settings',
    subtitle: 'A lightweight preferences area for avatar, notifications, and future account controls.',
    cards: [
      { title: 'Profile appearance', body: 'Avatar, display name polish, and visual account settings can be managed here.' },
      { title: 'Memory controls', body: 'Later this can expose preference-memory review, deletion, and retention settings.' },
    ],
  },
}

const USER_MENU_ITEMS = [
  { key: 'reviewHistory', label: 'Review History' },
  { key: 'purchaseHistory', label: 'Purchase History' },
  { key: 'tokenPurchase', label: 'Token Purchase' },
  { key: 'settings', label: 'Settings' },
]

function UserAvatar({ profile, username, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-sm'

  if (profile?.avatarImage) {
    return (
      <img
        src={profile.avatarImage}
        alt={`${username} avatar`}
        className={`${sizeClass} rounded-full object-cover border border-white/60`}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white`}
      style={{ backgroundColor: profile?.avatarColor || '#C97B84' }}
    >
      {profile?.initials || username?.slice(0, 2)?.toUpperCase() || '?'}
    </div>
  )
}

function ProfileOverview({ activeView, avatarNotice, onSelectView, onAvatarUpload, onAvatarRemove }) {
  const view = USER_VIEWS[activeView]
  const isOverview = activeView === 'overview'

  return (
    <div className="px-5 pb-5">
      <div className="grid grid-cols-2 gap-2 mb-4">
        {USER_MENU_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelectView(item.key)}
            className="rounded-full px-3 py-2 text-xs transition-colors duration-200"
            style={{
              backgroundColor: activeView === item.key ? '#E8B4BA' : '#F4EEE6',
              color: activeView === item.key ? '#5C3640' : '#7B6A64',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl p-4 border"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(244,238,230,0.92) 100%)',
          borderColor: '#E8D7CC',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: '#C97B84' }}>
              {isOverview ? 'Account Studio' : 'Workspace Preview'}
            </p>
            <h3
              className="mt-2 text-2xl font-serif leading-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
            >
              {view.title}
            </h3>
            <p className="mt-2 text-sm leading-6" style={{ color: '#6E615C' }}>
              {view.subtitle}
            </p>
          </div>

          <span
            className="shrink-0 rounded-full px-3 py-1 text-[11px]"
            style={{ backgroundColor: '#F7D7DB', color: '#8C4C59' }}
          >
            Coming Soon
          </span>
        </div>

        {isOverview && (
          <div className="mb-4 p-3 rounded-2xl" style={{ backgroundColor: '#FBF8F4' }}>
            <div className="flex items-center gap-3">
              <label
                className="cursor-pointer rounded-full px-3 py-2 text-xs transition-colors"
                style={{ backgroundColor: '#1A1A1A', color: '#FAF7F2' }}
              >
                Upload avatar
                <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} />
              </label>
              <button
                type="button"
                onClick={onAvatarRemove}
                className="rounded-full px-3 py-2 text-xs border transition-colors"
                style={{ borderColor: '#E8B4BA', color: '#8C7B75' }}
              >
                Remove image
              </button>
            </div>
            <p className="mt-3 text-xs leading-5" style={{ color: '#8C7B75' }}>
              Avatar images are stored locally in this browser for now, so smaller files work best.
            </p>
            {avatarNotice && (
              <p className="mt-2 text-xs leading-5" style={{ color: '#B05B68' }}>
                {avatarNotice}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {view.cards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl p-4 border"
              style={{ backgroundColor: '#FFFCF9', borderColor: '#EDE2D8' }}
            >
              <p className="text-sm font-medium" style={{ color: '#3D3535' }}>
                {card.title}
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: '#7B6A64' }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Navbar() {
  const { pathname } = useLocation()
  const { looks, removeLook } = useSavedLooks()
  const { user, profile, logout, updateProfile } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [activeView, setActiveView] = useState('overview')
  const [avatarNotice, setAvatarNotice] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!userMenuOpen) return undefined

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setUserMenuOpen(false)
        setActiveView('overview')
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false)
        setActiveView('overview')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [userMenuOpen])

  const handleLogout = () => {
    setUserMenuOpen(false)
    setActiveView('overview')
    logout()
  }

  const handleAvatarUpload = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 1024 * 1024) {
      setAvatarNotice('Please upload an image smaller than 1 MB for now.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarNotice('')
        updateProfile({ avatarImage: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAvatarRemove = () => {
    setAvatarNotice('')
    updateProfile({ avatarImage: null })
  }

  const toggleUserMenu = () => {
    setUserMenuOpen((open) => {
      if (open) setActiveView('overview')
      return !open
    })
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
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={toggleUserMenu}
                  className="flex items-center gap-3 rounded-full pl-1 pr-3 py-1 transition-all duration-200"
                  style={{
                    backgroundColor: userMenuOpen ? '#F4EEE6' : 'transparent',
                    color: '#3D3535',
                  }}
                >
                  <UserAvatar profile={profile} username={user.username} />
                  <div className="hidden sm:block text-left">
                    <p className="text-sm leading-4">{user.username}</p>
                    <p className="text-[11px] leading-4" style={{ color: '#8C7B75' }}>
                      Profile
                    </p>
                  </div>
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 top-12 w-[24rem] rounded-[28px] overflow-hidden border z-50"
                      style={{
                        backgroundColor: '#FAF7F2',
                        borderColor: '#E8D7CC',
                        boxShadow: '0 24px 60px rgba(61,43,43,0.18)',
                      }}
                    >
                      <div
                        className="px-5 pt-5 pb-4 border-b"
                        style={{
                          borderColor: '#E8D7CC',
                          background: 'radial-gradient(circle at top left, rgba(201,123,132,0.22), transparent 46%), linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(250,247,242,1) 100%)',
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <UserAvatar profile={profile} username={user.username} size="lg" />
                          <div className="min-w-0">
                            <p
                              className="font-serif text-2xl truncate"
                              style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
                            >
                              {user.username}
                            </p>
                            <p className="text-sm mt-1" style={{ color: '#8C7B75' }}>
                              Your personal style workspace
                            </p>
                          </div>
                        </div>
                      </div>

                      <ProfileOverview
                        activeView={activeView}
                        avatarNotice={avatarNotice}
                        onSelectView={setActiveView}
                        onAvatarUpload={handleAvatarUpload}
                        onAvatarRemove={handleAvatarRemove}
                      />

                      <div className="px-5 pb-5">
                        <button
                          onClick={handleLogout}
                          className="w-full rounded-full px-4 py-3 text-sm transition-colors"
                          style={{ backgroundColor: '#1A1A1A', color: '#FAF7F2' }}
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
