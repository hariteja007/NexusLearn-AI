import { FiLogOut } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'

function Navbar() {
  const { user, logout } = useAuth()

  return (
    <div className="app-navbar">
      <div className="navbar-left">
        <img src="/logo.png" alt="Nexus Learn Logo" className="navbar-logo" />
        <div className="navbar-title-section">
          <h1 className="navbar-title text-gradient">NexusLearn</h1>
          <span className="navbar-subtitle">Advanced Intelligent Learning & Knowledge Engineering System</span>
        </div>
      </div>
      <div className="navbar-right">
        <div className="navbar-user-info">
          <span className="navbar-user-name">{user?.name}</span>
          <span className="navbar-user-email">{user?.email}</span>
        </div>
        <button
          onClick={logout}
          className="navbar-logout-btn"
          title="Logout"
        >
          <FiLogOut />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}

export default Navbar
