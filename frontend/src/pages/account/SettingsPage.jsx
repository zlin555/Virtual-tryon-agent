import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api/client'
import { useLanguage } from '../../context/LanguageContext'

export default function SettingsPage() {
  const { t, language } = useLanguage()
  const [summary, setSummary] = useState('')
  const [memoriesCount, setMemoriesCount] = useState(0)
  const [sourceMemories, setSourceMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function loadSummary() {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get('/memory/style-summary', {
          params: { display_language: language },
        })
        if (!alive) return
        setSummary(data.summary || '')
        setMemoriesCount(data.memories_count || 0)
        setSourceMemories(Array.isArray(data.source_memories) ? data.source_memories : [])
      } catch (err) {
        if (!alive) return
        setError(err.response?.data?.detail || err.message || t('settings.unableLoad'))
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadSummary()
    return () => { alive = false }
  }, [language, t])

  return (
    <div className="min-h-screen px-6 py-16" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: '#C97B84' }}>
            {t('settings.eyebrow')}
          </p>
          <h1
            className="mt-4 text-5xl font-serif"
            style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
          >
            {t('settings.title')}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8" style={{ color: '#746761' }}>
            {t('settings.body')}
          </p>
        </motion.div>

        {loading ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}>
            <p className="text-sm" style={{ color: '#8C7B75' }}>{t('settings.loading')}</p>
          </div>
        ) : error ? (
          <div className="mt-10 rounded-[28px] border p-8" style={{ backgroundColor: '#FFF2F2', borderColor: '#E7B8BD', color: '#A14A57' }}>
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div
              className="mt-10 rounded-[30px] border p-8"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(244,238,230,0.96) 100%)',
                borderColor: '#E8D7CC',
                boxShadow: '0 16px 34px rgba(139,90,80,0.07)',
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.25em]" style={{ color: '#C97B84' }}>
                  {t('settings.persistentProfile')}
                </p>
                <span
                  className="rounded-full px-3 py-1 text-xs"
                  style={{ backgroundColor: '#F1E4E6', color: '#8C4C59' }}
                >
                  {memoriesCount} {t('settings.memoryEntries')}
                </span>
              </div>

              <div
                className="mt-6 rounded-[24px] p-6"
                style={{ backgroundColor: '#FFFCF8', border: '1px solid #EFE3D8', color: '#322B29' }}
              >
                {summary ? (
                  <p className="text-sm leading-8 whitespace-pre-line">{summary}</p>
                ) : (
                  <p className="text-sm leading-8" style={{ color: '#8C7B75' }}>
                    {t('settings.empty')}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 grid gap-4">
              {sourceMemories.map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-[24px] border p-6"
                  style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium" style={{ color: '#3D3535' }}>
                      {memory.memory_type}
                    </p>
                    <span className="text-xs" style={{ color: '#8C7B75' }}>
                      {t('settings.confidence')} {memory.confidence.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7" style={{ color: '#746761' }}>
                    {memory.memory_text}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
