import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSavedLooks } from '../../context/SavedLooksContext'
import useAuth from '../../hooks/useAuth'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/try-on', label: 'Try On' },
  { to: '/style', label: 'Style Explorer' },
]

const USER_MENU_ITEMS = [
  { to: '/account/review-history', label: 'Review History' },
  { to: '/account/purchase-history', label: 'Purchase History' },
  { to: '/account/token-purchase', label: 'Token Purchase' },
  { to: '/account/settings', label: 'Settings' },
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

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { looks, loading: savedLoading, removeLook, restoreLook } = useSavedLooks()
  const { user, profile, logout, updateProfile } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [avatarNotice, setAvatarNotice] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!userMenuOpen) return undefined

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false)
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

  const handleLogout = async () => {
    setUserMenuOpen(false)
    await logout()
    navigate('/')
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

  const handleMenuNavigate = (target) => {
    setUserMenuOpen(false)
    navigate(target)
  }

  const handleRestoreLook = async (savedItem) => {
    const restored = await restoreLook(savedItem.id)
    if (!restored?.garment_image_url) return

    const params = new URLSearchParams({
      garment: restored.garment_image_url,
    })

    const category = restored.product?.metadata?.category || restored.product?.metadata?.articleType
    if (category) params.set('type', category)
    if (restored.product?.title) params.set('title', restored.product.title)
    if (restored.product?.image_id) params.set('productId', restored.product.image_id)

    setDrawerOpen(false)
    navigate(`/try-on?${params.toString()}`)
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
                  onClick={() => setUserMenuOpen((open) => !open)}
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
                      className="absolute right-0 top-12 w-[22rem] rounded-[28px] overflow-hidden border z-50"
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
                              Account shortcuts
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3">
                          <label
                            className="cursor-pointer rounded-full px-3 py-2 text-xs transition-colors"
                            style={{ backgroundColor: '#1A1A1A', color: '#FAF7F2' }}
                          >
                            Upload avatar
                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                          </label>
                          <button
                            type="button"
                            onClick={handleAvatarRemove}
                            className="rounded-full px-3 py-2 text-xs border transition-colors"
                            style={{ borderColor: '#E8B4BA', color: '#8C7B75' }}
                          >
                            Remove image
                          </button>
                        </div>

                        {avatarNotice && (
                          <p className="mt-3 text-xs leading-5" style={{ color: '#B05B68' }}>
                            {avatarNotice}
                          </p>
                        )}
                      </div>

                      <div className="px-5 py-4 space-y-2">
                        {USER_MENU_ITEMS.map((item) => (
                          <button
                            key={item.to}
                            type="button"
                            onClick={() => handleMenuNavigate(item.to)}
                            className="w-full rounded-2xl px-4 py-3 text-left text-sm transition-colors"
                            style={{
                              backgroundColor: pathname === item.to ? '#F1E4E6' : '#FFFCF8',
                              color: pathname === item.to ? '#8C4C59' : '#3D3535',
                              border: '1px solid #EDE2D8',
                            }}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

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
                {savedLoading ? (
                  <div className="flex flex-col items-center gap-3 mt-16 text-center">
                    <p className="text-sm" style={{ color: '#8C7B75' }}>
                      Loading saved items...
                    </p>
                  </div>
                ) : looks.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 mt-16 text-center">
                    <p className="text-sm" style={{ color: '#8C7B75' }}>
                      No saved garments yet. Save a product from Style Explorer or Try On.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {looks.map((item) => (
                      <div key={item.id} className="rounded-xl overflow-hidden bg-white" style={{ boxShadow: '0 8px 18px rgba(139,90,80,0.08)' }}>
                        <button
                          type="button"
                          onClick={() => handleRestoreLook(item)}
                          className="relative group block w-full aspect-[3/4] text-left"
                        >
                          <img src={item.product_image_url} alt={item.product_name} className="w-full h-full object-cover" />
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(0,0,0,0.38)' }}
                          >
                            <span className="text-white text-xs px-3 py-1.5 rounded-full border border-white/60">
                              Restore to Try On
                            </span>
                          </div>
                        </button>
                        <div className="p-3">
                          <p className="text-xs line-clamp-2" style={{ color: '#3D3535' }}>
                            {item.product_name}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeLook(item.id)}
                            className="mt-3 text-xs px-3 py-1.5 rounded-full border transition-colors"
                            style={{ borderColor: '#E8B4BA', color: '#8C7B75' }}
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
