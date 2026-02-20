import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FiUploadCloud, FiX, FiFile, FiCheck, FiYoutube } from 'react-icons/fi'
import axios from 'axios'
import { API_URL } from '../config'

function FileUploadModal({ onClose, onSuccess, notebookId }) {
  const [activeTab, setActiveTab] = useState('files') // 'files' or 'youtube'
  const [files, setFiles] = useState([])
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadComplete, setUploadComplete] = useState(false)

  const onDrop = useCallback((acceptedFiles) => {
    setFiles(prev => [...prev, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/rtf': ['.rtf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc']
    },
    multiple: true
  })

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleFileUpload = async () => {
    if (files.length === 0) return

    setIsUploading(true)

    try {
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })

      await axios.post(`${API_URL}/upload-documents/${notebookId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setUploadComplete(true)
      setTimeout(() => {
        onSuccess()
      }, 1000)
    } catch (error) {
      console.error('Error uploading files:', error)
      alert('Error uploading files. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleYoutubeSubmit = async () => {
    if (!youtubeUrl.trim()) return

    setIsUploading(true)

    try {
      await axios.post(`${API_URL}/add-youtube/${notebookId}`, {
        url: youtubeUrl.trim()
      })

      setUploadComplete(true)
      setTimeout(() => {
        onSuccess()
      }, 1000)
    } catch (error) {
      console.error('Error adding YouTube video:', error)
      const errorMsg = error.response?.data?.detail || 'Error adding YouTube video. Please check the URL and try again.'
      alert(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  const handleUpload = () => {
    if (activeTab === 'files') {
      handleFileUpload()
    } else {
      handleYoutubeSubmit()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Sources</h2>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 20px', borderBottom: '1px solid var(--border)', marginTop: '10px'}}>
          <button
            onClick={() => setActiveTab('files')}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'files' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'files' ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FiUploadCloud /> Upload Files
          </button>
          <button
            onClick={() => setActiveTab('youtube')}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'youtube' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'youtube' ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FiYoutube /> YouTube Video
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'files' ? (
            <>
              <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                <input {...getInputProps()} />
                <div className="dropzone-icon">
                  <FiUploadCloud />
                </div>
                {isDragActive ? (
                  <p>Drop the files here...</p>
                ) : (
                  <>
                    <p>
                      <span className="highlight">Click to upload</span> or drag and drop
                    </p>
                    <p style={{ fontSize: '12px', marginTop: '4px' }}>
                      PDF, TXT, MD, RTF, DOCX, DOC files
                    </p>
                  </>
                )}
              </div>

              {files.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                    Selected Files ({files.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {files.map((file, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px',
                          backgroundColor: 'var(--bg-secondary)',
                          borderRadius: '8px',
                          fontSize: '13px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FiFile />
                          <span>{file.name}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        {!isUploading && !uploadComplete && (
                          <button
                            onClick={() => removeFile(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--error)',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <FiX />
                          </button>
                        )}
                        {uploadComplete && (
                          <FiCheck style={{ color: 'var(--success)' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
                  YouTube Video URL
                </label>
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={isUploading || uploadComplete}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid white',
                    backgroundColor: 'var(--bg-secondary)',
                    fontSize: '14px',
                    outline: 'none',
                    color: 'var(--text-primary)'
                  }}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '8px' }}>
                  Paste a YouTube video URL. The transcript will be automatically extracted.
                </p>
              </div>
              {uploadComplete && (
                <div style={{
                  padding: '12px',
                  backgroundColor: 'var(--success-bg)',
                  borderRadius: '8px',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <FiCheck /> Video added successfully!
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={onClose}
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            className="confirm-button"
            onClick={handleUpload}
            disabled={
              (activeTab === 'files' && files.length === 0) ||
              (activeTab === 'youtube' && !youtubeUrl.trim()) ||
              isUploading ||
              uploadComplete
            }
          >
            {isUploading
              ? activeTab === 'files' ? 'Uploading...' : 'Adding...'
              : uploadComplete
              ? 'Complete!'
              : activeTab === 'files'
              ? `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`
              : 'Add Video'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default FileUploadModal
