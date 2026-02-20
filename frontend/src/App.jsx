/**
 * NexusLearn - Main Application Component
 *
 * This is the root component that manages the entire application state and routing.
 * It handles multiple modes of operation:
 * - Chat: AI-powered Q&A about uploaded documents
 * - Assessment: Quiz and mock test generation
 * - Notes: Rich text note-taking
 * - PDF: PDF viewing and annotation
 * - Interview: Virtual interview practice
 * - Doomscroll: Swipeable learning cards
 * - Progress: Track learning progress and performance metrics
 *
 * State Management:
 * - Uses NotebookContext for global notebook state
 * - Local state for documents, messages, and UI modes
 *
 * 
 */

import { useState, useRef, useEffect } from 'react'
import { FiUpload, FiSend, FiTrash2, FiFile, FiMessageSquare, FiAward, FiFileText, FiArrowLeft, FiEdit3, FiEye, FiMic, FiTrendingUp, FiAlertTriangle, FiCheck, FiLogOut, FiBarChart2, FiCheckCircle, FiMenu, FiX } from 'react-icons/fi'
import axios from 'axios'
import FileUploadModal from './components/FileUploadModal'
import Quiz from './components/Quiz'
import MockTest from './components/MockTest'
import Notes from './components/Notes'
import DocumentViewer from './components/DocumentViewer'
import VirtualInterview from './components/VirtualInterview'
import Doomscroll from './components/Doomscroll'
import Progress from './components/Progress'
import Library from './components/Library'
import Auth from './components/Auth'
import Navbar from './components/Navbar'
import { NotebookProvider, useNotebook } from './contexts/NotebookContext'
import { useAuth } from './contexts/AuthContext'
import { API_URL } from './config'
import './index.css'
import './library-styles.css'
import ReactMarkdown from 'react-markdown'

/**
 * AppContent Component
 * Main application logic wrapped by NotebookProvider
 */
function AppContent() {
  const { user, loading, isAuthenticated, login, logout } = useAuth()
  const { selectedNotebook, selectNotebook, clearNotebook } = useNotebook()
  const [mode, setMode] = useState('chat') // 'chat', 'assessment', 'notes', 'pdf', 'interview', 'doomscroll', 'progress'
  const [assessmentType, setAssessmentType] = useState(null) // 'quiz' or 'mocktest'
  const [documents, setDocuments] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState([])
  const [documentProgress, setDocumentProgress] = useState({})
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    show: false,
    type: null, // 'single' or 'clearAll'
    docId: null,
    docName: '',
    isDeleting: false
  })
  const [errorModal, setErrorModal] = useState({
    show: false,
    message: ''
  })
  const [validationModal, setValidationModal] = useState({
    show: false,
    docName: '',
    isValidating: false,
    results: null
  })
  const chatEndRef = useRef(null)
  const textareaRef = useRef(null)

  // Clear all state when user logs out or changes
  useEffect(() => {
    if (!isAuthenticated) {
      setMessages([])
      setDocuments([])
      setSelectedDocIds([])
      setInputValue('')
      setMode('chat')
      setAssessmentType(null)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (selectedNotebook) {
      fetchDocuments()
      loadChatHistory()
    } else {
      setMessages([])
    }
  }, [selectedNotebook])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [inputValue])

  useEffect(() => {
    fetchReadingProgress()
  }, [documents, selectedNotebook])

  const fetchDocuments = async () => {
    if (!selectedNotebook) return

    try {
      const response = await axios.get(`${API_URL}/documents/${selectedNotebook.id}`)
      setDocuments(response.data.documents)
    } catch (error) {
      console.error('Error fetching documents:', error)
    }
  }

  const fetchReadingProgress = async () => {
    if (!selectedNotebook || documents.length === 0) return

    try {
      const token = localStorage.getItem('token')
      const progressMap = {}

      for (const doc of documents) {
        try {
          const response = await axios.get(
            `${API_URL}/reading-progress/${selectedNotebook.id}/${doc.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (response.data.has_progress) {
            progressMap[doc.id] = response.data
          }
        } catch (error) {
          // Document has no progress yet, skip
          console.log(`No progress for document ${doc.id}`)
        }
      }

      setDocumentProgress(progressMap)
    } catch (error) {
      console.error('Error fetching reading progress:', error)
    }
  }

  const loadChatHistory = async () => {
    if (!selectedNotebook) return

    try {
      const response = await axios.get(`${API_URL}/chat-history/${selectedNotebook.id}`)
      const history = response.data.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.sources && { sources: msg.sources })
      }))
      setMessages(history)
    } catch (error) {
      console.error('Error loading chat history:', error)
      setMessages([]) // Set empty array on error
    }
  }

  const saveChatMessage = async (message) => {
    if (!selectedNotebook) return

    try {
      await axios.post(`${API_URL}/chat-history`, {
        notebook_id: selectedNotebook.id,
        messages: [message]
      })
    } catch (error) {
      console.error('Error saving chat message:', error)
    }
  }

  const handleUploadSuccess = () => {
    fetchDocuments()
    setShowUploadModal(false)
  }

  const handleDeleteDocument = (docId, docName) => {
    setDeleteConfirmation({
      show: true,
      type: 'single',
      docId: docId,
      docName: docName,
      isDeleting: false
    })
  }

  const confirmDeleteDocument = async () => {
    if (deleteConfirmation.isDeleting) return

    // Set deleting state to true
    setDeleteConfirmation(prev => ({ ...prev, isDeleting: true }))

    try {
      if (deleteConfirmation.type === 'single') {
        await axios.delete(`${API_URL}/documents/${deleteConfirmation.docId}`)
        setDocuments(documents.filter(doc => doc.id !== deleteConfirmation.docId))
        setSelectedDocIds(selectedDocIds.filter(id => id !== deleteConfirmation.docId))
        setDeleteConfirmation({ show: false, type: null, docId: null, docName: '', isDeleting: false })
      } else if (deleteConfirmation.type === 'clearAll') {
        // Delete all documents one by one
        const deletePromises = documents.map(doc =>
          axios.delete(`${API_URL}/documents/${doc.id}`)
        )
        await Promise.all(deletePromises)

        // Clear chat history
        await axios.delete(`${API_URL}/chat-history/${selectedNotebook.id}`)

        setDocuments([])
        setSelectedDocIds([])
        setMessages([])
        setDeleteConfirmation({ show: false, type: null, docId: null, docName: '', isDeleting: false })
      }
    } catch (error) {
      console.error('Error deleting:', error)
      setDeleteConfirmation({ show: false, type: null, docId: null, docName: '', isDeleting: false })

      // If clearing all, refresh documents to see what was actually deleted
      if (deleteConfirmation.type === 'clearAll') {
        await fetchDocuments()
      }

      // Show error modal
      const errorMessage = deleteConfirmation.type === 'clearAll'
        ? 'Failed to delete all documents. Some documents may have been deleted. Please check the list below.'
        : `Failed to delete document. ${error.response?.data?.detail || 'Please try again.'}`

      setErrorModal({
        show: true,
        message: errorMessage
      })
    }
  }

  const cancelDeleteDocument = () => {
    if (deleteConfirmation.isDeleting) return // Prevent canceling during deletion
    setDeleteConfirmation({ show: false, type: null, docId: null, docName: '', isDeleting: false })
  }

  const handleClearAll = () => {
    if (!selectedNotebook) return

    setDeleteConfirmation({
      show: true,
      type: 'clearAll',
      docId: null,
      docName: '',
      isDeleting: false
    })
  }

  const toggleDocumentSelection = (docId) => {
    setSelectedDocIds(prev => {
      if (prev.includes(docId)) {
        return prev.filter(id => id !== docId)
      } else {
        return [...prev, docId]
      }
    })
  }

  const handleValidateDocument = async (docId, docName) => {
    setValidationModal({
      show: true,
      docName: docName,
      isValidating: true,
      results: null
    })

    try {
      const response = await axios.post(`${API_URL}/validate-document/${docId}`)
      setValidationModal({
        show: true,
        docName: docName,
        isValidating: false,
        results: response.data
      })
    } catch (error) {
      console.error('Error validating document:', error)
      setValidationModal({
        show: false,
        docName: '',
        isValidating: false,
        results: null
      })
      setErrorModal({
        show: true,
        message: `Failed to validate document. ${error.response?.data?.detail || 'Please try again.'}`
      })
    }
  }

  const closeValidationModal = () => {
    setValidationModal({
      show: false,
      docName: '',
      isValidating: false,
      results: null
    })
  }

  const handleAskQuestion = async (e) => {
    e.preventDefault()

    if (!inputValue.trim() || isLoading) return

    if (documents.length === 0) {
      alert('Please upload at least one PDF document first')
      return
    }

    const userMessage = {
      role: 'user',
      content: inputValue
    }

    setMessages(prev => [...prev, userMessage])
    saveChatMessage(userMessage)
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await axios.post(`${API_URL}/ask`, {
        question: inputValue,
        notebook_id: selectedNotebook.id,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null
      })

      const assistantMessage = {
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources
      }

      setMessages(prev => [...prev, assistantMessage])
      saveChatMessage({
        role: 'assistant',
        content: response.data.answer
      })
    } catch (error) {
      console.error('Error asking question:', error)
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.'
      }
      setMessages(prev => [...prev, errorMessage])
      saveChatMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAskQuestion(e)
    }
  }

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen)
  }

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false)
  }

  // Close mobile sidebar when mode changes
  const handleModeChange = (newMode) => {
    setMode(newMode)
    setAssessmentType(null)
    closeMobileSidebar()
  }

  // Show Library if no notebook is selected
  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-logo">NexusLearn</h1>
            <p className="auth-tagline">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <Auth onAuth={login} />
  }

  if (!selectedNotebook) {
    return <Library onSelectNotebook={selectNotebook} />
  }

  return (
    <div className="app">
      {/* Mobile Menu Toggle */}
      <button
        className={`mobile-menu-toggle ${isMobileSidebarOpen ? 'open' : ''}`}
        onClick={toggleMobileSidebar}
        aria-label="Toggle menu"
      >
        {isMobileSidebarOpen ? <FiX size={24} /> : <FiMenu size={24} />}
      </button>

      {/* Mobile Overlay */}
      <div
        className={`mobile-overlay ${isMobileSidebarOpen ? 'active' : ''}`}
        onClick={closeMobileSidebar}
      />

      <div className="app-body">
        <div className={`sidebar ${isMobileSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <button
              onClick={clearNotebook}
              className="sidebar-back-button"
            >
              <FiArrowLeft size={16} />
              Back to Library
            </button>
            <h1>{selectedNotebook.icon} {selectedNotebook.name}</h1>
            <p>Ask questions about your documents</p>
          </div>

          <div className="mode-switcher">
            <button
              className={`mode-button ${mode === 'chat' ? 'active' : ''}`}
              onClick={() => handleModeChange('chat')}
            >
              <FiMessageSquare />
              Chat
            </button>
            <button
              className={`mode-button ${mode === 'notes' ? 'active' : ''}`}
              onClick={() => handleModeChange('notes')}
            >
              <FiEdit3 />
              Notes
            </button>
            <button
              className={`mode-button ${mode === 'pdf' ? 'active' : ''}`}
              onClick={() => handleModeChange('pdf')}
            >
              <FiEye />
              View
            </button>
            <button
              className={`mode-button ${mode === 'assessment' ? 'active' : ''}`}
              onClick={() => handleModeChange('assessment')}
            >
              <FiAward />
              Assessment
            </button>
            <button
              className={`mode-button ${mode === 'interview' ? 'active' : ''}`}
              onClick={() => handleModeChange('interview')}
            >
              <FiMic />
              Interview
            </button>
            <button
              className={`mode-button ${mode === 'doomscroll' ? 'active' : ''}`}
              onClick={() => handleModeChange('doomscroll')}
            >
              <FiTrendingUp />
              Scroll
            </button>
            <button
              className={`mode-button ${mode === 'progress' ? 'active' : ''}`}
              onClick={() => handleModeChange('progress')}
            >
              <FiBarChart2 />
              Progress
            </button>
          </div>

          <div className="upload-section">
            <button className="upload-button" onClick={() => setShowUploadModal(true)}>
              <FiUpload />
              Upload Sources
            </button>
          </div>

          <div className="documents-list">
            <h3>Sources ({documents.length})</h3>
            {documents.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                No documents uploaded yet
              </p>
            ) : (
              documents.map(doc => {
                const progress = documentProgress[doc.id]
                const hasProgress = progress && progress.completion_percentage > 0

                return (
                  <div
                    key={doc.id}
                    className={`document-item ${selectedDocIds.includes(doc.id) ? 'selected' : ''}`}
                    onClick={() => toggleDocumentSelection(doc.id)}
                  >
                    <div className="document-name">
                      {selectedDocIds.includes(doc.id) ? (
                        <FiCheck style={{ display: 'inline', marginRight: '6px', color: 'var(--accent-primary)' }} />
                      ) : (
                        <FiFile style={{ display: 'inline', marginRight: '6px', color: 'var(--text-secondary)' }} />
                      )}
                      {doc.filename}
                    </div>

                    {hasProgress && (
                      <div className="document-progress-info">
                        <div className="document-progress-bar">
                          <div
                            className="document-progress-fill"
                            style={{ width: `${progress.completion_percentage}%` }}
                          />
                        </div>
                        <div className="document-progress-text">
                          Page {progress.current_page}/{progress.total_pages} ({progress.completion_percentage.toFixed(0)}%)
                        </div>
                      </div>
                    )}

                    <div className="document-info">
                      <span>{doc.chunks_count} chunks</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="validate-button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleValidateDocument(doc.id, doc.filename)
                          }}
                          title="Validate document"
                          style={{
                            padding: '6px',
                            backgroundColor: 'var(--accent-primary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            color: 'white'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-dark)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary)'}
                        >
                          <FiCheckCircle size={14} />
                        </button>
                        <button
                          className="delete-button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteDocument(doc.id, doc.filename)
                          }}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {documents.length > 0 && (
            <button className="clear-all-button" onClick={handleClearAll}>
              Clear All Documents
            </button>
          )}
        </div>

        <div className="main-content">
          {mode === 'chat' ? (
            <>
              <div className="chat-container">

                {messages.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <FiMessageSquare />
                    </div>
                    <h2>Ask anything about your documents</h2>
                    <p>
                      Upload PDF documents and ask questions. The AI will search through your documents
                      and provide accurate answers based on the content.
                    </p>
                  </div>
                ) : (
                  <div className="messages">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`message ${message.role}`}
                      >
                        <div className="message-avatar">
                          {message.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className="message-content">
                          <div className="message-markdown">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                          {message.sources && message.sources.length > 0 && (
                            <div className="sources">
                              <div className="sources-title">Sources:</div>
                              {message.sources.map((source, idx) => (
                                <div key={idx} className="source-item">
                                  {source.filename} (chunk {source.chunk_index + 1}) - Score: {(source.score * 100).toFixed(1)}%
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div
                        className="message assistant"
                      >
                        <div className="message-avatar">🤖</div>
                        <div className="message-content">
                          <div className="loading">
                            <span>Thinking</span>
                            <div className="loading-dots">
                              <div className="loading-dot"></div>
                              <div className="loading-dot"></div>
                              <div className="loading-dot"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              <div className="input-area">
                <div className="input-container">
                  <form onSubmit={handleAskQuestion}>
                    <div className="input-wrapper">
                      <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          documents.length === 0
                            ? "Upload PDFs to start asking questions..."
                            : "Ask a question about your documents..."
                        }
                        disabled={isLoading || documents.length === 0}
                        rows={1}
                      />
                      <button
                        type="submit"
                        className="send-button"
                        disabled={!inputValue.trim() || isLoading || documents.length === 0}
                      >
                        <FiSend />
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </>
          ) : mode === 'notes' ? (
            <Notes documents={documents} selectedDocIds={selectedDocIds} notebookId={selectedNotebook.id} />
          ) : mode === 'pdf' ? (
            <DocumentViewer documents={documents} notebookId={selectedNotebook.id} />
          ) : mode === 'assessment' ? (
            assessmentType === 'quiz' ? (
              <Quiz documents={documents} selectedDocIds={selectedDocIds} notebookId={selectedNotebook.id} />
            ) : assessmentType === 'mocktest' ? (
              <MockTest documents={documents} selectedDocIds={selectedDocIds} notebookId={selectedNotebook.id} />
            ) : (
              <div className="assessment-selector-container">
                <div className="assessment-selector">
                  <h2>Choose Assessment Type</h2>
                  <p>Select the type of assessment you'd like to take</p>

                  <div className="assessment-options">
                    <div
                      className="assessment-option-card"
                      onClick={() => setAssessmentType('quiz')}
                    >
                      <div className="assessment-icon">
                        <FiAward size={48} />
                      </div>
                      <h3>Quick Quiz</h3>
                      <p>Multiple choice questions to test your knowledge quickly</p>
                      <ul>
                        <li>Multiple choice format</li>
                        <li>Instant feedback</li>
                        <li>5-20 questions</li>
                        <li>Topic-based scoring</li>
                      </ul>
                    </div>

                    <div
                      className="assessment-option-card"
                      onClick={() => setAssessmentType('mocktest')}
                    >
                      <div className="assessment-icon">
                        <FiFileText size={48} />
                      </div>
                      <h3>Mock Test</h3>
                      <p>Comprehensive test with multiple question types</p>
                      <ul>
                        <li>Theory questions</li>
                        <li>Coding problems</li>
                        <li>Reordering tasks</li>
                        <li>Detailed evaluation</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : mode === 'interview' ? (
            <VirtualInterview documents={documents} selectedDocIds={selectedDocIds} notebookId={selectedNotebook.id} />
          ) : mode === 'doomscroll' ? (
            <Doomscroll documents={documents} notebookId={selectedNotebook.id} />
          ) : mode === 'progress' ? (
            <Progress notebookId={selectedNotebook.id} />
          ) : null}
        </div>
      </div>

      {showUploadModal && (
        <FileUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
          notebookId={selectedNotebook.id}
        />
      )}

      {deleteConfirmation.show && (
        <div className="modal-overlay notification-overlay" onClick={cancelDeleteDocument}>
          <div
            className="notification-modal confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notification-icon">
              <FiAlertTriangle size={32} />
            </div>

            <div className="notification-content">
              <h3 className="notification-title">
                {deleteConfirmation.type === 'clearAll' ? 'Clear All Documents' : 'Delete Document'}
              </h3>
              <p className="notification-message">
                {deleteConfirmation.type === 'clearAll' ? (
                  <>
                    Are you sure you want to delete <strong>all {documents.length} document{documents.length !== 1 ? 's' : ''}</strong> in this notebook?
                    This will remove all documents and their associated data, including chat history. This action cannot be undone.
                  </>
                ) : (
                  <>
                    Are you sure you want to delete <strong>{deleteConfirmation.docName}</strong>?
                    This will remove the document and all its associated data. This action cannot be undone.
                  </>
                )}
              </p>
            </div>

            <div className="notification-actions">
              <button
                className="btn-secondary"
                onClick={cancelDeleteDocument}
                disabled={deleteConfirmation.isDeleting}
                style={{
                  opacity: deleteConfirmation.isDeleting ? 0.5 : 1,
                  cursor: deleteConfirmation.isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={confirmDeleteDocument}
                disabled={deleteConfirmation.isDeleting}
                style={{
                  position: 'relative',
                  minWidth: '90px'
                }}
              >
                {deleteConfirmation.isDeleting ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}>
                    <div className="loading-dots" style={{ margin: 0 }}>
                      <div className="loading-dot" style={{
                        width: '6px',
                        height: '6px',
                        backgroundColor: 'white'
                      }}></div>
                      <div className="loading-dot" style={{
                        width: '6px',
                        height: '6px',
                        backgroundColor: 'white'
                      }}></div>
                      <div className="loading-dot" style={{
                        width: '6px',
                        height: '6px',
                        backgroundColor: 'white'
                      }}></div>
                    </div>
                  </div>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal.show && (
        <div className="modal-overlay notification-overlay" onClick={() => setErrorModal({ show: false, message: '' })}>
          <div
            className="notification-modal error"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notification-icon">
              <FiAlertTriangle size={32} />
            </div>

            <div className="notification-content">
              <h3 className="notification-title">Error</h3>
              <p className="notification-message">
                {errorModal.message}
              </p>
            </div>

            <div className="notification-actions">
              <button
                className="btn-primary"
                onClick={() => setErrorModal({ show: false, message: '' })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Modal */}
      {validationModal.show && (
        <div className="modal-overlay notification-overlay" onClick={closeValidationModal}>
          <div
            className="notification-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
          >
            <div className="notification-icon" style={{
              backgroundColor: validationModal.isValidating ? 'var(--accent-primary)' :
                validationModal.results?.issues?.length > 0 ? '#f59e0b' : '#10b981'
            }}>
              {validationModal.isValidating ? (
                <div className="loading-dots" style={{ margin: 0 }}>
                  <div className="loading-dot" style={{ width: '8px', height: '8px', backgroundColor: 'white' }}></div>
                  <div className="loading-dot" style={{ width: '8px', height: '8px', backgroundColor: 'white' }}></div>
                  <div className="loading-dot" style={{ width: '8px', height: '8px', backgroundColor: 'white' }}></div>
                </div>
              ) : validationModal.results?.issues?.length > 0 ? (
                <FiAlertTriangle size={32} />
              ) : (
                <FiCheckCircle size={32} />
              )}
            </div>

            <div className="notification-content">
              <h3 className="notification-title">
                {validationModal.isValidating ? 'Validating Document...' :
                  validationModal.results?.issues?.length > 0 ? 'Validation Issues Found' : 'Validation Successful'}
              </h3>
              <p className="notification-message" style={{ fontWeight: 600, marginBottom: '12px' }}>
                {validationModal.docName}
              </p>

              {!validationModal.isValidating && validationModal.results && (
                <>
                  {validationModal.results.issues?.length === 0 ? (
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: '8px',
                      marginTop: '12px'
                    }}>
                      <p style={{ color: '#10b981', margin: 0 }}>
                        ✓ No issues detected. The document appears to be valid and well-formatted.
                      </p>
                    </div>
                  ) : (
                    <div style={{ marginTop: '16px' }}>
                      <p style={{
                        color: 'var(--text-secondary)',
                        fontSize: '14px',
                        marginBottom: '12px'
                      }}>
                        Found {validationModal.results.issues.length} potential issue{validationModal.results.issues.length !== 1 ? 's' : ''}:
                      </p>
                      <div style={{
                        maxHeight: '300px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        {validationModal.results.issues.map((issue, index) => (
                          <div
                            key={index}
                            style={{
                              padding: '12px',
                              backgroundColor: 'var(--bg-secondary)',
                              borderLeft: `3px solid ${issue.severity === 'high' ? '#ef4444' :
                                issue.severity === 'medium' ? '#f59e0b' : '#3b82f6'
                                }`,
                              borderRadius: '4px'
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '6px'
                            }}>
                              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                                {issue.type}
                              </span>
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                backgroundColor:
                                  issue.severity === 'high' ? '#ef4444' :
                                    issue.severity === 'medium' ? '#f59e0b' : '#3b82f6',
                                color: 'white',
                                textTransform: 'uppercase',
                                fontWeight: 600
                              }}>
                                {issue.severity}
                              </span>
                            </div>
                            <p style={{
                              fontSize: '13px',
                              color: 'var(--text-secondary)',
                              margin: 0
                            }}>
                              {issue.description}
                            </p>
                            {issue.location && (
                              <p style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                marginTop: '6px',
                                fontStyle: 'italic',
                                opacity: 0.7
                              }}>
                                Location: {issue.location}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {!validationModal.isValidating && (
              <div className="notification-actions">
                <button
                  className="btn-primary"
                  onClick={closeValidationModal}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Wrapper component with NotebookProvider
function App() {
  return (
    <NotebookProvider>
      <AppContent />
    </NotebookProvider>
  )
}

export default App
