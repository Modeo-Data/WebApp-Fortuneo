import { useRef } from 'react'
import { Upload } from 'lucide-react'

export default function UploadButton({ onUpload, loading }) {
  const inputRef = useRef(null)

  function handleFileChange(e) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) {
      onUpload(files)
      e.target.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        style={{
          background: loading ? '#c4e09c' : '#88c648',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
        className="
          inline-flex items-center gap-2 px-4 py-2
          text-white text-sm font-medium
          rounded-lg shadow-sm transition-colors
        "
        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#6aaf35' }}
        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#88c648' }}
      >
        <Upload size={16} />
        {loading ? 'Analyse…' : 'Uploader'}
      </button>
    </>
  )
}
