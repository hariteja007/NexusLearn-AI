/**
 * Nexus Learn Loading Spinner Component
 *
 * A reusable loading spinner that matches the Nexus Learn design system.
 * Features smooth animations with bronze/gold accent colors.
 */

import '../notification-modal.css'

function LoadingSpinner({ size = 'medium', text = '', className = '' }) {
  const sizeClasses = {
    small: 'spinner-small',
    medium: 'spinner-medium',
    large: 'spinner-large'
  }

  return (
    <div className={`loading-spinner-container ${className}`}>
      <div className={`loading-spinner ${sizeClasses[size]}`}>
        <div className="spinner-circle"></div>
      </div>
      {text && <p className="loading-text">{text}</p>}
    </div>
  )
}

export default LoadingSpinner
