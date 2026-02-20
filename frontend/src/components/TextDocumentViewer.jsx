import { useState, useEffect } from 'react'
import { FiFileText, FiChevronDown } from 'react-icons/fi'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { API_URL } from '../config'

function TextDocumentViewer({ documents, notebookId, selectedDoc, onDocChange, metadata }) {
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showDocList, setShowDocList] = useState(false)

  useEffect(() => {
    if (selectedDoc && notebookId) {
      fetchDocumentContent()
    }
  }, [selectedDoc, notebookId])

  const fetchDocumentContent = async () => {
    setIsLoading(true)
    try {
      const response = await axios.get(
        `${API_URL}/documents/${notebookId}/${selectedDoc.id}/content`,
        { responseType: 'text' }
      )
      setContent(response.data)
    } catch (error) {
      console.error('Error fetching document content:', error)
      setContent('Error loading document content. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const renderContent = () => {
    const fileType = metadata?.file_type || 'txt'

    if (fileType === 'md') {
      // Render markdown with formatting
      return (
        <div className="markdown-content" style={{
          padding: '40px',
          maxWidth: '900px',
          margin: '0 auto',
          lineHeight: '1.6',
          fontSize: '15px'
        }}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )
    } else {
      // Render plain text
      return (
        <pre style={{
          padding: '40px',
          maxWidth: '900px',
          margin: '0 auto',
          lineHeight: '1.6',
          fontSize: '14px',
          fontFamily: fileType === 'txt' ? 'monospace' : 'inherit',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word'
        }}>
          {content}
        </pre>
      )
    }
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

        {/* File Info */}
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
            Loading...
          </div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  )
}

export default TextDocumentViewer
