/**
 * Notebook Context
 *
 * Global state management for the currently selected notebook.
 * Provides notebook selection state and actions across the entire application.
 *
 * Features:
 * - Persistent notebook selection using localStorage
 * - Global access to selected notebook data
 * - Notebook selection and clearing actions
 * - Automatic state synchronization
 *
 * Usage:
 *   const { selectedNotebook, selectNotebook, clearNotebook } = useNotebook()
 *
 * @author Srikar
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

// Create the context
const NotebookContext = createContext()

/**
 * Custom hook to access notebook context
 * Must be used within a NotebookProvider
 *
 * @returns {Object} Notebook context value with state and actions
 * @throws {Error} If used outside of NotebookProvider
 */
export const useNotebook = () => {
  const context = useContext(NotebookContext)
  if (!context) {
    throw new Error('useNotebook must be used within a NotebookProvider')
  }
  return context
}

/**
 * NotebookProvider Component
 * Wraps the application to provide global notebook state
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const NotebookProvider = ({ children }) => {
  const { isAuthenticated } = useAuth()
  // Currently selected notebook state
  const [selectedNotebook, setSelectedNotebook] = useState(null)

  // Clear notebook selection when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedNotebook(null)
      localStorage.removeItem('selectedNotebookId')
      localStorage.removeItem('selectedNotebook')
    }
  }, [isAuthenticated])

  // Load selected notebook from localStorage on mount (only if authenticated)
  useEffect(() => {
    if (!isAuthenticated) return

    try {
      const savedNotebookId = localStorage.getItem('selectedNotebookId')
      if (savedNotebookId) {
        const savedNotebookStr = localStorage.getItem('selectedNotebook')
        if (savedNotebookStr) {
          const savedNotebook = JSON.parse(savedNotebookStr)
          if (savedNotebook) {
            setSelectedNotebook(savedNotebook)
          }
        }
      }
    } catch (error) {
      console.error('Error loading saved notebook:', error)
      // Clear corrupted data
      localStorage.removeItem('selectedNotebookId')
      localStorage.removeItem('selectedNotebook')
    }
  }, [isAuthenticated])

  // Save selected notebook to localStorage whenever it changes
  useEffect(() => {
    if (selectedNotebook) {
      localStorage.setItem('selectedNotebookId', selectedNotebook.id)
      localStorage.setItem('selectedNotebook', JSON.stringify(selectedNotebook))
    } else {
      localStorage.removeItem('selectedNotebookId')
      localStorage.removeItem('selectedNotebook')
    }
  }, [selectedNotebook])

  /**
   * Select a notebook and make it the active context
   * @param {Object} notebook - Notebook object to select
   */
  const selectNotebook = (notebook) => {
    setSelectedNotebook(notebook)
  }

  /**
   * Clear the current notebook selection
   * Returns to the library/home view
   */
  const clearNotebook = () => {
    setSelectedNotebook(null)
  }

  /**
   * Update the current notebook's information
   * Useful for reflecting changes without refetching
   * @param {Object} updatedInfo - Partial notebook data to update
   */
  const updateNotebookInfo = (updatedInfo) => {
    if (selectedNotebook) {
      setSelectedNotebook({
        ...selectedNotebook,
        ...updatedInfo
      })
    }
  }

  // Context value exposed to consuming components
  const value = {
    selectedNotebook,      // Current notebook or null
    selectNotebook,        // Function to select a notebook
    clearNotebook,         // Function to clear selection
    updateNotebookInfo     // Function to update notebook data
  }

  return (
    <NotebookContext.Provider value={value}>
      {children}
    </NotebookContext.Provider>
  )
}

export default NotebookContext
