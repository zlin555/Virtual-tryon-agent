import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import useAuth from '../hooks/useAuth'

const SavedLooksContext = createContext(null)

function normalizeSavedPayload(input) {
  if (!input) return null

  if (typeof input === 'string') {
    const fallbackId = `custom-${encodeURIComponent(input).slice(0, 100)}`
    return {
      product_id: fallbackId,
      product_name: 'Saved garment',
      product_image_url: input,
      product_category: null,
      product_gender: null,
      search_keyword: null,
      product_payload_json: { image_url: input, source: 'manual_url' },
    }
  }

  const imageUrl = input.image_url || input.imageUrl || input.product_image_url || input.url
  if (!imageUrl) return null

  const imageId = input.image_id || input.imageId || input.product_id || `custom-${encodeURIComponent(imageUrl).slice(0, 100)}`
  const productName = input.title || input.product_name || 'Saved garment'
  const productCategory = input.metadata?.category || input.metadata?.articleType || input.product_category || null
  const productGender = input.metadata?.dataset_gender || input.metadata?.gender || input.product_gender || null

  return {
    product_id: String(imageId),
    product_name: String(productName),
    product_image_url: String(imageUrl),
    product_category: productCategory,
    product_gender: productGender,
    search_keyword: input.search_keyword || input.title || input.product_name || null,
    product_payload_json: input.product_payload_json || input,
  }
}

export function SavedLooksProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [looks, setLooks] = useState([])
  const [loading, setLoading] = useState(false)

  const loadLooks = useCallback(async () => {
    if (!user) {
      setLooks([])
      return
    }

    setLoading(true)
    try {
      const { data } = await api.get('/saved')
      setLooks(Array.isArray(data) ? data : [])
    } catch {
      setLooks([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!authLoading) {
      loadLooks()
    }
  }, [authLoading, loadLooks])

  const saveLook = useCallback(async (input) => {
    if (!user) return null

    const payload = normalizeSavedPayload(input)
    if (!payload) return null

    try {
      const { data } = await api.post('/saved', payload)
      setLooks((current) => {
        const withoutExisting = current.filter((item) => item.id !== data.id && item.product_id !== data.product_id)
        return [data, ...withoutExisting]
      })
      return data
    } catch {
      return null
    }
  }, [user])

  const removeLook = useCallback(async (savedItemId) => {
    if (!user || !savedItemId) return false

    try {
      await api.delete(`/saved/${savedItemId}`)
      setLooks((current) => current.filter((item) => item.id !== savedItemId))
      return true
    } catch {
      return false
    }
  }, [user])

  const restoreLook = useCallback(async (savedItemId) => {
    if (!user || !savedItemId) return null

    try {
      const { data } = await api.post(`/saved/${savedItemId}/restore`)
      return data
    } catch {
      return null
    }
  }, [user])

  const value = useMemo(() => ({
    looks,
    loading,
    saveLook,
    removeLook,
    restoreLook,
    refreshLooks: loadLooks,
  }), [looks, loading, saveLook, removeLook, restoreLook, loadLooks])

  return (
    <SavedLooksContext.Provider value={value}>
      {children}
    </SavedLooksContext.Provider>
  )
}

export function useSavedLooks() {
  return useContext(SavedLooksContext)
}
