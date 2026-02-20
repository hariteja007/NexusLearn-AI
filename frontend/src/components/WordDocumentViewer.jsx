import { useState, useEffect } from 'react'
import { FiFileText, FiChevronDown, FiDownload } from 'react-icons/fi'
import axios from 'axios'
import mammoth from 'mammoth'
import { API_URL } from '../config'

function WordDocumentViewer({ documents, notebookId, selectedDoc, onDocChange, metadata }) {
  const [htmlContent, setHtmlContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showDocList, setShowDocList] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (selectedDoc && notebookId) {
      fetchAndRenderDocument()
    }
  }, [selectedDoc, notebookId])

  const fetchAndRenderDocument = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const fileType = metadata?.file_type || 'docx'

      if (fileType === 'docx') {
        // For .docx files, use mammoth to convert to HTML
        const response = await axios.get(
          `${API_URL}/documents/${notebookId}/${selectedDoc.id}/content`,
          { responseType: 'arraybuffer' }
        )

        const result = await mammoth.convertToHtml({ arrayBuffer: response.data })
        setHtmlContent(result.value)

        if (result.messages.length > 0) {
          console.warn('Mammoth conversion warnings:', result.messages)
        }
      } else {
        // For .doc files, we can't render directly, so show download option
        setHtmlContent(null)
      }
    } catch (error) {
      console.error('Error loading document:', error)
      setError('Error loading document. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    const downloadUrl = `${API_URL}/documents/${notebookId}/${selectedDoc.id}/content`
    window.open(downloadUrl, '_blank')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Document Selector Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-secondary)',
        gap: '16px'
      }}>
        {/* Back Button */}
        <button
          onClick={() => onDocChange?.(null)}
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          ← Back
        </button>

        <div style={{ position: 'relative', flex: 1 }}>
          <button
            onClick={() => setShowDocList(!showDocList)}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              fontWeight: '500',
              width: '100%',
              maxWidth: '400px'
            }}
          >
            <FiFileText style={{ fontSize: '18px' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              {selectedDoc?.filename || 'Select Document'}
            </span>
            <FiChevronDown style={{
              fontSize: '16px',
              transform: showDocList ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }} />
          </button>

          {/* Document Dropdown */}
          {showDocList && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '8px',
              maxWidth: '400px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 1000
            }}>
              {documents.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => {
                    onDocChange?.(doc)
                    setShowDocList(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: selectedDoc?.id === doc.id ? 'var(--bg-secondary)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <FiFileText />
                  {doc.filename}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File Info and Actions */}
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center'
        }}>
          {metadata && (
            <div style={{
              display: 'flex',
              gap: '16px',
              fontSize: '13px',
              color: 'var(--text-secondary)'
            }}>
              <span>{metadata.file_type.toUpperCase()}</span>
              {metadata.metadata?.word_count && (
                <span>{metadata.metadata.word_count} words</span>
              )}
            </div>
          )}
          <button
            onClick={handleDownload}
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px'
            }}
          >
            <FiDownload /> Download
          </button>
        </div>
      </div>

      {/* Document Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        backgroundColor: 'var(--bg-primary)'
      }}>
        {isLoading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: 'var(--text-secondary)'
          }}>
            Loading document...
          </div>
        ) : error ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: 'var(--error)'
          }}>
            {error}
          </div>
        ) : htmlContent ? (
          <div
            className="word-document-content"
            style={{
              padding: '40px',
              maxWidth: '900px',
              margin: '0 auto',
              lineHeight: '1.6',
              fontSize: '15px'
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            gap: '16px',
            color: 'var(--text-secondary)'
          }}>
            <FiFileText style={{ fontSize: '48px' }} />
            <p>Preview not available for .doc files</p>
            <button
              onClick={handleDownload}
              style={{
                padding: '12px 20px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px'
              }}
            >
              <FiDownload /> Download to View
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default WordDocumentViewer
