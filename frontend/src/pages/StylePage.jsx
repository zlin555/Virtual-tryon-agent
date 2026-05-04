import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import api from '../api/client'
import useAgentChat from '../hooks/useAgentChat'
import { useSavedLooks } from '../context/SavedLooksContext'

const AESTHETICS = [
  'Minimalist', 'Streetwear', 'Bohemian', 'Preppy', 'Dark Academia',
  'Y2K', 'Coastal', 'Office-Core', 'Cottagecore', 'Romantic', 'Edgy',
]
const OCCASIONS = ['Everyday', 'Work', 'Date Night', 'Weekend', 'Formal', 'Beach', 'Party']
const GENDERS = ['Women', 'Men', 'Unisex']

// ── Reference Image Upload Cell ───────────────────────────────────────────────
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
      } catch (_) { /* silent fail — image still shows locally */ }
      finally { setUploading(false) }
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

// ── Recommendation Card ───────────────────────────────────────────────────────
function RecommendationCard({ rec, onTryOn, onSave }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: '0 16px 40px rgba(139,90,80,0.14)' }}
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{ backgroundColor: '#F0EBE3', boxShadow: '0 2px 16px rgba(139,90,80,0.08)' }}
    >
      <div className="aspect-square overflow-hidden bg-white">
        <img
          src={rec.image_url || rec.imageUrl}
          alt={rec.title}
          className="w-full h-full object-cover"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      </div>
      <div className="p-4">
        <p className="font-serif text-sm mb-1 line-clamp-1" style={{ fontFamily: "'Playfair Display', serif" }}>
          {rec.title}
        </p>
        {(rec.metadata?.color || rec.metadata?.articleType || rec.metadata?.usage) && (
          <p className="text-xs mb-1" style={{ color: '#8C7B75' }}>
            {[rec.metadata?.color, rec.metadata?.articleType, rec.metadata?.usage].filter(Boolean).join(' · ')}
          </p>
        )}
        {rec.metadata?.price_usd != null && (
          <p className="text-sm font-medium mb-3" style={{ color: '#8B5A50' }}>
            ${Number(rec.metadata.price_usd).toFixed(2)}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onSave(rec.image_url || rec.imageUrl)}
            className="flex-1 py-1.5 rounded-full text-xs border transition-all duration-200 hover:scale-105"
            style={{ borderColor: '#C97B84', color: '#C97B84' }}
          >
            ♡ Save
          </button>
          <button
            onClick={() => onTryOn(rec.image_url || rec.imageUrl, rec.metadata?.category || rec.metadata?.articleType)}
            className="flex-1 py-1.5 rounded-full text-xs text-white transition-all duration-200 hover:scale-105"
            style={{ backgroundColor: '#C97B84' }}
          >
            Try On →
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── StyleDNA Card ─────────────────────────────────────────────────────────────
function StyleDNACard({ keywords }) {
  if (!keywords || keywords.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="p-8 rounded-2xl mb-10"
      style={{ background: 'linear-gradient(135deg, #3D2B2B 0%, #1A1A1A 100%)', color: 'white' }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: '#E8B4BA' }}>Your Style DNA</p>
      <div className="flex flex-wrap gap-2">
        {keywords.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'rgba(201,123,132,0.25)', color: '#E8B4BA' }}
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

// ── Main StylePage ────────────────────────────────────────────────────────────
export default function StylePage() {
  const navigate = useNavigate()
  const { saveLook } = useSavedLooks()
  const { history, recommendations, styleDNA, loading, warmingUp, sendMessage } = useAgentChat()

  const [description, setDescription] = useState('')
  const [selectedGender, setSelectedGender] = useState('')
  const [selectedAesthetics, setSelectedAesthetics] = useState([])
  const [selectedOccasions, setSelectedOccasions] = useState([])
  const [refImageUrls, setRefImageUrls] = useState(['', '', '', ''])
  const [chatInput, setChatInput] = useState('')
  const [analyzed, setAnalyzed] = useState(false)
  const chatBottomRef = useRef(null)

  const toggleChip = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  const handleAnalyze = async () => {
    const genderText = selectedGender ? `Gender: ${selectedGender}.` : ''
    const aestheticsText = selectedAesthetics.length ? `Style aesthetics: ${selectedAesthetics.join(', ')}.` : ''
    const occasionsText = selectedOccasions.length ? `Occasions: ${selectedOccasions.join(', ')}.` : ''

    const prompt = [
      description,
      genderText,
      aestheticsText,
      occasionsText,
      'Based on this, analyze my style profile and recommend 6 outfits that match these preferences.',
    ].filter(Boolean).join(' ')

    // Pass the first uploaded reference image URL for visual analysis by the backend
    const styleImageUrl = refImageUrls.find(Boolean) || null

    setAnalyzed(false)
    await sendMessage(prompt, styleImageUrl)
    setAnalyzed(true)
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)
  }

  const handleChatSend = async () => {
    if (!chatInput.trim() || loading) return
    const msg = chatInput
    setChatInput('')
    await sendMessage(msg)
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)
  }

  const handleTryOn = (garmentUrl, category) => {
    const params = new URLSearchParams({ garment: garmentUrl })
    if (category) params.set('type', category)
    navigate(`/try-on?${params.toString()}`)
  }

  return (
    <div className="min-h-screen py-16 px-6" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-14"
        >
          <h1 className="text-5xl font-serif mb-3" style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}>
            Style Explorer
          </h1>
          <p style={{ color: '#8C7B75' }}>Tell us your aesthetic. We'll curate outfits made for you.</p>
        </motion.div>

        {/* ── Style Form ─────────────────────────────────────── */}
        {!analyzed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="p-8 rounded-2xl mb-10"
            style={{ backgroundColor: '#F0EBE3', boxShadow: '0 2px 16px rgba(139,90,80,0.08)' }}
          >
            {/* Description */}
            <label className="block text-sm font-medium mb-2" style={{ color: '#3D3535' }}>
              Describe your personal style
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="e.g. I love clean lines, neutral tones, and relaxed silhouettes that work from the office to a dinner…"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-y mb-6"
              style={{ backgroundColor: '#FAF7F2', border: '1.5px solid #E8B4BA', color: '#1A1A1A' }}
              onFocus={(e) => (e.target.style.borderColor = '#C97B84')}
              onBlur={(e) => (e.target.style.borderColor = '#E8B4BA')}
            />

            {/* Gender */}
            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>Gender</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {GENDERS.map((g) => (
                <button
                  key={g} type="button"
                  onClick={() => setSelectedGender(selectedGender === g ? '' : g)}
                  className="px-4 py-1.5 rounded-full text-xs transition-all duration-200"
                  style={{
                    backgroundColor: selectedGender === g ? '#6B8CAE' : '#FAF7F2',
                    color: selectedGender === g ? 'white' : '#8C7B75',
                    border: `1px solid ${selectedGender === g ? '#6B8CAE' : '#E8B4BA'}`,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Aesthetics */}
            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>Aesthetic</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {AESTHETICS.map((a) => (
                <button
                  key={a} type="button"
                  onClick={() => toggleChip(selectedAesthetics, setSelectedAesthetics, a)}
                  className="px-4 py-1.5 rounded-full text-xs transition-all duration-200"
                  style={{
                    backgroundColor: selectedAesthetics.includes(a) ? '#C97B84' : '#FAF7F2',
                    color: selectedAesthetics.includes(a) ? 'white' : '#8C7B75',
                    border: `1px solid ${selectedAesthetics.includes(a) ? '#C97B84' : '#E8B4BA'}`,
                  }}
                >
                  {a}
                </button>
              ))}
            </div>

            {/* Occasions */}
            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>Occasion</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {OCCASIONS.map((o) => (
                <button
                  key={o} type="button"
                  onClick={() => toggleChip(selectedOccasions, setSelectedOccasions, o)}
                  className="px-4 py-1.5 rounded-full text-xs transition-all duration-200"
                  style={{
                    backgroundColor: selectedOccasions.includes(o) ? '#8A9E8C' : '#FAF7F2',
                    color: selectedOccasions.includes(o) ? 'white' : '#8C7B75',
                    border: `1px solid ${selectedOccasions.includes(o) ? '#8A9E8C' : '#E8B4BA'}`,
                  }}
                >
                  {o}
                </button>
              ))}
            </div>

            {/* Reference images */}
            <p className="text-sm font-medium mb-3" style={{ color: '#3D3535' }}>
              Reference Images <span style={{ color: '#8C7B75' }}>(optional — up to 4)</span>
            </p>
            <div className="grid grid-cols-4 gap-3 mb-8">
              {refImageUrls.map((_, i) => (
                <ImageCell
                  key={i}
                  onFile={(url) => {
                    const next = [...refImageUrls]
                    next[i] = url
                    setRefImageUrls(next)
                  }}
                />
              ))}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!selectedGender || (!description.trim() && !selectedAesthetics.length) || loading}
              className="w-full py-4 rounded-full text-white font-medium text-sm transition-all duration-300 disabled:opacity-60 hover:scale-105"
              style={{ backgroundColor: '#C97B84' }}
            >
              {loading
                ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    {warmingUp || 'Searching catalog…'}
                  </span>
                )
                : !selectedGender
                  ? 'Select a Gender to Continue'
                  : 'Analyze My Style →'
              }
            </button>
          </motion.div>
        )}

        {/* ── Post-analysis view ─────────────────────────────── */}
        <AnimatePresence>
          {analyzed && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col gap-2 mb-6"
            >
              <button
                onClick={() => { setAnalyzed(false) }}
                className="self-start text-xs flex items-center gap-1"
                style={{ color: '#8C7B75' }}
              >
                ← Edit preferences
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* StyleDNA */}
        {styleDNA && styleDNA.length > 0 && <StyleDNACard keywords={styleDNA} />}

        {/* Recommendations grid */}
        {recommendations.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-serif mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
              Curated for You
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {recommendations.map((rec, i) => (
                <RecommendationCard
                  key={`${rec.title}-${i}`}
                  rec={rec}
                  onTryOn={handleTryOn}
                  onSave={saveLook}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Agent Chat ─────────────────────────────────────── */}
        {analyzed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#F0EBE3', boxShadow: '0 2px 16px rgba(139,90,80,0.08)' }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: '#E8B4BA' }}>
              <p className="text-sm font-medium" style={{ color: '#3D3535' }}>Refine with AI</p>
              <p className="text-xs" style={{ color: '#8C7B75' }}>
                "Show more casual options" · "Something for summer?" · "Try a bolder color"
              </p>
            </div>

            {/* Message history */}
            <div className="px-6 py-4 flex flex-col gap-4 max-h-80 overflow-y-auto">
              {history.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                    style={{
                      backgroundColor: msg.role === 'user' ? '#C97B84' : '#FAF7F2',
                      color: msg.role === 'user' ? 'white' : '#1A1A1A',
                      border: msg.role === 'assistant' ? '1px solid #E8B4BA' : 'none',
                    }}
                  >
                    {/* Strip json code blocks, markdown images, and bare URLs from display */}
                    {msg.content
                      .replace(/```json[\s\S]*?```/g, '[Recommendations updated ✦]')
                      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
                      .replace(/https?:\/\/[^\s)\]>"']+/g, '')}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl" style={{ backgroundColor: '#FAF7F2', border: '1px solid #E8B4BA' }}>
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: '#C97B84' }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input row */}
            <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: '#E8B4BA' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                placeholder="Refine your recommendations…"
                className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
                style={{ backgroundColor: '#FAF7F2', border: '1.5px solid #E8B4BA', color: '#1A1A1A' }}
                onFocus={(e) => (e.target.style.borderColor = '#C97B84')}
                onBlur={(e) => (e.target.style.borderColor = '#E8B4BA')}
              />
              <button
                onClick={handleChatSend}
                disabled={loading || !chatInput.trim()}
                className="px-5 py-2.5 rounded-full text-white text-sm font-medium disabled:opacity-40 transition-all hover:scale-105"
                style={{ backgroundColor: '#C97B84' }}
              >
                Send
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
