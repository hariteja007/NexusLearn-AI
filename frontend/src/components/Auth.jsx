import { useState, useEffect, useRef } from 'react';
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import axios from 'axios';
import { API_URL } from '../config';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function Auth({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const googleButtonRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  // Initialize Google Sign-In
  useEffect(() => {
    if (window.google && GOOGLE_CLIENT_ID) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
      });

      if (googleButtonRef.current) {
        window.google.accounts.id.renderButton(
          googleButtonRef.current,
          {
            theme: 'filled_black',
            size: 'large',
            width: googleButtonRef.current.offsetWidth,
            text: 'continue_with',
          }
        );
      }
    }
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : { name: formData.name, email: formData.email, password: formData.password };

      const response = await axios.post(`${API_URL}${endpoint}`, payload);

      // Save token to localStorage
      localStorage.setItem('token', response.data.access_token);

      // Call parent callback
      onAuth(response.data.access_token);
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCallback = async (response) => {
    setLoading(true);
    setError('');

    try {
      const result = await axios.post(`${API_URL}/auth/google`, {
        token: response.credential,
      });

      // Save token and call parent callback
      localStorage.setItem('token', result.data.access_token);
      onAuth(result.data.access_token);
    } catch (err) {
      setError(err.response?.data?.detail || 'Google Sign-In failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ name: '', email: '', password: '' });
  };

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="auth-blob auth-blob-1"></div>
        <div className="auth-blob auth-blob-2"></div>
        <div className="auth-blob auth-blob-3"></div>
      </div>

      <div className="auth-content">
        <div className="auth-left">
          <div className="auth-branding animate-entry">
            <img src="/logo.png" alt="Nexus Learn Logo" className="auth-brand-logo" />
            <h1 className="auth-brand-title text-gradient">NexusLearn</h1>
            <p className="auth-brand-tagline">Advanced Intelligent Learning & Knowledge Engineering System</p>
          </div>
          <div className="auth-features animate-entry delay-100">
            <div className="auth-feature">
              <div className="auth-feature-icon">📚</div>
              <div className="auth-feature-text">
                <h3>Organize Your Learning</h3>
                <p>Create notebooks and manage all your study materials in one place</p>
              </div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">🤖</div>
              <div className="auth-feature-text">
                <h3>AI-Powered Insights</h3>
                <p>Get instant answers and generate quizzes from your documents</p>
              </div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">🎯</div>
              <div className="auth-feature-text">
                <h3>Smart Practice</h3>
                <p>Take mock tests and virtual interviews to ace your exams</p>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-right animate-entry delay-200">
          <div className="auth-box">
            <div className="auth-box-header">
              <h2 className="auth-box-title">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="auth-box-subtitle">
                {isLogin ? 'Sign in to continue learning' : 'Start your learning journey today'}
              </p>
            </div>

            <div className="auth-tabs">
              <button
                className={`auth-tab ${isLogin ? 'active' : ''}`}
                onClick={() => setIsLogin(true)}
              >
                Login
              </button>
              <button
                className={`auth-tab ${!isLogin ? 'active' : ''}`}
                onClick={() => setIsLogin(false)}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field" data-hidden={isLogin ? "true" : "false"}>
                <label htmlFor="name" className="auth-label">Full Name</label>
                <div className="auth-input-wrapper">
                  <FiUser className="auth-input-icon" />
                  <input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={handleChange}
                    required={!isLogin}
                    className="auth-input"
                    tabIndex={isLogin ? -1 : 0}
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="email" className="auth-label">Email Address</label>
                <div className="auth-input-wrapper">
                  <FiMail className="auth-input-icon" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="password" className="auth-label">Password</label>
                <div className="auth-input-wrapper">
                  <FiLock className="auth-input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="auth-input"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            {/* <div className="auth-divider">
              <span>OR</span>
            </div> */}

            {/* {GOOGLE_CLIENT_ID ? (
              <div ref={googleButtonRef} className="auth-google-button"></div>
            ) : (
              <div className="auth-google-placeholder">
                <p>To enable Google Sign-In, add VITE_GOOGLE_CLIENT_ID to your .env file</p>
              </div>
            )} */}

            {/* <p className="auth-footer">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={toggleMode} className="auth-link">
                {isLogin ? 'Sign Up' : 'Login'}
              </button>
            </p> */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Auth;
