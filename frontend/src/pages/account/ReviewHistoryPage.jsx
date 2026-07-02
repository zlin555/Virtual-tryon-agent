import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { useLanguage } from '../../context/LanguageContext'
import { getStyleSessionId } from '../../lib/styleSession'

function HistoryProductCard({ product, onTryOn, t }) {
  const imageUrl = product.image_url || product.imageUrl
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: '#F4EEE6', boxShadow: '0 10px 22px rgba(139,90,80,0.08)' }}
    >
      <div className="aspect-square overflow-hidden bg-white">
        <img src={imageUrl} alt={product.title} className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <p
          className="font-serif text-sm line-clamp-2"
          style={{ fontFamily: "'Playfair Display', serif", color: '#241F1F' }}
        >
          {product.title}
        </p>
        {(product.metadata?.color || product.metadata?.articleType || product.metadata?.usage || product.metadata?.price_usd) && (
          <p className="mt-2 text-xs" style={{ color: '#8C7B75' }}>
            {[
              product.metadata?.color,
              product.metadata?.articleType,
              product.metadata?.usage,
              product.metadata?.price_usd ? `$${product.metadata.price_usd}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
        <button
          type="button"
          onClick={() => onTryOn(
            imageUrl,
            product.metadata?.category || product.metadata?.articleType,
            product.title,
            product.image_id,
          )}
          className="mt-4 w-full rounded-full py-2 text-xs text-white"
          style={{ backgroundColor: '#C97B84' }}
        >
          {t('review.sendToTryOn')}
        </button>
      </div>
    </div>
  )
}

export default function ReviewHistoryPage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/memory/session', {
        params: { session_id: getStyleSessionId() },
      })
      const reviewEntries = Array.isArray(data.review_entries) ? data.review_entries : []
      const normalized = reviewEntries.map((entry, index) => ({
        id: `${entry.created_at || index}-${index}`,
        userMessage: entry.user_message || '',
        assistantMessage: entry.assistant_message || '',
        products: Array.isArray(entry.products) ? entry.products : [],
      }))
      setEntries(normalized.reverse())
    } catch (err) {
      setError(err.response?.data?.detail || err.message || t('review.unableLoad'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadHistory()
    const intervalId = window.setInterval(() => loadHistory(true), 4000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadHistory])

  const handleTryOn = (garmentUrl, category, title, productId) => {
    const params = new URLSearchParams({ garment: garmentUrl })
    if (category) params.set('type', category)
    if (title) params.set('title', title)
    if (productId) params.set('productId', productId)
    navigate(`/try-on?${params.toString()}`)
  }

  return (
    <div className="min-h-screen px-6 py-16" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: '#C97B84' }}>
            {t('review.eyebrow')}
          </p>
          <h1
            className="mt-4 text-5xl font-serif"
            style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
          >
            {t('review.title')}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8" style={{ color: '#746761' }}>
            {t('review.body')}
          </p>
          <button
            type="button"
            onClick={() => loadHistory()}
            className="mt-5 rounded-full px-4 py-2 text-xs border"
            style={{ borderColor: '#E8D7CC', color: '#8C7B75', backgroundColor: '#FFFCF8' }}
          >
            {t('review.refresh')}
          </button>
        </motion.div>

        {loading ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}>
            <p className="text-sm" style={{ color: '#8C7B75' }}>{t('review.loading')}</p>
          </div>
        ) : error ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFF2F2', borderColor: '#E7B8BD', color: '#A14A57' }}>
            <p className="text-sm">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}>
            <p className="text-sm" style={{ color: '#8C7B75' }}>
              {t('review.empty')}
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {entries.map((entry) => (
              <section key={entry.id} className="space-y-5">
                <div className="flex justify-end">
                  <div
                    className="max-w-3xl rounded-[30px] px-6 py-5 text-sm leading-7"
                    style={{ backgroundColor: '#EFE7DF', color: '#2F2928' }}
                  >
                    {entry.userMessage}
                  </div>
                </div>

                <div
                  className="rounded-[28px] border p-6"
                  style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}
                >
                  {entry.assistantMessage && (
                    <p className="text-sm leading-7 mb-6" style={{ color: '#3A3331' }}>
                      {entry.assistantMessage}
                    </p>
                  )}

                  {entry.products?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {entry.products.map((product, index) => (
                        <HistoryProductCard
                          key={`${entry.id}-${product.title}-${index}`}
                          product={product}
                          onTryOn={handleTryOn}
                          t={t}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: '#8C7B75' }}>
                      {t('review.noGrid')}
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
