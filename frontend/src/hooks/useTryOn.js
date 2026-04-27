import { useState, useCallback } from 'react'
import api from '../api/client'

export default function useTryOn() {
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [resultUrl, setResultUrl] = useState(null)
  const [message, setMessage] = useState('')

  const runTryOn = useCallback(async ({ personUrl, garmentUrl, garmentType, styleNote }) => {
    setStatus('loading')
    setResultUrl(null)
    setMessage('')

    try {
      const { data } = await api.post('/tryon', {
        person_image_url: personUrl,
        garment_image_url: garmentUrl,
        garment_type: garmentType || null,
        style_note: styleNote || null,
      })

      if (data.status === 'success') {
        setResultUrl(data.result_image_url)
        setStatus('success')
        setMessage('Try-on complete!')
      } else {
        setStatus('error')
        setMessage(data.message || 'Try-on failed.')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err.response?.data?.detail || err.message || 'Network error.')
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setResultUrl(null)
    setMessage('')
  }, [])

  return { status, resultUrl, message, runTryOn, reset }
}
