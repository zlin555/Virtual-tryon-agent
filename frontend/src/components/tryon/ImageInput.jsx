import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '../../api/client'
import { useLanguage } from '../../context/LanguageContext'

export default function ImageInput({ label, value, onChange }) {
  const { isChinese } = useLanguage()
  const [tab, setTab] = useState('url')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [localPreview, setLocalPreview] = useState(null)

  const onDrop = useCallback(async (accepted) => {
    const file = accepted[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
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
      setUploadError(err.response?.data?.detail || (isChinese ? '上传失败，可以先尝试直接粘贴图片链接。' : 'Upload failed. Try a URL instead.'))
      setLocalPreview(null)
    } finally {
      setUploading(false)
    }
  }, [isChinese, onChange])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
  })

  const previewSrc = localPreview || (value?.startsWith('http') ? value : null)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" style={{ color: '#3D3535' }}>{label}</span>

      <div className="flex rounded-full overflow-hidden border text-sm" style={{ borderColor: '#E8B4BA' }}>
        {['url', 'upload'].map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className="flex-1 py-1.5 transition-colors duration-200 capitalize"
            style={{
              backgroundColor: tab === tabKey ? '#C97B84' : 'transparent',
              color: tab === tabKey ? 'white' : '#8C7B75',
            }}
          >
            {tabKey === 'url' ? (isChinese ? '粘贴链接' : 'Paste URL') : (isChinese ? '上传文件' : 'Upload File')}
          </button>
        ))}
      </div>

      {tab === 'url' ? (
        <input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://"
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
          style={{
            backgroundColor: '#F0EBE3',
            border: '1.5px solid #E8B4BA',
            color: '#1A1A1A',
          }}
          onFocus={(event) => { event.target.style.borderColor = '#C97B84' }}
          onBlur={(event) => { event.target.style.borderColor = '#E8B4BA' }}
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
              <span className="text-xs" style={{ color: '#8C7B75' }}>{isChinese ? '上传中...' : 'Uploading...'}</span>
            </div>
          ) : (
            <>
              <span className="text-2xl">+</span>
              <span className="text-xs text-center" style={{ color: '#8C7B75' }}>
                {isDragActive
                  ? (isChinese ? '拖到这里即可' : 'Drop it here!')
                  : (isChinese ? '拖拽图片到这里，或点击选择文件' : 'Drag & drop or click to browse')}
              </span>
              <span className="text-xs" style={{ color: '#C97B84' }}>
                {isChinese ? '支持 JPG、PNG、WebP' : 'JPG, PNG, WebP'}
              </span>
            </>
          )}
        </div>
      )}

      {uploadError && (
        <p className="text-xs" style={{ color: '#A55E67' }}>{uploadError}</p>
      )}

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
