import { useState, useEffect, useRef } from 'react'
import { FiFileText, FiMessageSquare, FiX, FiLoader, FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut, FiPlus, FiZap, FiBookmark, FiBook, FiClock, FiCheck, FiSidebar } from 'react-icons/fi'
import axios from 'axios'
import { Document, Page, pdfjs } from 'react-pdf'
import ReactMarkdown from 'react-markdown'
import NotificationModal from './NotificationModal'
import LoadingSpinner from './LoadingSpinner'
import { useNotification } from '../hooks/useNotification'
import StudyQuestions from './StudyQuestions'
import { API_URL } from '../config'

// Configure PDF.js worker - use local copy
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// Preset annotation colors
const ANNOTATION_COLORS = [
  { name: 'Yellow', value: '#ffeb3b' },
  { name: 'Green', value: '#4caf50' },
  { name: 'Blue', value: '#2196f3' },
  { name: 'Pink', value: '#e91e63' },
  { name: 'Purple', value: '#9c27b0' },
  { name: 'Orange', value: '#ff9800' },
  { name: 'Red', value: '#f44336' },
  { name: 'Cyan', value: '#00bcd4' }
]

function PDFAnnotator({ documents, notebookId, selectedDoc, setSelectedDoc }) {
  const [annotations, setAnnotations] = useState([])
  const [showQueryDialog, setShowQueryDialog] = useState(false)
  const [currentAnnotation, setCurrentAnnotation] = useState(null)
  const [query, setQuery] = useState('')
  const [aiResponse, setAiResponse] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')

  // PDF viewing state
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [selectedText, setSelectedText] = useState(null)
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const [annotationNote, setAnnotationNote] = useState('')
  const [annotationColor, setAnnotationColor] = useState('#ffeb3b')
  const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 }) // Default Letter size

  // AI Analysis state
  const [showAnalyzer, setShowAnalyzer] = useState(false)
  const [answerHighlight, setAnswerHighlight] = useState(null)

  // Reading Progress state
  const [readingProgress, setReadingProgress] = useState(null)
  const [showResumePrompt, setShowResumePrompt] = useState(false)
  const [completedPages, setCompletedPages] = useState([])
  const [progressSaved, setProgressSaved] = useState(false)

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarkTitle, setBookmarkTitle] = useState('')
  const [bookmarkNote, setBookmarkNote] = useState('')
  const [showBookmarkForm, setShowBookmarkForm] = useState(false)

  // Sidebar visibility
  const [sidebarVisible, setSidebarVisible] = useState(false)

  const pageRef = useRef(null)
  const pageStartTimeRef = useRef(null)

  // Notification modal
  const {
    notification,
    closeNotification,
    showError,
    showSuccess,
    showConfirm
  } = useNotification()

  useEffect(() => {
    if (selectedDoc && notebookId) {
      // Generate PDF URL for viewing
      const url = `${API_URL}/documents/${notebookId}/${selectedDoc.id}/pdf`
      setPdfUrl(url)
      loadAnnotations()
      loadReadingProgress()
      loadBookmarks()
    }
  }, [selectedDoc, notebookId])

  // Auto-save progress when page changes
  useEffect(() => {
    if (selectedDoc && notebookId && numPages && pageNumber) {
      // Track page start time
      pageStartTimeRef.current = Date.now()

      // Save progress and mark page as completed after 3 seconds
      const timer = setTimeout(() => {
        const timeSpent = pageStartTimeRef.current
          ? Math.floor((Date.now() - pageStartTimeRef.current) / 1000)
          : 0
        // Mark page as completed if user has been on it for at least 3 seconds
        const markCompleted = timeSpent >= 3
        saveReadingProgress(markCompleted, timeSpent)
      }, 3000)

      return () => {
        clearTimeout(timer)
      }
    }
  }, [pageNumber, numPages, selectedDoc, notebookId])

  // Save progress when leaving page (mark as completed if spent >10 seconds)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const timeSpent = pageStartTimeRef.current
        ? Math.floor((Date.now() - pageStartTimeRef.current) / 1000)
        : 0
      const markCompleted = timeSpent > 10
      saveReadingProgress(markCompleted, timeSpent)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [pageNumber, selectedDoc])

  const loadAnnotations = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/annotations/${notebookId}?document_id=${selectedDoc.id}`
      )
      setAnnotations(response.data.annotations)
    } catch (error) {
      console.error('Error loading annotations:', error)
    }
  }

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    // Only set to page 1 if there's no existing progress
    if (!readingProgress || !readingProgress.current_page) {
      setPageNumber(1)
    }
  }

  const onPageLoadSuccess = (page) => {
    setPageDimensions({
      width: page.width,
      height: page.height
    })
  }

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => Math.min(Math.max(1, prevPageNumber + offset), numPages))
  }

  // Reading Progress Functions
  const loadReadingProgress = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(
        `${API_URL}/reading-progress/${notebookId}/${selectedDoc.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (response.data.has_progress) {
        setReadingProgress(response.data)
        setCompletedPages(response.data.completed_pages || [])
        // Show resume prompt if user has progress
        if (response.data.current_page > 1) {
          setShowResumePrompt(true)
        }
      }
    } catch (error) {
      console.error('Error loading reading progress:', error)
    }
  }

  const saveReadingProgress = async (markCompleted = false, timeSpent = 0) => {
    if (!selectedDoc || !notebookId || !numPages) return

    try {
      const token = localStorage.getItem('token')
      const response = await axios.post(
        `${API_URL}/reading-progress`,
        {
          document_id: selectedDoc.id,
          notebook_id: notebookId,
          current_page: pageNumber,
          total_pages: numPages,
          mark_completed: markCompleted,
          time_spent_seconds: timeSpent
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      console.log('Progress saved:', response.data)

      // Show brief saved indicator
      setProgressSaved(true)
      setTimeout(() => setProgressSaved(false), 2000)

      // Update completed pages if this page was marked as completed
      if (markCompleted && !completedPages.includes(pageNumber)) {
        setCompletedPages([...completedPages, pageNumber])
      }

      // Update progress state with new data
      if (readingProgress) {
        setReadingProgress({
          ...readingProgress,
          completion_percentage: response.data.completion_percentage || 0,
          current_page: pageNumber
        })
      }
    } catch (error) {
      console.error('Error saving reading progress:', error)
    }
  }

  const resumeReading = () => {
    if (readingProgress && readingProgress.current_page) {
      setPageNumber(readingProgress.current_page)
    }
    setShowResumePrompt(false)
  }

  const startFromBeginning = () => {
    setPageNumber(1)
    setShowResumePrompt(false)
  }

  // Bookmarks Functions
  const loadBookmarks = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(
        `${API_URL}/bookmarks/${notebookId}/${selectedDoc.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setBookmarks(response.data.bookmarks || [])
    } catch (error) {
      console.error('Error loading bookmarks:', error)
    }
  }

  const createBookmark = async () => {
    try {
      const token = localStorage.getItem('token')
      await axios.post(
        `${API_URL}/bookmarks`,
        {
          notebook_id: notebookId,
          document_id: selectedDoc.id,
          page_number: pageNumber,
          title: bookmarkTitle || `Page ${pageNumber}`,
          note: bookmarkNote || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      await loadBookmarks()
      setShowBookmarkForm(false)
      setBookmarkTitle('')
      setBookmarkNote('')
      showSuccess('Success', 'Bookmark created successfully!')
    } catch (error) {
      console.error('Error creating bookmark:', error)
      showError('Error', 'Failed to create bookmark')
    }
  }

  const deleteBookmark = async (bookmarkId) => {
    try {
      const token = localStorage.getItem('token')
      await axios.delete(
        `${API_URL}/bookmarks/${bookmarkId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      await loadBookmarks()
      showSuccess('Success', 'Bookmark deleted successfully!')
    } catch (error) {
      console.error('Error deleting bookmark:', error)
      showError('Error', 'Failed to delete bookmark')
    }
  }

  const goToBookmark = (pageNum) => {
    setPageNumber(pageNum)
    setShowBookmarks(false)
  }

  const handleTextSelection = (event) => {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection.toString().trim()

      console.log('Text selected:', text)

      if (text && text.length > 0) {
        try {
          const range = selection.getRangeAt(0)
          const rect = range.getBoundingClientRect()

          // Get the PDF page canvas element to calculate relative position
          const pageCanvas = document.querySelector('.react-pdf__Page__canvas')
          if (pageCanvas) {
            const canvasRect = pageCanvas.getBoundingClientRect()

            // Calculate position relative to the PDF page (not scaled)
            const relativePosition = {
              x: (rect.left - canvasRect.left) / scale,
              y: (rect.top - canvasRect.top) / scale,
              width: rect.width / scale,
              height: rect.height / scale
            }

            console.log('Selection position (relative to page):', relativePosition)
            console.log('Current scale:', scale)

            setSelectedText({
              text: text,
              position: relativePosition
            })
            setShowAnnotationForm(true)
          }
        } catch (error) {
          console.error('Error capturing selection:', error)
        }
      }
    }, 10)
  }

  const createAnnotation = async () => {
    if (!selectedText || !selectedDoc) return

    try {
      const response = await axios.post(`${API_URL}/annotations`, {
        notebook_id: notebookId,
        document_id: selectedDoc.id,
        page_number: pageNumber,
        highlighted_text: selectedText.text,
        position: selectedText.position,
        color: annotationColor,
        note: annotationNote || null
      })

      await loadAnnotations()
      cancelAnnotation()
      showSuccess('Success', 'Annotation created successfully!')
    } catch (error) {
      console.error('Error creating annotation:', error)
      showError('Error', 'Failed to create annotation. Please try again.')
    }
  }

  const cancelAnnotation = () => {
    setSelectedText(null)
    setShowAnnotationForm(false)
    setAnnotationNote('')
    setAnnotationColor('#ffeb3b')
    window.getSelection().removeAllRanges()
  }

  const deleteAnnotation = async (annotationId) => {
    showConfirm(
      'Delete Annotation',
      'Are you sure you want to delete this annotation?',
      async () => {
        try {
          await axios.delete(`${API_URL}/annotations/${annotationId}`)
          await loadAnnotations()
          closeNotification()
          showSuccess('Success', 'Annotation deleted successfully!')
        } catch (error) {
          console.error('Error deleting annotation:', error)
          closeNotification()
          showError('Error', 'Failed to delete annotation. Please try again.')
        }
      }
    )
  }

  const handleAnswerHighlight = ({ text, page }) => {
    // Navigate to the page with the answer
    if (page) {
      setPageNumber(page)
    }

    // Set temporary answer highlight
    setAnswerHighlight({
      text,
      page,
      timestamp: Date.now()
    })

    // Clear highlight after 5 seconds
    setTimeout(() => {
      setAnswerHighlight(null)
    }, 5000)
  }

  const queryAnnotation = async () => {
    if (!query.trim() || !currentAnnotation) return

    setIsLoading(true)
    try {
      const response = await axios.post(`${API_URL}/annotations/query`, {
        annotation_id: currentAnnotation.id,
        question: query
      })

      setAiResponse(response.data)
    } catch (error) {
      console.error('Error querying annotation:', error)
      showError('Error', 'Failed to query AI. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const openQueryDialog = (annotation) => {
    setCurrentAnnotation(annotation)
    setQuery('')
    setAiResponse(null)
    setShowQueryDialog(true)
  }

  const closeQueryDialog = () => {
    setShowQueryDialog(false)
    setCurrentAnnotation(null)
    setQuery('')
    setAiResponse(null)
  }

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0))
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5))

  // Filter annotations for current page
  const currentPageAnnotations = annotations.filter(ann => ann.page_number === pageNumber)

  if (!selectedDoc) {
    return (
      <div className="pdf-annotator-container">
        <div className="pdf-selector">
          <FiFileText size={64} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h2>Select a PDF to View</h2>
          <p>Choose from your uploaded documents</p>

          {documents.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', marginTop: '20px' }}>
              No documents uploaded yet
            </p>
          ) : (
            <div className="pdf-list">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="pdf-item"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <FiFileText size={20} />
                  <div>
                    <div className="pdf-name">{doc.filename}</div>
                    <div className="pdf-info">{doc.chunks_count} chunks</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-annotator-container">
      <div className="pdf-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-button" onClick={() => setSelectedDoc(null)} title="Close PDF">
            <FiX />
          </button>
          <button
            className={`toolbar-button ${sidebarVisible ? 'active' : ''}`}
            onClick={() => setSidebarVisible(!sidebarVisible)}
            title="Toggle Sidebar"
          >
            <FiSidebar />
          </button>
          <div className="pdf-title">
            <FiFileText />
            {selectedDoc.filename}
          </div>
        </div>

        <div className="toolbar-center">
          <button className="toolbar-button" onClick={() => changePage(-1)} disabled={pageNumber <= 1}>
            <FiChevronLeft />
          </button>
          <span className="page-info">
            {pageNumber} / {numPages || '?'}
          </span>
          <button className="toolbar-button" onClick={() => changePage(1)} disabled={pageNumber >= numPages}>
            <FiChevronRight />
          </button>
        </div>

        <div className="toolbar-right">
          {readingProgress && (
            <span className="progress-indicator" title="Reading Progress">
              <FiClock size={14} /> {Math.round(readingProgress.completion_percentage || 0)}%
            </span>
          )}
          <button className="toolbar-button" onClick={zoomOut} title="Zoom Out">
            <FiZoomOut />
          </button>
          <span className="zoom-level">
            {Math.round(scale * 100)}%
          </span>
          <button className="toolbar-button" onClick={zoomIn} title="Zoom In">
            <FiZoomIn />
          </button>
          <button className="toolbar-button" onClick={() => setShowBookmarkForm(true)} title="Add Bookmark">
            <FiBookmark />
          </button>
        </div>
      </div>

      {/* Resume Reading Prompt */}
      {showResumePrompt && (
        <div className="resume-prompt">
          <div className="resume-prompt-content">
            <FiBook size={24} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h3>Continue Reading?</h3>
              <p>You were on page {readingProgress?.current_page} ({Math.round(readingProgress?.completion_percentage || 0)}% complete)</p>
            </div>
            <div className="resume-prompt-buttons">
              <button className="resume-button primary" onClick={resumeReading}>
                Resume
              </button>
              <button className="resume-button" onClick={startFromBeginning}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmark Creation Form */}
      {showBookmarkForm && (
        <div className="modal-overlay" onClick={() => setShowBookmarkForm(false)}>
          <div className="bookmark-form" onClick={(e) => e.stopPropagation()}>
            <h3><FiBookmark /> Add Bookmark</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Page {pageNumber}
            </p>
            <input
              type="text"
              placeholder="Bookmark title (optional)"
              value={bookmarkTitle}
              onChange={(e) => setBookmarkTitle(e.target.value)}
              style={{ marginBottom: '12px', padding: '10px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }}
            />
            <textarea
              placeholder="Note (optional)"
              value={bookmarkNote}
              onChange={(e) => setBookmarkNote(e.target.value)}
              rows={3}
              style={{ marginBottom: '16px', padding: '10px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="cancel-button" onClick={() => setShowBookmarkForm(false)}>
                Cancel
              </button>
              <button className="submit-button" onClick={createBookmark}>
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pdf-content-wrapper">
        {/* Sidebar overlay - click to close */}
        {sidebarVisible && (
          <div
            className="pdf-sidebar-overlay"
            onClick={() => setSidebarVisible(false)}
          />
        )}

        <div className={`pdf-sidebar ${sidebarVisible ? 'visible' : ''}`}>
          {/* Sidebar Tabs */}
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${!showAnalyzer && !showBookmarks ? 'active' : ''}`}
              onClick={() => { setShowAnalyzer(false); setShowBookmarks(false); setSidebarVisible(true); }}
            >
              <FiFileText /> Annotations ({annotations.length})
            </button>
            <button
              className={`sidebar-tab ${showBookmarks ? 'active' : ''}`}
              onClick={() => { setShowAnalyzer(false); setShowBookmarks(true); setSidebarVisible(true); }}
            >
              <FiBookmark /> Bookmarks ({bookmarks.length})
            </button>
            <button
              className={`sidebar-tab ${showAnalyzer ? 'active' : ''}`}
              onClick={() => { setShowAnalyzer(true); setShowBookmarks(false); setSidebarVisible(true); }}
            >
              <FiZap /> AI Analyzer
            </button>
          </div>

          {/* Show Annotations, Bookmarks, or Analyzer */}
          {showBookmarks ? (
            <div className="bookmarks-list">
              {bookmarks.length === 0 ? (
                <p style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No bookmarks yet. Click the bookmark icon in the toolbar to save pages.
                </p>
              ) : (
                bookmarks.map((bookmark) => (
                  <div key={bookmark._id} className="bookmark-item">
                    <div className="bookmark-header">
                      <div className="bookmark-page-badge" onClick={() => goToBookmark(bookmark.page_number)}>
                        Page {bookmark.page_number}
                      </div>
                      <button
                        className="bookmark-delete"
                        onClick={() => deleteBookmark(bookmark._id)}
                        title="Delete bookmark"
                      >
                        <FiX size={14} />
                      </button>
                    </div>
                    <div
                      className="bookmark-title"
                      onClick={() => goToBookmark(bookmark.page_number)}
                      style={{ cursor: 'pointer' }}
                    >
                      {bookmark.title}
                    </div>
                    {bookmark.note && (
                      <div className="bookmark-note">{bookmark.note}</div>
                    )}
                    <div className="bookmark-date">
                      {new Date(bookmark.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : !showAnalyzer ? (
            <>
              <div className="annotation-help-banner">
                <FiPlus size={16} />
                <span>Select text in the PDF to create annotations</span>
              </div>
              <div className="annotations-list">
            {annotations.length === 0 ? (
              <p style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No annotations yet. Select text in the PDF to create annotations.
              </p>
            ) : (
              annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="annotation-item"
                  style={{ borderLeftColor: ann.color || 'var(--accent-primary)' }}
                >
                  <div
                    className="annotation-info"
                    onClick={() => {
                      if (ann.page_number !== pageNumber) {
                        setPageNumber(ann.page_number)
                      }
                    }}
                    style={{ cursor: 'pointer', flex: 1 }}
                  >
                    <div className="annotation-page-badge">
                      Page {ann.page_number}
                    </div>
                    <div className="annotation-text">
                      "{ann.highlighted_text.substring(0, 100)}..."
                    </div>
                    {ann.note && (
                      <div className="annotation-note">{ann.note}</div>
                    )}
                  </div>
                  <div className="annotation-actions">
                    <button onClick={(e) => { e.stopPropagation(); openQueryDialog(ann); }}>
                      <FiMessageSquare /> Ask AI
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteAnnotation(ann.id); }}>
                      <FiX /> Delete
                    </button>
                  </div>
                </div>
              ))
            )}
              </div>
            </>
          ) : (
            <StudyQuestions
              notebookId={notebookId}
              documentId={selectedDoc.id}
              onHighlightAnswer={handleAnswerHighlight}
            />
          )}
        </div>

        <div className="pdf-viewer-container">
          <div className="pdf-viewer" ref={pageRef}>
            {pdfUrl && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Document
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={(error) => {
                    console.error('PDF Load Error:', error)
                  }}
                  loading={
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <FiLoader className="spin" size={32} />
                      <p style={{ marginTop: '16px' }}>Loading PDF...</p>
                    </div>
                  }
                  error={
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)', maxWidth: '500px', margin: '0 auto' }}>
                      <FiX size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                      <h3 style={{ marginBottom: '12px' }}>Failed to Load PDF</h3>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                        This document may have been uploaded before PDF viewing was enabled.
                      </p>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                        Please try re-uploading this PDF file to enable viewing and annotations.
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '16px' }}>
                        Backend: {pdfUrl}
                      </p>
                    </div>
                  }
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                    onMouseUp={handleTextSelection}
                    onLoadSuccess={onPageLoadSuccess}
                  />
                </Document>

                {/* Render saved highlights for current page */}
                {currentPageAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="pdf-highlight-overlay"
                    style={{
                      position: 'absolute',
                      left: `${ann.position.x * scale}px`,
                      top: `${ann.position.y * scale}px`,
                      width: `${ann.position.width * scale}px`,
                      height: `${ann.position.height * scale}px`,
                      backgroundColor: ann.color,
                      opacity: 0.4,
                      pointerEvents: 'none',
                      mixBlendMode: 'multiply',
                      border: `2px solid ${ann.color}`,
                      boxSizing: 'border-box',
                      zIndex: 5
                    }}
                    title={ann.highlighted_text.substring(0, 100)}
                  />
                ))}

                {/* Render answer highlight when question is clicked */}
                {answerHighlight && answerHighlight.page === pageNumber && (
                  <div
                    className="answer-highlight-overlay"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: '#FFD700',
                      opacity: 0.2,
                      pointerEvents: 'none',
                      zIndex: 10,
                      animation: 'pulse-highlight 1s ease-in-out infinite'
                    }}
                    title={`Answer: ${answerHighlight.text.substring(0, 100)}`}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Annotation Form */}
      {showAnnotationForm && selectedText && (
        <div className="modal-overlay" onClick={cancelAnnotation}>
          <div className="modal annotation-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FiPlus /> Create Annotation
              </h2>
              <button onClick={cancelAnnotation} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <FiX size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Selected Text</label>
                <div className="selected-text-preview">
                  "{selectedText.text}"
                </div>
              </div>

              <div className="form-group">
                <label>Note (Optional)</label>
                <textarea
                  className="form-textarea"
                  value={annotationNote}
                  onChange={(e) => setAnnotationNote(e.target.value)}
                  placeholder="Add a note about this text..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Highlight Color</label>
                <div className="color-picker">
                  {ANNOTATION_COLORS.map((color) => (
                    <button
                      key={color.value}
                      className={`color-option ${annotationColor === color.value ? 'selected' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setAnnotationColor(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-button" onClick={cancelAnnotation}>
                Cancel
              </button>
              <button className="confirm-button" onClick={createAnnotation}>
                Create Annotation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Query Dialog */}
      {showQueryDialog && currentAnnotation && (
        <div className="modal-overlay" onClick={closeQueryDialog}>
          <div className="modal ask-ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Ask AI</h2>
              <button onClick={closeQueryDialog} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <FiX size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Highlighted Text</label>
                <div className="selected-text-preview">
                  "{currentAnnotation.highlighted_text}"
                </div>
              </div>

              <div className="form-group">
                <label>Your Question</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What would you like to know about this text?"
                  onKeyDown={(e) => e.key === 'Enter' && queryAnnotation()}
                />
              </div>

              {aiResponse && (
                <div className="ai-response-box">
                  <h4>AI Response</h4>
                  <div className="markdown-content">
                    <ReactMarkdown>{aiResponse.answer}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="cancel-button" onClick={closeQueryDialog}>
                Close
              </button>
              <button
                className="confirm-button"
                onClick={queryAnnotation}
                disabled={isLoading || !query.trim()}
              >
                {isLoading ? (
                  <div className="inline-loading">
                    <LoadingSpinner size="small" />
                    <span>Asking...</span>
                  </div>
                ) : 'Ask AI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <NotificationModal
        show={notification.show}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={closeNotification}
        onConfirm={notification.onConfirm}
        confirmText={notification.confirmText}
        cancelText={notification.cancelText}
        okText={notification.okText}
      />
    </div>
  )
}

export default PDFAnnotator
