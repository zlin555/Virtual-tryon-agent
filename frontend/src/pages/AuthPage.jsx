import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext'
import useAuth from '../hooks/useAuth'

export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register'
  const navigate = useNavigate()
  const { login, register } = useAuth()
  const { t } = useLanguage()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const action = isRegister ? register : login
      await action({ username, password })
      navigate('/style')
    } catch (err) {
      setError(err.response?.data?.detail || err.message || t('auth.authFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#FAF7F2' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-2xl"
        style={{ backgroundColor: '#F0EBE3', boxShadow: '0 16px 40px rgba(139,90,80,0.12)' }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#C97B84' }}>
          {isRegister ? t('auth.createAccount') : t('auth.welcomeBack')}
        </p>
        <h1 className="text-4xl font-serif mb-2" style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}>
          {isRegister ? t('auth.register') : t('auth.login')}
        </h1>
        <p className="text-sm mb-8" style={{ color: '#8C7B75' }}>
          {isRegister
            ? t('auth.registerBody')
            : t('auth.loginBody')}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm" style={{ color: '#3D3535' }}>
            {t('auth.username')}
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={80}
              required
              className="px-4 py-3 rounded-xl text-sm outline-none"
              style={{ backgroundColor: '#FAF7F2', border: '1.5px solid #E8B4BA', color: '#1A1A1A' }}
              autoComplete="username"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm" style={{ color: '#3D3535' }}>
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              maxLength={128}
              required
              className="px-4 py-3 rounded-xl text-sm outline-none"
              style={{ backgroundColor: '#FAF7F2', border: '1.5px solid #E8B4BA', color: '#1A1A1A' }}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </label>

          {error && (
            <p className="text-sm rounded-xl px-4 py-3" style={{ color: '#9B2C2C', backgroundColor: '#FBEAEA' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 py-3 rounded-full text-white text-sm font-medium transition-all disabled:opacity-60 hover:scale-105"
            style={{ backgroundColor: '#C97B84' }}
          >
            {loading ? t('auth.pleaseWait') : isRegister ? t('auth.createAccountCta') : t('auth.loginCta')}
          </button>
        </form>

        <p className="text-sm mt-6 text-center" style={{ color: '#8C7B75' }}>
          {isRegister ? t('auth.alreadyHaveAccount') : t('auth.newHere')}{' '}
          <Link to={isRegister ? '/login' : '/register'} style={{ color: '#C97B84' }}>
            {isRegister ? t('auth.login') : t('auth.register')}
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
