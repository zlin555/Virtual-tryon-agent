import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { AuthContext, AUTH_TOKEN_KEY } from './auth-context'

const USER_PROFILES_KEY = 'tryon_user_profiles'
const AVATAR_COLORS = [
  '#C97B84',
  '#6B8CAE',
  '#A87E6D',
  '#5D8B7E',
  '#8D6FA8',
  '#D08C60',
  '#7286A0',
  '#B4687A',
]

function readStoredProfiles() {
  try {
    const stored = localStorage.getItem(USER_PROFILES_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function writeStoredProfiles(profiles) {
  localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles))
}

function normalizeProfileKey(userLike) {
  if (!userLike) return null
  return String(userLike.username || '').trim().toLowerCase() || null
}

function getInitials(username = '') {
  const parts = username.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function createProfile(userLike) {
  return {
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    avatarImage: null,
    initials: getInitials(userLike?.username),
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(token))

  const persistToken = useCallback((nextToken) => {
    setToken(nextToken)
    if (nextToken) localStorage.setItem(AUTH_TOKEN_KEY, nextToken)
    else localStorage.removeItem(AUTH_TOKEN_KEY)
  }, [])

  const loadMe = useCallback(async () => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
      setLoading(false)
      setProfile(null)
      return
    }

    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
    } catch {
      persistToken(null)
      setUser(null)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [persistToken])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMe()
  }, [loadMe])

  useEffect(() => {
    const profileKey = normalizeProfileKey(user)
    if (!profileKey) {
      setProfile(null)
      return
    }

    const profiles = readStoredProfiles()
    const nextProfile = profiles[profileKey] || createProfile(user)

    if (!profiles[profileKey]) {
      profiles[profileKey] = nextProfile
      writeStoredProfiles(profiles)
    }

    setProfile(nextProfile)
  }, [user])

  const applyAuthResponse = useCallback((data) => {
    persistToken(data.access_token)
    setUser(data.user)
    return data.user
  }, [persistToken])

  const login = useCallback(async ({ username, password }) => {
    const { data } = await api.post('/auth/login', { username, password })
    return applyAuthResponse(data)
  }, [applyAuthResponse])

  const register = useCallback(async ({ username, password }) => {
    const { data } = await api.post('/auth/register', { username, password })
    return applyAuthResponse(data)
  }, [applyAuthResponse])

  const logout = useCallback(() => {
    persistToken(null)
    setUser(null)
    setProfile(null)
  }, [persistToken])

  const updateProfile = useCallback((updates) => {
    setProfile((current) => {
      if (!user || !current) return current
      const nextProfile = { ...current, ...updates, initials: getInitials(user.username) }
      const profiles = readStoredProfiles()
      const profileKey = normalizeProfileKey(user)
      if (profileKey) {
        profiles[profileKey] = nextProfile
        writeStoredProfiles(profiles)
      }
      return nextProfile
    })
  }, [user])

  const value = useMemo(() => ({
    token,
    user,
    profile,
    loading,
    login,
    register,
    logout,
    updateProfile,
  }), [token, user, profile, loading, login, register, logout, updateProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
