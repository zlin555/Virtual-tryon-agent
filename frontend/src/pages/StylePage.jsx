import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import api from '../api/client'
import useAgentChat from '../hooks/useAgentChat'
import { useSavedLooks } from '../context/SavedLooksContext'
import { useLanguage } from '../context/LanguageContext'
import useAuth from '../hooks/useAuth'

const AESTHETICS = [
  'Minimalist', 'Streetwear', 'Bohemian', 'Preppy', 'Dark Academia',
  'Y2K', 'Coastal', 'Office-Core', 'Cottagecore', 'Romantic', 'Edgy',
]
const OCCASIONS = ['Everyday', 'Work', 'Date Night', 'Weekend', 'Formal', 'Beach', 'Party']
const GENDERS = ['Women', 'Men', 'Unisex']

function ImageCell({ onFile }) {
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return
      setPreview(URL.createObjectURL(file))
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const { data } = await api.post('/upload-image', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        onFile(data.image_url)
      } catch {
        // Keep local preview even if upload fails.
      } finally {
        setUploading(false)
      }
    },
  })

  return (
    <div
      {...getRootProps()}
      className="aspect-square rounded-xl overflow-hidden cursor-pointer flex items-center justify-center transition-all duration-200"
      style={{
        border: `2px dashed ${isDragActive ? '#C97B84' : '#E8B4BA'}`,
        backgroundColor: isDragActive ? 'rgba(201,123,132,0.06)' : '#F0EBE3',
      }}
    >
      <input {...getInputProps()} />
      {preview ? (
        <div className="relative w-full h-full">
          <img src={preview} alt="" className="w-full h-full object-cover" />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <span className="text-2xl opacity-40">+</span>
      )}
    </div>
  )
}

function RecommendationCard({ rec, onTryOn, onSave, canSave, t }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{ backgroundColor: '#F4EEE6', boxShadow: '0 10px 24px rgba(139,90,80,0.08)' }}
    >
      <div className="aspect-square overflow-hidden bg-white">
        <img
          src={rec.image_url || rec.imageUrl}
          alt={rec.title}
          className="w-full h-full object-cover"
          onError={(event) => { event.target.style.display = 'none' }}
        />
      </div>
      <div className="p-4">
        <p className="font-serif text-sm mb-1 line-clamp-1" style={{ fontFamily: "'Playfair Display', serif", color: '#241F1F' }}>
          {rec.title}
        </p>
        {(rec.metadata?.color || rec.metadata?.articleType || rec.metadata?.usage || rec.metadata?.price_usd) && (
          <p className="text-xs mb-3" style={{ color: '#8C7B75' }}>
            {[
              rec.metadata?.color,
              rec.metadata?.articleType,
              rec.metadata?.usage,
              rec.metadata?.price_usd ? `$${rec.metadata.price_usd}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex gap-2">
          {canSave && (
            <button
              onClick={() => onSave(rec)}
              className="flex-1 py-2 rounded-full text-xs border transition-all duration-200 hover:scale-[1.02]"
              style={{ borderColor: '#C97B84', color: '#C97B84' }}
            >
              {t('style.save')}
            </button>
          )}
          <button
            onClick={() => onTryOn(rec.image_url || rec.imageUrl, rec.metadata?.category || rec.metadata?.articleType, rec)}
            className="flex-1 py-2 rounded-full text-xs text-white transition-all duration-200 hover:scale-[1.02]"
            style={{ backgroundColor: '#C97B84' }}
          >
            {t('style.tryOn')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function StyleDNARow({ keywords = [], t }) {
  if (!keywords.length) return null
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: 'linear-gradient(135deg, rgba(61,43,43,0.98) 0%, rgba(26,26,26,0.98) 100%)',
        borderColor: 'rgba(232,180,186,0.18)',
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.25em] mb-3" style={{ color: '#E8B4BA' }}>
        {t('style.styleDna')}
      </p>
      <div className="flex flex-wrap gap-2">
        {keywords.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'rgba(201,123,132,0.22)', color: '#F2D7DB' }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}

function AssistantTurn({ turn, onTryOn, onSave, canSave, t }) {
  const assistantText = turn.assistantMessage
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/https?:\/\/[^\s)\]>"']+/g, '')
    .trim()

  return (
    <div className="space-y-4">
      <div className="flex justify-start">
        <div
          className="max-w-3xl rounded-[28px] px-6 py-5 border text-sm leading-7"
          style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC', color: '#2F2928' }}
        >
          {assistantText || t('style.recommendationsUpdated')}
        </div>
      </div>

      {turn.styleDNA?.length > 0 && <StyleDNARow keywords={turn.styleDNA} t={t} />}

      {turn.recommendations?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {turn.recommendations.map((rec, index) => (
            <RecommendationCard
              key={`${turn.id}-${rec.title}-${index}`}
              rec={rec}
              onTryOn={onTryOn}
              onSave={onSave}
              canSave={canSave}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function StylePage() {
  const navigate = useNavigate()
  const { saveLook } = useSavedLooks()
  const { user } = useAuth()
  const { t, optionLabel, language, isChinese } = useLanguage()
  const { turns, loading, warmingUp, error, sendMessage, reset } = useAgentChat()

  const [description, setDescription] = useState('')
  const [selectedGender, setSelectedGender] = useState('')
  const [selectedAesthetics, setSelectedAesthetics] = useState([])
  const [selectedOccasions, setSelectedOccasions] = useState([])
  const [refImageUrls, setRefImageUrls] = useState(['', '', '', ''])
  const [chatInput, setChatInput] = useState('')
  const [analyzed, setAnalyzed] = useState(false)
  const chatScrollRef = useRef(null)

  useEffect(() => {
    if (analyzed) {
      window.setTimeout(() => {
        chatScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 120)
    }
  }, [turns, analyzed])

  const toggleChip = (items, setItems, value) => {
    setItems(items.includes(value) ? items.filter((item) => item !== value) : [...items, value])
  }

  const handleAnalyze = async () => {
    const genderLabel = selectedGender ? optionLabel('gender', selectedGender) : ''
    const aestheticLabels = selectedAesthetics.map((value) => optionLabel('aesthetic', value))
    const occasionLabels = selectedOccasions.map((value) => optionLabel('occasion', value))

    const genderText = genderLabel ? `${t('style.gender')}: ${genderLabel}.` : ''
    const aestheticsText = aestheticLabels.length ? `${t('style.aesthetic')}: ${aestheticLabels.join(', ')}.` : ''
    const occasionsText = occasionLabels.length ? `${t('style.occasion')}: ${occasionLabels.join(', ')}.` : ''

    const prompt = [
      description,
      genderText,
      aestheticsText,
      occasionsText,
      isChinese
        ? '请基于这些信息分析我的风格画像，并推荐 9 套最匹配的穿搭。'
        : 'Based on this, analyze my style profile and recommend 9 outfits that match these preferences.',
    ].filter(Boolean).join(' ')

    const styleImageUrl = refImageUrls.find(Boolean) || null

    reset()
    setAnalyzed(true)
    await sendMessage(prompt, styleImageUrl, language)
  }

  const handleChatSend = async () => {
    if (!chatInput.trim() || loading) return
    const nextMessage = chatInput.trim()
    setChatInput('')
    await sendMessage(nextMessage, null, language)
  }

  const handleBackForNewChat = () => {
    reset()
    setChatInput('')
    setAnalyzed(false)
  }

  const handleTryOn = (garmentUrl, category, recommendation) => {
    const params = new URLSearchParams({ garment: garmentUrl })
    if (category) params.set('type', category)
    if (recommendation?.title) params.set('title', recommendation.title)
    if (recommendation?.image_id) params.set('productId', recommendation.image_id)
    navigate(`/try-on?${params.toString()}`)
  }

  return (
    <div
      className="min-h-screen px-6"
      style={{
        backgroundColor: '#FAF7F2',
        backgroundImage: 'radial-gradient(circle at top, rgba(201,123,132,0.08), transparent 24%)',
      }}
    >
      {!analyzed ? (
        <div className="max-w-4xl mx-auto py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-14"
          >
            <h1 className="text-5xl font-serif mb-3" style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}>
              {t('style.title')}
            </h1>
            <p style={{ color: '#8C7B75' }}>{t('style.subtitle')}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 rounded-[28px]"
            style={{ backgroundColor: '#F0EBE3', boxShadow: '0 18px 40px rgba(139,90,80,0.08)' }}
          >
            <label className="block text-sm font-medium mb-2" style={{ color: '#3D3535' }}>
              {t('style.describeLabel')}
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              placeholder={t('style.describePlaceholder')}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y mb-6"
              style={{ backgroundColor: '#FAF7F2', border: '1.5px solid #E8B4BA', color: '#1A1A1A' }}
            />

            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>{t('style.gender')}</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {GENDERS.map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setSelectedGender(selectedGender === gender ? '' : gender)}
                  className="px-4 py-1.5 rounded-full text-xs transition-all duration-200"
                  style={{
                    backgroundColor: selectedGender === gender ? '#6B8CAE' : '#FAF7F2',
                    color: selectedGender === gender ? 'white' : '#8C7B75',
                    border: `1px solid ${selectedGender === gender ? '#6B8CAE' : '#E8B4BA'}`,
                  }}
                >
                  {optionLabel('gender', gender)}
                </button>
              ))}
            </div>

            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>{t('style.aesthetic')}</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {AESTHETICS.map((aesthetic) => (
                <button
                  key={aesthetic}
                  type="button"
                  onClick={() => toggleChip(selectedAesthetics, setSelectedAesthetics, aesthetic)}
                  className="px-4 py-1.5 rounded-full text-xs transition-all duration-200"
                  style={{
                    backgroundColor: selectedAesthetics.includes(aesthetic) ? '#C97B84' : '#FAF7F2',
                    color: selectedAesthetics.includes(aesthetic) ? 'white' : '#8C7B75',
                    border: `1px solid ${selectedAesthetics.includes(aesthetic) ? '#C97B84' : '#E8B4BA'}`,
                  }}
                >
                  {optionLabel('aesthetic', aesthetic)}
                </button>
              ))}
            </div>

            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>{t('style.occasion')}</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {OCCASIONS.map((occasion) => (
                <button
                  key={occasion}
                  type="button"
                  onClick={() => toggleChip(selectedOccasions, setSelectedOccasions, occasion)}
                  className="px-4 py-1.5 rounded-full text-xs transition-all duration-200"
                  style={{
                    backgroundColor: selectedOccasions.includes(occasion) ? '#8A9E8C' : '#FAF7F2',
                    color: selectedOccasions.includes(occasion) ? 'white' : '#8C7B75',
                    border: `1px solid ${selectedOccasions.includes(occasion) ? '#8A9E8C' : '#E8B4BA'}`,
                  }}
                >
                  {optionLabel('occasion', occasion)}
                </button>
              ))}
            </div>

            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>
              {t('style.referenceImages')} <span style={{ color: '#8C7B75' }}>{t('style.optionalUpTo4')}</span>
            </p>
            <div className="grid grid-cols-4 gap-3 mb-8">
              {refImageUrls.map((_, index) => (
                <ImageCell
                  key={index}
                  onFile={(url) => {
                    const next = [...refImageUrls]
                    next[index] = url
                    setRefImageUrls(next)
                  }}
                />
              ))}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!selectedGender || (!description.trim() && !selectedAesthetics.length) || loading}
              className="w-full py-4 rounded-full text-white font-medium text-sm transition-all duration-300 disabled:opacity-60 hover:scale-[1.01]"
              style={{ backgroundColor: '#C97B84' }}
            >
              {loading
                ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    {warmingUp || t('style.loadingCatalog')}
                  </span>
                )
                : !selectedGender
                  ? t('style.selectGender')
                  : t('style.analyze')}
            </button>
          </motion.div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto pt-10 pb-44">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.28em]" style={{ color: '#C97B84' }}>
                {t('style.styleConversation')}
              </p>
              <h1 className="mt-3 text-4xl font-serif" style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}>
                {t('style.curateRefine')}
              </h1>
            </div>
            <button
              type="button"
              onClick={handleBackForNewChat}
              className="rounded-full px-5 py-2.5 text-sm border transition-colors"
              style={{ borderColor: '#E8B4BA', color: '#8C7B75', backgroundColor: '#FFFCF8' }}
            >
              {t('style.backForNewChat')}
            </button>
          </div>

          <div className="space-y-10">
            {turns.map((turn) => (
              <section key={turn.id} className="space-y-5">
                <div className="flex justify-end">
                  <div
                    className="max-w-3xl rounded-[30px] px-6 py-5 text-sm leading-7"
                    style={{ backgroundColor: '#EFE7DF', color: '#2F2928' }}
                  >
                    {turn.userMessage}
                  </div>
                </div>

                <AssistantTurn
                  turn={turn}
                  onTryOn={handleTryOn}
                  onSave={saveLook}
                  canSave={Boolean(user)}
                  t={t}
                />
              </section>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-[28px] px-5 py-4 border"
                  style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC' }}
                >
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((index) => (
                      <motion.div
                        key={index}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: '#C97B84' }}
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ repeat: Infinity, duration: 1.2, delay: index * 0.15 }}
                      />
                    ))}
                  </div>
                  {warmingUp && (
                    <p className="mt-3 text-xs" style={{ color: '#8C7B75' }}>
                      {warmingUp}
                    </p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div
                className="rounded-2xl px-5 py-4 text-sm border"
                style={{ backgroundColor: '#FFF2F2', borderColor: '#E7B8BD', color: '#A14A57' }}
              >
                {error}
              </div>
            )}

            <div ref={chatScrollRef} />
          </div>

          <div
            className="fixed bottom-0 left-0 right-0 z-40 px-6 py-5"
            style={{ background: 'linear-gradient(180deg, rgba(250,247,242,0) 0%, rgba(250,247,242,0.96) 20%, rgba(250,247,242,1) 100%)' }}
          >
            <div
              className="max-w-6xl mx-auto rounded-[30px] border px-5 py-4"
              style={{ backgroundColor: '#FFFCF8', borderColor: '#E8D7CC', boxShadow: '0 18px 35px rgba(139,90,80,0.08)' }}
            >
              <div className="flex items-end gap-3">
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      handleChatSend()
                    }
                  }}
                  rows={1}
                  placeholder={t('style.refinePlaceholder')}
                  className="flex-1 bg-transparent resize-none outline-none text-sm leading-6"
                  style={{ color: '#1A1A1A' }}
                />
                <button
                  onClick={handleChatSend}
                  disabled={loading || !chatInput.trim()}
                  className="shrink-0 rounded-full px-5 py-2.5 text-white text-sm font-medium disabled:opacity-40 transition-all hover:scale-[1.01]"
                  style={{ backgroundColor: '#C97B84' }}
                >
                  {t('style.send')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
