import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '../../api/client'

/**
 * Reusable image input: tab between URL paste and file upload.
 * On file drop, automatically uploads to imgbb via /api/upload-image
 * and calls onUrlReady(url) once the public URL is available.
 *
 * Props:
 *   label        – field label string
 *   value        – current URL string (controlled)
 *   onChange     – (url: string) => void
 *   preview      – boolean, show inline preview thumbnail
 */
export default function ImageInput({ label, value, onChange }) {
  const [tab, setTab] = useState('url') // 'url' | 'upload'
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [localPreview, setLocalPreview] = useState(null)

  const onDrop = useCallback(async (accepted) => {
    const file = accepted[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    // Local object URL for instant preview while uploading
    const objectUrl = URL.createObjectURL(file)
    setLocalPreview(objectUrl)

    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onChange(data.image_url)
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload failed. Try a URL instead.')
      setLocalPreview(null)
    } finally {
      setUploading(false)
    }
  }, [onChange])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
  })

  const previewSrc = localPreview || (value?.startsWith('http') ? value : null)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" style={{ color: '#3D3535' }}>{label}</span>

      {/* Tab switcher */}
      <div className="flex rounded-full overflow-hidden border text-sm" style={{ borderColor: '#E8B4BA' }}>
        {['url', 'upload'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1.5 transition-colors duration-200 capitalize"
            style={{
              backgroundColor: tab === t ? '#C97B84' : 'transparent',
              color: tab === t ? 'white' : '#8C7B75',
            }}
          >
            {t === 'url' ? 'Paste URL' : 'Upload File'}
          </button>
        ))}
      </div>

      {tab === 'url' ? (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
          style={{
            backgroundColor: '#F0EBE3',
            border: '1.5px solid #E8B4BA',
            color: '#1A1A1A',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#C97B84')}
          onBlur={(e) => (e.target.style.borderColor = '#E8B4BA')}
        />
      ) : (
        <div
          {...getRootProps()}
          className="relative flex flex-col items-center justify-center gap-2 rounded-xl py-8 cursor-pointer transition-all duration-200"
          style={{
            border: `2px dashed ${isDragActive ? '#C97B84' : '#E8B4BA'}`,
            backgroundColor: isDragActive ? 'rgba(201,123,132,0.06)' : '#F0EBE3',
          }}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#C97B84', borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: '#8C7B75' }}>Uploading…</span>
            </div>
          ) : (
            <>
              <span className="text-2xl">📂</span>
              <span className="text-xs text-center" style={{ color: '#8C7B75' }}>
                {isDragActive ? 'Drop it here!' : 'Drag & drop or click to browse'}
              </span>
              <span className="text-xs" style={{ color: '#C97B84' }}>JPG, PNG, WebP</span>
            </>
          )}
        </div>
      )}

      {uploadError && (
        <p className="text-xs" style={{ color: '#A55E67' }}>{uploadError}</p>
      )}

      {/* Preview thumbnail */}
      {previewSrc && (
        <img
          src={previewSrc}
          alt={label}
          className="w-full object-cover rounded-xl mt-1"
          style={{ maxHeight: 200 }}
        />
      )}
    </div>
  )
}
