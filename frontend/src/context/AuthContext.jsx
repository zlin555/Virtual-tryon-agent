import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { AuthContext, AUTH_TOKEN_KEY } from './auth-context'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(token))

  const persistToken = useCallback((nextToken) => {
    setToken(nextToken)
    if (nextToken) localStorage.setItem(AUTH_TOKEN_KEY, nextToken)
    else localStorage.removeItem(AUTH_TOKEN_KEY)
  }, [])

  const loadMe = useCallback(async () => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
      setLoading(false)
      return
    }

    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
    } catch {
      persistToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [persistToken])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMe()
  }, [loadMe])

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
  }, [persistToken])

  const value = useMemo(() => ({
    token,
    user,
    loading,
    login,
    register,
    logout,
  }), [token, user, loading, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
