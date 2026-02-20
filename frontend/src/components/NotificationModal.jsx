/**
 * Nexus Learn Notification Modal Component
 *
 * A reusable notification modal that matches the Nexus Learn design system.
 * Supports error, success, confirm, warning, and info types.
 */

import { FiAlertCircle, FiCheckCircle, FiAlertTriangle, FiInfo } from 'react-icons/fi'
import '../notification-modal.css'

function NotificationModal({
  show,
  type = 'info', // 'error', 'success', 'confirm', 'warning', 'info'
  title,
  message,
  onClose,
  onConfirm,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  okText = 'OK'
}) {
  if (!show) return null

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <FiAlertCircle size={32} />
      case 'success':
        return <FiCheckCircle size={32} />
      case 'confirm':
      case 'warning':
        return <FiAlertTriangle size={32} />
      case 'info':
      default:
        return <FiInfo size={32} />
    }
  }

  const handleBackdropClick = () => {
    // Don't close on backdrop click for confirm type
    if (type !== 'confirm') {
      onClose()
    }
  }

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm()
    }
  }

  return (
    <div className="notification-modal-overlay" onClick={handleBackdropClick}>
      <div
        className={`notification-modal ${type}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notification-icon">
          {getIcon()}
        </div>

        <div className="notification-content">
          <h3 className="notification-title">{title}</h3>
          <p className="notification-message">{message}</p>
        </div>

        <div className="notification-actions">
          {type === 'confirm' ? (
            <>
              <button className="btn-secondary" onClick={onClose}>
                {cancelText}
              </button>
              <button className="btn-danger" onClick={handleConfirm}>
                {confirmText}
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={onClose}>
              {okText}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationModal
