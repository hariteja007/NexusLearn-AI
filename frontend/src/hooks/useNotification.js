/**
 * Nexus Learn useNotification Hook
 *
 * A custom hook for managing notification modal state.
 * Makes it easy to show error, success, confirm, and info modals.
 */

import { useState } from 'react'

export function useNotification() {
  const [notification, setNotification] = useState({
    show: false,
    type: '',
    title: '',
    message: '',
    onConfirm: null,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    okText: 'OK'
  })

  const showNotification = (
    type,
    title,
    message,
    onConfirm = null,
    options = {}
  ) => {
    setNotification({
      show: true,
      type,
      title,
      message,
      onConfirm,
      confirmText: options.confirmText || 'Delete',
      cancelText: options.cancelText || 'Cancel',
      okText: options.okText || 'OK'
    })
  }

  const closeNotification = () => {
    setNotification({
      show: false,
      type: '',
      title: '',
      message: '',
      onConfirm: null,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      okText: 'OK'
    })
  }

  // Convenience methods for common notification types
  const showError = (title, message) => {
    showNotification('error', title, message)
  }

  const showSuccess = (title, message) => {
    showNotification('success', title, message)
  }

  const showWarning = (title, message) => {
    showNotification('warning', title, message)
  }

  const showInfo = (title, message) => {
    showNotification('info', title, message)
  }

  const showConfirm = (title, message, onConfirm, options = {}) => {
    showNotification('confirm', title, message, onConfirm, options)
  }

  return {
    notification,
    showNotification,
    closeNotification,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    showConfirm
  }
}
