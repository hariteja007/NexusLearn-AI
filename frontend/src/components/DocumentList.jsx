import { FiFile, FiFileText, FiYoutube } from 'react-icons/fi'

/**
 * DocumentList - Universal document selector
 * Shows all document types with appropriate icons
 */
function DocumentList({ documents, onSelectDocument }) {
  const getDocumentIcon = (doc) => {
    const fileType = doc.file_type || 'pdf'

    switch (fileType) {
      case 'youtube':
        return <FiYoutube style={{ color: '#ff0000', fontSize: '24px' }} />
      case 'txt':
      case 'md':
      case 'rtf':
      case 'doc':
      case 'docx':
        return <FiFileText style={{ fontSize: '24px' }} />
      case 'pdf':
      default:
        return <FiFile style={{ fontSize: '24px' }} />
    }
  }

  const getFileTypeBadge = (doc) => {
    const fileType = (doc.file_type || 'pdf').toUpperCase()
    const colors = {
      'YOUTUBE': '#ff0000',
      'PDF': '#e74c3c',
      'TXT': '#3498db',
      'MD': '#9b59b6',
      'RTF': '#e67e22',
      'DOCX': '#2c3e50',
      'DOC': '#34495e'
    }

    return (
      <span style={{
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: colors[fileType] || '#95a5a6',
        color: 'white',
        fontSize: '10px',
        fontWeight: '600',
        letterSpacing: '0.5px'
      }}>
        {fileType}
      </span>
    )
  }

  if (!documents || documents.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        gap: '16px',
        color: 'var(--text-secondary)',
        padding: '40px'
      }}>
        <FiFile style={{ fontSize: '48px', opacity: 0.5 }} />
        <p>No documents in this notebook</p>
        <p style={{ fontSize: '14px' }}>Upload files or add YouTube videos to get started</p>
      </div>
    )
  }

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      padding: '24px'
    }}>
      <h2 style={{
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '20px',
      }}>
        Documents ({documents.length})
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onSelectDocument(doc)}
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              color: 'var(--text-primary)',
              fontWeight: '600',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {getDocumentIcon(doc)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {doc.filename}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'No date'}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              {getFileTypeBadge(doc)}
              {doc.chunks_count !== undefined && (
                <span style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)'
                }}>
                  {doc.chunks_count} chunks
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default DocumentList
