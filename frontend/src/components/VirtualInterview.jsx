import { useState, useEffect, useRef, useCallback } from 'react'
import { FiMic, FiMicOff, FiPlay, FiPause, FiStopCircle, FiCheckCircle, FiMessageCircle, FiUser, FiCpu, FiVolume2, FiSend } from 'react-icons/fi'
import axios from 'axios'
import { API_URL } from '../config'

function VirtualInterview({ documents, selectedDocIds, notebookId }) {
  const [interviewState, setInterviewState] = useState('setup') // setup, active, completed
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [fullTranscript, setFullTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Setup state
  const [interviewType, setInterviewType] = useState('technical') // technical, behavioral, mixed
  const [difficulty, setDifficulty] = useState('medium') // easy, medium, hard
  const [duration, setDuration] = useState(15) // in minutes
  const [useReadProgress, setUseReadProgress] = useState(false) // Limit to read pages (default: disabled)
  const [readingProgress, setReadingProgress] = useState({})

  // Interview progress
  const [startTime, setStartTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  // Scoring
  const [finalScore, setFinalScore] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Refs
  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const messagesEndRef = useRef(null)

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        setCurrentTranscript(finalTranscript || interimTranscript)
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
  }, [])

  // Fetch reading progress for selected documents
  useEffect(() => {
    const fetchReadingProgress = async () => {
      if (selectedDocIds.length > 0 && useReadProgress) {
        try {
          const token = localStorage.getItem('token')
          const progressData = {}

          for (const docId of selectedDocIds) {
            const response = await axios.get(
              `${API_URL}/reading-progress/${notebookId}/${docId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
            if (response.data.has_progress && response.data.completed_pages) {
              progressData[docId] = response.data.completed_pages
            }
          }

          setReadingProgress(progressData)
        } catch (error) {
          console.error('Error fetching reading progress:', error)
        }
      }
    }

    fetchReadingProgress()
  }, [selectedDocIds, useReadProgress, notebookId])

  // End interview function (defined before timer useEffect)
  const endInterview = useCallback(async () => {
    // Stop speech and recognition
    if (synthRef.current) {
      synthRef.current.cancel()
      setIsSpeaking(false)
    }
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }

    setIsProcessing(true)
    try {
      const response = await axios.post(`${API_URL}/interview/end`, {
        session_id: sessionId
      })

      setFinalScore(response.data.score)
      setFeedback(response.data.feedback)
      setInterviewState('completed')
    } catch (error) {
      console.error('Error ending interview:', error)
      alert('Failed to end interview. Please try again.')
      setInterviewState('completed') // Force completion even on error to avoid stuck state
    } finally {
      setIsProcessing(false)
    }
  }, [sessionId, isListening])

  // Timer
  useEffect(() => {
    let interval
    if (interviewState === 'active' && startTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setElapsedTime(elapsed)

        // Auto-end interview after duration
        if (elapsed >= duration * 60) {
          endInterview()
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [interviewState, startTime, duration, endInterview])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startInterview = async () => {
    // Collect completed pages if useReadProgress is enabled
    let pageNumbers = null
    if (useReadProgress && Object.keys(readingProgress).length > 0) {
      pageNumbers = Object.values(readingProgress).flat()

      if (pageNumbers.length === 0) {
        alert('You haven\'t read any pages yet. Disable "Limit to pages I\'ve read" or read some content first.')
        return
      }
    }

    setIsProcessing(true)
    try {
      const requestData = {
        notebook_id: notebookId,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        interview_type: interviewType,
        difficulty: difficulty,
        duration: duration
      }

      // Add page_numbers if limiting to read pages
      if (pageNumbers && pageNumbers.length > 0) {
        requestData.page_numbers = pageNumbers
      }

      const response = await axios.post(`${API_URL}/interview/start`, requestData)

      setSessionId(response.data.session_id)
      setMessages([{
        role: 'interviewer',
        content: response.data.initial_message,
        timestamp: new Date()
      }])
      setInterviewState('active')
      setStartTime(Date.now())

      // Speak the initial message
      speak(response.data.initial_message)
    } catch (error) {
      console.error('Error starting interview:', error)
      alert('Failed to start interview')
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setCurrentTranscript('')
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const stopListening = async () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)

      // Accumulate transcript instead of sending
      if (currentTranscript.trim()) {
        setFullTranscript(prev => (prev ? prev + ' ' : '') + currentTranscript.trim())
        setCurrentTranscript('')
      }
    }
  }

  const handleManualSubmit = async () => {
    const combinedTranscript = (fullTranscript + ' ' + currentTranscript).trim()

    if (combinedTranscript) {
      // Stop listening if active
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop()
        setIsListening(false)
      }

      await sendAnswer(combinedTranscript)
      setFullTranscript('')
      setCurrentTranscript('')
    }
  }

  const sendAnswer = async (answer) => {
    if (!answer.trim() || !sessionId) return

    // Add user message
    const userMessage = {
      role: 'user',
      content: answer,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])

    setIsProcessing(true)
    try {
      const response = await axios.post(`${API_URL}/interview/respond`, {
        session_id: sessionId,
        user_response: answer
      })

      // Add interviewer response
      const interviewerMessage = {
        role: 'interviewer',
        content: response.data.next_question,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, interviewerMessage])

      // Speak the next question
      speak(response.data.next_question)
    } catch (error) {
      console.error('Error sending answer:', error)
      alert('Failed to send answer')
    } finally {
      setIsProcessing(false)
    }
  }

  const speak = (text) => {
    if (synthRef.current && text) {
      // Cancel any ongoing speech
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 1

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      synthRef.current.speak(utterance)
    }
  }

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel()
      setIsSpeaking(false)
    }
  }

  const resetInterview = () => {
    setInterviewState('setup')
    setSessionId(null)
    setMessages([])
    setCurrentTranscript('')
    setStartTime(null)
    setElapsedTime(0)
    setFinalScore(null)
    setFeedback(null)
    setFullTranscript('')
    stopSpeaking()
    stopListening()
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimeRemaining = () => {
    const remaining = (duration * 60) - elapsedTime
    return formatTime(remaining)
  }

  // Setup screen
  if (interviewState === 'setup') {
    return (
      <div className="interview-container">
        <div className="interview-setup">
          <div className="interview-setup-header">
            <FiCpu size={48} className="interview-icon" />
            <h2>Virtual Interview</h2>
            <p>Practice your interview skills with an AI interviewer</p>
          </div>

          <div className="interview-setup-form">
            <div className="form-group">
              <label>Interview Type</label>
              <div className="interview-type-selector">
                <button
                  className={interviewType === 'technical' ? 'active' : ''}
                  onClick={() => setInterviewType('technical')}
                >
                  Technical
                </button>
                <button
                  className={interviewType === 'behavioral' ? 'active' : ''}
                  onClick={() => setInterviewType('behavioral')}
                >
                  Behavioral
                </button>
                <button
                  className={interviewType === 'mixed' ? 'active' : ''}
                  onClick={() => setInterviewType('mixed')}
                >
                  Mixed
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Difficulty Level</label>
              <div className="difficulty-selector">
                <button
                  className={difficulty === 'easy' ? 'active' : ''}
                  onClick={() => setDifficulty('easy')}
                >
                  Easy
                </button>
                <button
                  className={difficulty === 'medium' ? 'active' : ''}
                  onClick={() => setDifficulty('medium')}
                >
                  Medium
                </button>
                <button
                  className={difficulty === 'hard' ? 'active' : ''}
                  onClick={() => setDifficulty('hard')}
                >
                  Hard
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Duration (minutes)</label>
              <input
                type="number"
                min="5"
                max="60"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="duration-input"
              />
            </div>

            <div className="form-group" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <label style={{ marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={useReadProgress}
                  onChange={(e) => setUseReadProgress(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                Limit to pages I've read
              </label>
              {useReadProgress && Object.keys(readingProgress).length > 0 && (
                <span style={{ fontSize: '12px', color: 'var(--accent-primary)', marginLeft: '26px' }}>
                  ✓ {Object.values(readingProgress).flat().length} pages available
                </span>
              )}
              {useReadProgress && Object.keys(readingProgress).length === 0 && (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '26px' }}>
                  No reading progress yet. Open a PDF in View section to start tracking.
                </span>
              )}
            </div>

            <button
              className="start-interview-button"
              onClick={startInterview}
              disabled={isProcessing}
            >
              {isProcessing ? 'Starting...' : 'Start Interview'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active interview screen
  if (interviewState === 'active') {
    return (
      <div className="interview-container">
        <div className="interview-active">
          <div className="interview-header">
            <div className="interview-info">
              <h2>Interview in Progress</h2>
              <div className="interview-meta">
                <span className="interview-type-badge">{interviewType}</span>
                <span className="interview-difficulty-badge">{difficulty}</span>
              </div>
            </div>
            <div className="interview-timer">
              <div className="timer-display">
                <span className="timer-label">Time Remaining</span>
                <span className="timer-value">{formatTimeRemaining()}</span>
              </div>
            </div>
          </div>

          <div className="interview-chat">
            <div className="messages-container">
              {messages.map((message, index) => (
                <div key={index} className={`message message-${message.role}`}>
                  <div className="message-avatar">
                    {message.role === 'interviewer' ? <FiCpu /> : <FiUser />}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-role">
                        {message.role === 'interviewer' ? 'AI Interviewer' : 'You'}
                      </span>
                      <span className="message-time">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}

              {(currentTranscript || fullTranscript) && (
                <div className="message message-user message-interim">
                  <div className="message-avatar">
                    <FiUser />
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-role">You ({isListening ? 'speaking...' : 'paused'})</span>
                    </div>
                    <p className="interim-transcript">
                      {fullTranscript}
                      {fullTranscript && currentTranscript ? ' ' : ''}
                      {currentTranscript}
                    </p>
                  </div>
                </div>
              )}

              {isProcessing && (
                <div className="message message-interviewer">
                  <div className="message-avatar">
                    <FiCpu />
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="interview-controls">
            <div className="voice-controls">
              <button
                className={`mic-button ${isListening ? 'active' : ''}`}
                onClick={toggleListening}
                disabled={isProcessing || isSpeaking}
                title={isListening ? "Pause Recording" : "Start Recording"}
              >
                {isListening ? <FiMicOff size={24} /> : <FiMic size={24} />}
              </button>

              <button
                className="send-answer-button"
                onClick={handleManualSubmit}
                disabled={isProcessing || isSpeaking || (!fullTranscript && !currentTranscript)}
                title="Send Answer"
                style={{
                  backgroundColor: (!fullTranscript && !currentTranscript) ? '#334155' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: (!fullTranscript && !currentTranscript) ? 'not-allowed' : 'pointer',
                  opacity: (!fullTranscript && !currentTranscript) ? 0.5 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                <FiSend size={20} />
              </button>

              <span className="mic-status">
                {isListening ? 'Listening... (Click mic to pause)' : isSpeaking ? 'AI Speaking...' : fullTranscript ? 'Recording paused. Click mic to resume or arrow to send.' : 'Click mic to speak'}
              </span>

              {isSpeaking && (
                <button className="stop-speaking-button" onClick={stopSpeaking}>
                  <FiVolume2 /> Stop AI
                </button>
              )}
            </div>

            <button className="end-interview-button" onClick={endInterview}>
              <FiStopCircle /> End Interview
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Completed interview screen
  if (interviewState === 'completed') {
    return (
      <div className="interview-container">
        <div className="interview-completed">
          <div className="completion-header">
            <FiCheckCircle size={64} className="completion-icon" />
            <h2>Interview Completed!</h2>
            <p>Great job! Here's your performance summary</p>
          </div>

          {finalScore && (
            <div className="score-card">
              <div className="score-display">
                <span className="score-label">Overall Score</span>
                <span className="score-value">{finalScore.overall_score}/100</span>
              </div>

              <div className="score-breakdown">
                <div className="score-metric">
                  <span className="metric-label">Communication</span>
                  <div className="metric-bar">
                    <div
                      className="metric-fill"
                      style={{ width: `${finalScore.communication_score}%` }}
                    ></div>
                  </div>
                  <span className="metric-value">{finalScore.communication_score}/100</span>
                </div>

                <div className="score-metric">
                  <span className="metric-label">Technical Knowledge</span>
                  <div className="metric-bar">
                    <div
                      className="metric-fill"
                      style={{ width: `${finalScore.technical_score}%` }}
                    ></div>
                  </div>
                  <span className="metric-value">{finalScore.technical_score}/100</span>
                </div>

                <div className="score-metric">
                  <span className="metric-label">Problem Solving</span>
                  <div className="metric-bar">
                    <div
                      className="metric-fill"
                      style={{ width: `${finalScore.problem_solving_score}%` }}
                    ></div>
                  </div>
                  <span className="metric-value">{finalScore.problem_solving_score}/100</span>
                </div>
              </div>
            </div>
          )}

          {feedback && (
            <div className="feedback-section">
              <h3>Feedback & Recommendations</h3>

              <div className="feedback-group">
                <h4>Strengths</h4>
                <ul>
                  {feedback.strengths.map((strength, index) => (
                    <li key={index}>{strength}</li>
                  ))}
                </ul>
              </div>

              <div className="feedback-group">
                <h4>Areas for Improvement</h4>
                <ul>
                  {feedback.improvements.map((improvement, index) => (
                    <li key={index}>{improvement}</li>
                  ))}
                </ul>
              </div>

              <div className="feedback-group">
                <h4>Recommendations</h4>
                <ul>
                  {feedback.recommendations.map((recommendation, index) => (
                    <li key={index}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="transcript-section">
            <h3>Interview Transcript</h3>
            <div className="transcript-messages">
              {messages.map((message, index) => (
                <div key={index} className={`transcript-message transcript-${message.role}`}>
                  <div className="transcript-header">
                    <span className="transcript-role">
                      {message.role === 'interviewer' ? 'AI Interviewer' : 'You'}
                    </span>
                    <span className="transcript-time">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="completion-actions">
            <button className="secondary-button" onClick={resetInterview}>
              Start New Interview
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default VirtualInterview
