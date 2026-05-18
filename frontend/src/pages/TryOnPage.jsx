import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import ImageInput from '../components/tryon/ImageInput'
import useTryOn from '../hooks/useTryOn'
import { useSavedLooks } from '../context/SavedLooksContext'
import { useLanguage } from '../context/LanguageContext'
import useAuth from '../hooks/useAuth'

const GARMENT_TYPES = ['top', 'jacket', 'coat', 'dress', 'pants', 'skirt', 'shorts']

export default function TryOnPage() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const { t, optionLabel } = useLanguage()

  const [personUrl, setPersonUrl] = useState('')
  const [garmentUrl, setGarmentUrl] = useState(params.get('garment') || '')
  const [garmentType, setGarmentType] = useState(params.get('type') || '')
  const [garmentTitle, setGarmentTitle] = useState(params.get('title') || '')
  const [garmentProductId, setGarmentProductId] = useState(params.get('productId') || '')
  const [styleNote, setStyleNote] = useState('')

  const { status, resultUrl, message, runTryOn } = useTryOn()
  const { saveLook } = useSavedLooks()
  const { user } = useAuth()

  useEffect(() => {
    const nextParams = new URLSearchParams(location.search)
    setGarmentUrl(nextParams.get('garment') || '')
    setGarmentType(nextParams.get('type') || '')
    setGarmentTitle(nextParams.get('title') || '')
    setGarmentProductId(nextParams.get('productId') || '')
  }, [location.search])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!personUrl || !garmentUrl) return
    runTryOn({ personUrl, garmentUrl, garmentType, styleNote })
  }

  return (
    <div className="min-h-screen py-16 px-6" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <h1 className="text-5xl font-serif mb-3" style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}>
            {t('tryOn.title')}
          </h1>
          <p style={{ color: '#8C7B75' }}>{t('tryOn.subtitle')}</p>
        </motion.div>

        <form onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-5 gap-10 items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="md:col-span-2 flex flex-col gap-6 p-8 rounded-2xl"
              style={{ backgroundColor: '#F0EBE3', boxShadow: '0 2px 16px rgba(139,90,80,0.08)' }}
            >
              <ImageInput label={t('tryOn.yourPhoto')} value={personUrl} onChange={setPersonUrl} />
              <ImageInput label={t('tryOn.garmentImage')} value={garmentUrl} onChange={setGarmentUrl} />

              {garmentTitle && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: '#FAF7F2', border: '1px solid #E8B4BA', color: '#3D3535' }}
                >
                  {t('tryOn.selectedItem')}: {garmentTitle}
                </div>
              )}

              <div>
                <span className="text-sm font-medium block mb-2" style={{ color: '#3D3535' }}>{t('tryOn.garmentType')}</span>
                <div className="flex flex-wrap gap-2">
                  {GARMENT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setGarmentType(garmentType === type ? '' : type)}
                      className="px-3 py-1 rounded-full text-xs transition-all duration-200"
                      style={{
                        backgroundColor: garmentType === type ? '#C97B84' : '#FAF7F2',
                        color: garmentType === type ? 'white' : '#8C7B75',
                        border: `1px solid ${garmentType === type ? '#C97B84' : '#E8B4BA'}`,
                      }}
                    >
                      {optionLabel('garmentType', type)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2" style={{ color: '#3D3535' }}>
                  {t('tryOn.styleNote')} <span style={{ color: '#8C7B75' }}>{t('tryOn.optional')}</span>
                </label>
                <input
                  type="text"
                  value={styleNote}
                  onChange={(event) => setStyleNote(event.target.value)}
                  placeholder={t('tryOn.stylePlaceholder')}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: '#FAF7F2', border: '1.5px solid #E8B4BA', color: '#1A1A1A' }}
                  onFocus={(event) => { event.target.style.borderColor = '#C97B84' }}
                  onBlur={(event) => { event.target.style.borderColor = '#E8B4BA' }}
                />
              </div>

              <button
                type="submit"
                disabled={!personUrl || !garmentUrl || status === 'loading'}
                className="w-full py-4 rounded-full text-white font-medium transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
                style={{ backgroundColor: '#C97B84' }}
              >
                {status === 'loading' ? t('tryOn.processing') : t('tryOn.tryOn')}
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="md:col-span-3 flex flex-col gap-4"
            >
              <div
                className="w-full rounded-2xl overflow-hidden flex items-center justify-center"
                style={{ minHeight: 420, backgroundColor: '#F0EBE3', boxShadow: '0 2px 16px rgba(139,90,80,0.08)' }}
              >
                <AnimatePresence mode="wait">
                  {status === 'loading' && (
                    <motion.div
                      key="skeleton"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#E8B4BA', borderTopColor: '#C97B84' }} />
                      <p className="text-sm" style={{ color: '#8C7B75' }}>{t('tryOn.generating')}</p>
                      <p className="text-xs" style={{ color: '#8C7B75' }}>{t('tryOn.takesTime')}</p>
                    </motion.div>
                  )}

                  {status === 'success' && resultUrl && (
                    <motion.img
                      key="result"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5 }}
                      src={resultUrl}
                      alt="Try-on result"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {status === 'idle' && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-3 text-center p-8"
                    >
                      <span className="text-5xl opacity-30">+</span>
                      <p style={{ color: '#8C7B75' }}>{t('tryOn.resultHere')}</p>
                    </motion.div>
                  )}

                  {status === 'error' && (
                    <motion.div key="error" className="flex flex-col items-center gap-3 text-center p-8">
                      <span className="text-4xl">!</span>
                      <p className="text-sm" style={{ color: '#A55E67' }}>{message}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {status === 'success' && resultUrl && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => saveLook({
                      image_id: garmentProductId || garmentUrl,
                      title: garmentTitle || t('tryOn.savedGarmentFallback'),
                      image_url: garmentUrl,
                      metadata: {
                        category: garmentType || null,
                      },
                    })}
                    className="flex-1 py-3 rounded-full font-medium text-sm border transition-all duration-300 hover:scale-105"
                    style={{ borderColor: '#C97B84', color: '#C97B84', display: user ? 'block' : 'none' }}
                  >
                    {t('tryOn.saveGarment')}
                  </button>
                  <a
                    href={resultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 rounded-full font-medium text-sm text-center border transition-all duration-300 hover:scale-105"
                    style={{ borderColor: '#8C7B75', color: '#8C7B75' }}
                  >
                    {t('tryOn.openFullSize')}
                  </a>
                </motion.div>
              )}

              {message && status !== 'error' && (
                <p className="text-xs text-center" style={{ color: '#8C7B75' }}>{message}</p>
              )}
            </motion.div>
          </div>
        </form>
      </div>
    </div>
  )
}
