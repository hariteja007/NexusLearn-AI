import { useState, useEffect } from 'react'
import { FiPlus, FiEdit2, FiTrash2, FiX, FiCheck, FiBookOpen, FiAlertCircle, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi'
import axios from 'axios'
import Navbar from './Navbar'
import { useAuth } from '../contexts/AuthContext'
import { API_URL } from '../config'
import '../library-styles.css'

const PRESET_COLORS = [
  { color: '#6366f1', name: 'Indigo' },
  { color: '#8b5cf6', name: 'Purple' },
  { color: '#ec4899', name: 'Pink' },
  { color: '#f59e0b', name: 'Amber' },
  { color: '#10b981', name: 'Emerald' },
  { color: '#3b82f6', name: 'Blue' },
  { color: '#ef4444', name: 'Red' },
  { color: '#14b8a6', name: 'Teal' },
  { color: '#a855f7', name: 'Violet' },
  { color: '#f97316', name: 'Orange' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#84cc16', name: 'Lime' }
]

const PRESET_ICONS = ['📚', '📖', '📝', '🎓', '💡', '🚀', '⭐', '🔥', '🎯', '💻', '🌟', '📊']

function Library({ onSelectNotebook }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [notebooks, setNotebooks] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedNotebook, setSelectedNotebook] = useState(null)
  const [newNotebook, setNewNotebook] = useState({
    name: '',
    color: '#6366f1',
    icon: '📚'
  })

  // Notification modal state
  const [notification, setNotification] = useState({
    show: false,
    type: '', // 'error', 'success', 'confirm'
    title: '',
    message: '',
    onConfirm: null
  })

  // Only fetch notebooks when auth is ready and user is authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchNotebooks()
    }
  }, [authLoading, isAuthenticated])

  const fetchNotebooks = async () => {
    try {
      const response = await axios.get(`${API_URL}/notebooks`)
      setNotebooks(response.data.notebooks)
    } catch (error) {
      console.error('Error fetching notebooks:', error)
      showNotification('error', 'Error', 'Failed to load notebooks. Please try again.')
    }
  }

  const showNotification = (type, title, message, onConfirm = null) => {
    setNotification({
      show: true,
      type,
      title,
      message,
      onConfirm
    })
  }

  const closeNotification = () => {
    setNotification({
      show: false,
      type: '',
      title: '',
      message: '',
      onConfirm: null
    })
  }

  const createNotebook = async () => {
    if (!newNotebook.name.trim()) {
      showNotification('error', 'Validation Error', 'Please enter a notebook name.')
      return
    }

    try {
      await axios.post(`${API_URL}/notebooks`, newNotebook)
      await fetchNotebooks()
      setShowCreateModal(false)
      setNewNotebook({ name: '', color: '#6366f1', icon: '📚' })
      showNotification('success', 'Success', 'Notebook created successfully!')
    } catch (error) {
      console.error('Error creating notebook:', error)
      showNotification('error', 'Error', 'Failed to create notebook. Please try again.')
    }
  }

  const updateNotebook = async () => {
    if (!selectedNotebook || !selectedNotebook.name.trim()) {
      showNotification('error', 'Validation Error', 'Please enter a notebook name.')
      return
    }

    try {
      await axios.put(`${API_URL}/notebooks/${selectedNotebook.id}`, {
        name: selectedNotebook.name,
        color: selectedNotebook.color,
        icon: selectedNotebook.icon
      })
      await fetchNotebooks()
      setShowEditModal(false)
      setSelectedNotebook(null)
      showNotification('success', 'Success', 'Notebook updated successfully!')
    } catch (error) {
      console.error('Error updating notebook:', error)
      showNotification('error', 'Error', 'Failed to update notebook. Please try again.')
    }
  }

  const deleteNotebook = async (id) => {
    showNotification(
      'confirm',
      'Delete Notebook',
      'Are you sure you want to delete this notebook and all its contents? This action cannot be undone.',
      async () => {
        try {
          await axios.delete(`${API_URL}/notebooks/${id}`)
          await fetchNotebooks()
          closeNotification()
          showNotification('success', 'Success', 'Notebook deleted successfully!')
        } catch (error) {
          console.error('Error deleting notebook:', error)
          closeNotification()
          showNotification('error', 'Error', 'Failed to delete notebook. Please try again.')
        }
      }
    )
  }

  const openEditModal = (notebook) => {
    setSelectedNotebook({ ...notebook })
    setShowEditModal(true)
  }

  return (
    <div className="library-container">
      {/* Navbar */}
      <Navbar />

      {/* Library Header */}
      <header className="library-subheader">
        <div className="library-title-section">
          <h2 className="library-title">My Library</h2>
          <p className="library-description">Organize your learning materials into notebooks</p>
        </div>
        <button className="btn-create" onClick={() => setShowCreateModal(true)}>
          <FiPlus size={18} />
          <span>New Notebook</span>
        </button>
      </header>

      {/* Notebooks Grid */}
      <main className="library-main">
        {authLoading ? (
          <div className="library-empty-state">
            <div className="empty-icon">
              <FiBookOpen size={64} />
            </div>
            <h2 className="empty-title">Loading your library...</h2>
            <p className="empty-description">Please wait while we fetch your notebooks</p>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="library-empty-state">
            <div className="empty-icon">
              <FiBookOpen size={64} />
            </div>
            <h2 className="empty-title">Your library is empty</h2>
            <p className="empty-description">
              Create your first notebook to start organizing your learning materials
            </p>
            <button className="btn-create-first" onClick={() => setShowCreateModal(true)}>
              <FiPlus size={18} />
              Create Notebook
            </button>
          </div>
        ) : (
          <div className="bookshelf-container">
            <div className="bookshelf-shelf">
              <div className="notebooks-bookshelf" style={{ display: 'flex', flexDirection: 'row', gap: '8px', flexWrap: 'nowrap' }}>
                {notebooks.map((notebook) => (
                  <div
                    key={notebook.id}
                    className="book-spine"
                    onClick={() => onSelectNotebook(notebook)}
                    style={{
                      '--notebook-color': notebook.color,
                      flexShrink: 0,
                      flexGrow: 0,
                      minWidth: '60px',
                      maxWidth: '60px',
                      width: '60px'
                    }}
                  >
                    <div className="book-actions">
                      <button
                        className="book-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(notebook)
                        }}
                        title="Edit notebook"
                      >
                        <FiEdit2 size={14} />
                      </button>
                      <button
                        className="book-action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNotebook(notebook.id)
                        }}
                        title="Delete notebook"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>

                    <div className="book-icon">{notebook.icon}</div>

                    <div className="book-title-container">
                      <span className="book-title">{notebook.name}</span>
                    </div>

                    <div className="book-count">
                      <span className="book-count-number">{notebook.document_count || 0}</span>
                      <span className="book-count-label">docs</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Notebook</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <FiX size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="My Notebook"
                  value={newNotebook.name}
                  onChange={(e) => setNewNotebook({ ...newNotebook, name: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && createNotebook()}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Icon</label>
                <div className="icon-grid">
                  {PRESET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      className={`icon-button ${newNotebook.icon === icon ? 'selected' : ''}`}
                      onClick={() => setNewNotebook({ ...newNotebook, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-grid">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.color}
                      className={`color-button ${newNotebook.color === preset.color ? 'selected' : ''}`}
                      style={{ backgroundColor: preset.color }}
                      onClick={() => setNewNotebook({ ...newNotebook, color: preset.color })}
                      title={preset.name}
                    >
                      {newNotebook.color === preset.color && <FiCheck size={16} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={createNotebook}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedNotebook && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Notebook</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <FiX size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="My Notebook"
                  value={selectedNotebook.name}
                  onChange={(e) => setSelectedNotebook({ ...selectedNotebook, name: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && updateNotebook()}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Icon</label>
                <div className="icon-grid">
                  {PRESET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      className={`icon-button ${selectedNotebook.icon === icon ? 'selected' : ''}`}
                      onClick={() => setSelectedNotebook({ ...selectedNotebook, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-grid">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.color}
                      className={`color-button ${selectedNotebook.color === preset.color ? 'selected' : ''}`}
                      style={{ backgroundColor: preset.color }}
                      onClick={() => setSelectedNotebook({ ...selectedNotebook, color: preset.color })}
                      title={preset.name}
                    >
                      {selectedNotebook.color === preset.color && <FiCheck size={16} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={updateNotebook}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notification.show && (
        <div className="modal-overlay notification-overlay" onClick={notification.type !== 'confirm' ? closeNotification : undefined}>
          <div
            className={`notification-modal ${notification.type}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notification-icon">
              {notification.type === 'error' && <FiAlertCircle size={32} />}
              {notification.type === 'success' && <FiCheckCircle size={32} />}
              {notification.type === 'confirm' && <FiAlertTriangle size={32} />}
            </div>

            <div className="notification-content">
              <h3 className="notification-title">{notification.title}</h3>
              <p className="notification-message">{notification.message}</p>
            </div>

            <div className="notification-actions">
              {notification.type === 'confirm' ? (
                <>
                  <button className="btn-secondary" onClick={closeNotification}>
                    Cancel
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => notification.onConfirm && notification.onConfirm()}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={closeNotification}>
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Library
