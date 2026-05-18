import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'

function HistoryProductCard({ product, onTryOn }) {
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
        {(product.metadata?.color || product.metadata?.articleType || product.metadata?.usage) && (
          <p className="mt-2 text-xs" style={{ color: '#8C7B75' }}>
            {[product.metadata?.color, product.metadata?.articleType, product.metadata?.usage].filter(Boolean).join(' · ')}
          </p>
        )}
        <button
          type="button"
          onClick={() => onTryOn(imageUrl, product.metadata?.category || product.metadata?.articleType)}
          className="mt-4 w-full rounded-full py-2 text-xs text-white"
          style={{ backgroundColor: '#C97B84' }}
        >
          Send to Try On
        </button>
      </div>
    </div>
  )
}

export default function ReviewHistoryPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function loadHistory() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/memory/session')
        const turns = Array.isArray(data.turns) ? data.turns : []
        const grouped = []

        for (let index = 0; index < turns.length; index += 1) {
          const turn = turns[index]
          if (turn.role !== 'user') continue
          const assistantTurn = turns[index + 1]?.role === 'assistant' ? turns[index + 1] : null
          grouped.push({
            id: `${index}-${turn.created_at || 'turn'}`,
            userMessage: turn.content,
            assistantMessage: assistantTurn?.content || '',
            products: assistantTurn?.products || [],
          })
        }

        if (alive) setEntries(grouped.reverse())
      } catch (err) {
        if (alive) {
          setError(err.response?.data?.detail || err.message || 'Unable to load review history.')
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadHistory()
    return () => { alive = false }
  }, [])

  const handleTryOn = (garmentUrl, category) => {
    const params = new URLSearchParams({ garment: garmentUrl })
    if (category) params.set('type', category)
    navigate(`/try-on?${params.toString()}`)
  }

  return (
    <div className="min-h-screen px-6 py-16" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: '#C97B84' }}>
            Review History
          </p>
          <h1
            className="mt-4 text-5xl font-serif"
            style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
          >
            Every search in this session
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8" style={{ color: '#746761' }}>
            This page keeps the recommendation batches from your current signed-in session. Logging out clears this working review trail after its summary is flushed into long-term memory.
          </p>
        </motion.div>

        {loading ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}>
            <p className="text-sm" style={{ color: '#8C7B75' }}>Loading review history...</p>
          </div>
        ) : error ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFF2F2', borderColor: '#E7B8BD', color: '#A14A57' }}>
            <p className="text-sm">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}>
            <p className="text-sm" style={{ color: '#8C7B75' }}>
              No recommendation batches have been generated in this session yet.
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
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: '#8C7B75' }}>
                      This turn did not store a recommendation grid.
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
