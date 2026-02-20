import { useState, useEffect } from 'react'
import axios from 'axios'
import PDFAnnotator from './PDFAnnotator'
import TextDocumentViewer from './TextDocumentViewer'
import WordDocumentViewer from './WordDocumentViewer'
import YouTubeViewer from './YouTubeViewer'
import DocumentList from './DocumentList'
import { API_URL } from '../config'

/**
 * DocumentViewer - Smart router component
 *
 * Routes to the appropriate viewer based on file type:
 * - PDF files → PDFAnnotator
 * - Text files (txt, md, rtf) → TextDocumentViewer
 * - Word files (doc, docx) → WordDocumentViewer
 * - YouTube videos → YouTubeViewer
 */
function DocumentViewer({ documents, notebookId }) {
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [documentMetadata, setDocumentMetadata] = useState(null)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)

  // When a document is selected, fetch its metadata to determine file type
  useEffect(() => {
    if (selectedDoc && notebookId) {
      fetchDocumentMetadata()
    }
  }, [selectedDoc, notebookId])

  const fetchDocumentMetadata = async () => {
    setIsLoadingMetadata(true)
    try {
      const response = await axios.get(
        `${API_URL}/documents/${notebookId}/${selectedDoc.id}/metadata`
      )
      setDocumentMetadata(response.data)
    } catch (error) {
      console.error('Error fetching document metadata:', error)
      setDocumentMetadata({ file_type: 'pdf' }) // Default to PDF if error
    } finally {
      setIsLoadingMetadata(false)
    }
  }

  // Render the appropriate viewer based on file type
  const renderViewer = () => {
    if (!documentMetadata || isLoadingMetadata) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          color: 'var(--text-secondary)'
        }}>
          Loading document...
        </div>
      )
    }

    const fileType = documentMetadata.file_type || 'pdf'

    switch (fileType) {
      case 'pdf':
        return (
          <PDFAnnotator
            documents={documents}
            notebookId={notebookId}
            selectedDoc={selectedDoc}
            setSelectedDoc={setSelectedDoc}
            onDocChange={setSelectedDoc}
          />
        )

      case 'txt':
      case 'md':
      case 'rtf':
        return (
          <TextDocumentViewer
            documents={documents}
            notebookId={notebookId}
            selectedDoc={selectedDoc}
            onDocChange={setSelectedDoc}
            metadata={documentMetadata}
          />
        )

      case 'doc':
      case 'docx':
        return (
          <WordDocumentViewer
            documents={documents}
            notebookId={notebookId}
            selectedDoc={selectedDoc}
            onDocChange={setSelectedDoc}
            metadata={documentMetadata}
          />
        )

      case 'youtube':
        return (
          <YouTubeViewer
            documents={documents}
            notebookId={notebookId}
            selectedDoc={selectedDoc}
            onDocChange={setSelectedDoc}
            metadata={documentMetadata}
          />
        )

      default:
        return (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: 'var(--text-secondary)'
          }}>
            Unsupported file type: {fileType}
          </div>
        )
    }
  }

  // If no document selected, show document list
  if (!selectedDoc) {
    return (
      <DocumentList
        documents={documents}
        onSelectDocument={setSelectedDoc}
      />
    )
  }

  return renderViewer()
}

export default DocumentViewer
