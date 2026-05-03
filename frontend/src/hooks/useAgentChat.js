import { useState, useCallback } from 'react'
import api from '../api/client'

function parseRecommendations(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (Array.isArray(parsed)) return parsed
    } catch (_) { /* ignore */ }
  }
  return []
}

/** Poll /api/ready every 5 s until CLIP+FAISS agent is loaded (max 3 min). */
async function waitForAgent(onStatus) {
  for (let i = 0; i < 36; i++) {
    try {
      const { data } = await api.get('/ready')
      if (data.ready) return true
      onStatus(`AI model loading\u2026 ${Math.round((i + 1) * 5)}s`)
    } catch (_) { /* ignore transient */ }
    await new Promise(r => setTimeout(r, 5000))
  }
  return false
}

export default function useAgentChat() {
  const [history, setHistory] = useState([])   // [{ role: 'user'|'assistant', content: string }]
  const [recommendations, setRecommendations] = useState([])
  const [styleDNA, setStyleDNA] = useState(null)
  const [loading, setLoading] = useState(false)
  const [warmingUp, setWarmingUp] = useState('')
  const [error, setError] = useState('')

  const sendMessage = useCallback(async (message, styleImageUrl = null) => {
    setLoading(true)
    setError('')
    setWarmingUp('')

    // Check if CLIP+FAISS agent is ready; if not, poll until it is
    try {
      const { data } = await api.get('/ready')
      if (!data.ready) {
        setWarmingUp('AI model loading… this takes ~60s on first run')
        const ready = await waitForAgent((msg) => setWarmingUp(msg))
        if (!ready) {
          setError('Agent took too long to load. Please refresh and try again.')
          setLoading(false)
          setWarmingUp('')
          return
        }
        setWarmingUp('')
      }
    } catch (_) { /* server may not have /ready yet, continue anyway */ }

    const newHistory = [...history, { role: 'user', content: message }]
    setHistory(newHistory)

    try {
      const { data } = await api.post('/agent/chat', {
        message,
        history: history.slice(-6),
        ...(styleImageUrl ? { style_image_url: styleImageUrl } : {}),
      })

      const response = data.response
      setHistory([...newHistory, { role: 'assistant', content: response }])

      // Prefer search_results intercepted from tool calls; fall back to JSON block parsing
      const recs = (data.search_results && data.search_results.length > 0)
        ? data.search_results
        : parseRecommendations(response)
      if (recs.length > 0) {
        setRecommendations((prev) => [...prev, ...recs])
      }

      // Extract style DNA keywords from the first analysis response
      if (!styleDNA) {
        const STYLE_TERMS = [
          'Minimalist', 'Streetwear', 'Bohemian', 'Preppy', 'Dark Academia',
          'Y2K', 'Coastal', 'Office-Core', 'Cottagecore', 'Romantic', 'Edgy',
          'Casual', 'Formal', 'Vintage', 'Modern', 'Classic', 'Chic', 'Elegant',
          'Bold', 'Playful', 'Earthy', 'Monochrome', 'Feminine', 'Androgynous',
          'Luxe', 'Sporty', 'Grunge', 'Artsy', 'Preppy', 'Timeless',
        ]
        // Match quoted phrases and known style terms from the response
        const quotedMatches = response.match(/"([^"]{2,30})"|'([^']{2,30})'/g) || []
        const quoted = quotedMatches.map(t => t.replace(/['"]/g, '').trim())
        const termMatches = STYLE_TERMS.filter(t =>
          response.toLowerCase().includes(t.toLowerCase())
        )
        const keywords = [...new Set([...termMatches, ...quoted])].slice(0, 10)
        if (keywords.length > 0) setStyleDNA(keywords)
      }

      return response
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Network error.'
      setError(msg)
      setHistory([...newHistory, { role: 'assistant', content: `⚠️ ${msg}` }])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, styleDNA])

  const reset = useCallback(() => {
    setHistory([])
    setRecommendations([])
    setStyleDNA(null)
    setError('')
  }, [])

  return { history, recommendations, styleDNA, loading, warmingUp, error, sendMessage, reset }
}
