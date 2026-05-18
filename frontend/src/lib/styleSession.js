const STYLE_SESSION_KEY = 'tryon_style_session_id'

export function getStyleSessionId() {
  const existing = sessionStorage.getItem(STYLE_SESSION_KEY)
  if (existing) return existing
  const next = `style-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  sessionStorage.setItem(STYLE_SESSION_KEY, next)
  return next
}

export function clearStyleSessionId() {
  sessionStorage.removeItem(STYLE_SESSION_KEY)
}
