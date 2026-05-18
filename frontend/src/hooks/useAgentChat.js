import { useCallback, useState } from 'react'
import api from '../api/client'
import { getStyleSessionId } from '../lib/styleSession'

const STYLE_TERMS = [
  'Minimalist', 'Streetwear', 'Bohemian', 'Preppy', 'Dark Academia',
  'Y2K', 'Coastal', 'Office-Core', 'Cottagecore', 'Romantic', 'Edgy',
  'Casual', 'Formal', 'Vintage', 'Modern', 'Classic', 'Chic', 'Elegant',
  'Bold', 'Playful', 'Earthy', 'Monochrome', 'Feminine', 'Androgynous',
  'Luxe', 'Sporty', 'Grunge', 'Artsy', 'Timeless',
]

function parseRecommendations(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (Array.isArray(parsed)) return parsed
    } catch {
      return []
    }
  }
  return []
}

function extractStyleKeywords(response) {
  const quotedMatches = response.match(/"([^"]{2,30})"|'([^']{2,30})'/g) || []
  const quoted = quotedMatches.map((token) => token.replace(/['"]/g, '').trim())
  const termMatches = STYLE_TERMS.filter((term) =>
    response.toLowerCase().includes(term.toLowerCase())
  )
  return [...new Set([...termMatches, ...quoted])].slice(0, 10)
}

async function waitForAgent(onStatus) {
  for (let i = 0; i < 36; i += 1) {
    try {
      const { data } = await api.get('/ready')
      if (data.ready) return true
      onStatus(`AI model loading... ${Math.round((i + 1) * 5)}s`)
    } catch {
      // Ignore transient readiness checks.
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return false
}

export default function useAgentChat() {
  const [turns, setTurns] = useState([])
  const [loading, setLoading] = useState(false)
  const [warmingUp, setWarmingUp] = useState('')
  const [error, setError] = useState('')

  const sendMessage = useCallback(async (message, styleImageUrl = null) => {
    setLoading(true)
    setError('')
    setWarmingUp('')

    try {
      const { data } = await api.get('/ready')
      if (!data.ready) {
        setWarmingUp('AI model loading... this takes about a minute on first run')
        const ready = await waitForAgent((status) => setWarmingUp(status))
        if (!ready) {
          setError('Agent took too long to load. Please refresh and try again.')
          setLoading(false)
          setWarmingUp('')
          return null
        }
        setWarmingUp('')
      }
    } catch {
      // Continue even if readiness endpoint is temporarily unavailable.
    }

    const plainHistory = turns.flatMap((turn) => ([
      { role: 'user', content: turn.userMessage },
      { role: 'assistant', content: turn.assistantMessage },
    ]))

    try {
        const { data } = await api.post('/agent/chat', {
        message,
        history: plainHistory.slice(-6),
        session_id: getStyleSessionId(),
        ...(styleImageUrl ? { style_image_url: styleImageUrl } : {}),
      })

      const response = data.response
      const recommendations = (data.search_results && data.search_results.length > 0)
        ? data.search_results
        : parseRecommendations(response)

      const nextTurn = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userMessage: message,
        assistantMessage: response,
        recommendations,
        styleDNA: extractStyleKeywords(response),
        retrievedMemories: data.retrieved_memories || [],
      }

      setTurns((current) => [...current, nextTurn])
      return nextTurn
    } catch (err) {
      const messageText = err.response?.data?.detail || err.message || 'Network error.'
      setError(messageText)
      const nextTurn = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userMessage: message,
        assistantMessage: `Unable to update recommendations right now. ${messageText}`,
        recommendations: [],
        styleDNA: [],
        retrievedMemories: [],
      }
      setTurns((current) => [...current, nextTurn])
      return nextTurn
    } finally {
      setLoading(false)
    }
  }, [turns])

  const reset = useCallback(() => {
    setTurns([])
    setError('')
  }, [])

  return { turns, loading, warmingUp, error, sendMessage, reset }
}
