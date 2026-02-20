import { useState, useEffect } from 'react'
import { FiCheck, FiX, FiRefreshCw, FiLoader, FiAward } from 'react-icons/fi'
import axios from 'axios'
import ReactMarkdown from 'react-markdown';
import NotificationModal from './NotificationModal'
import LoadingSpinner from './LoadingSpinner'
import { useNotification } from '../hooks/useNotification'
import { API_URL } from '../config'

function Quiz({ documents, selectedDocIds, notebookId }) {
  const [quizState, setQuizState] = useState('idle') // idle, loading, taking, results
  const [quiz, setQuiz] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState([])
  const [results, setResults] = useState(null)
  const [numQuestions, setNumQuestions] = useState(5)
  const [difficulty, setDifficulty] = useState('medium')
  const [useReadProgress, setUseReadProgress] = useState(false) // Limit to read pages (default: disabled)
  const [readingProgress, setReadingProgress] = useState({})

  // Notification modal
  const {
    notification,
    closeNotification,
    showError,
    showWarning,
    showConfirm
  } = useNotification()

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

  const generateQuiz = async () => {
    if (documents.length === 0) {
      showWarning('No Documents', 'Please upload documents first')
      return
    }

    // Collect completed pages if useReadProgress is enabled
    let pageNumbers = null
    if (useReadProgress && Object.keys(readingProgress).length > 0) {
      pageNumbers = Object.values(readingProgress).flat()

      if (pageNumbers.length === 0) {
        showWarning('No Read Pages', 'You haven\'t read any pages yet. Disable "Limit to read pages" or read some content first.')
        return
      }
    }

    setQuizState('loading')
    try {
      const requestData = {
        notebook_id: notebookId,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        num_questions: numQuestions,
        difficulty: difficulty
      }

      // Add page_numbers if limiting to read pages
      if (pageNumbers && pageNumbers.length > 0) {
        requestData.page_numbers = pageNumbers
      }

      const response = await axios.post(`${API_URL}/generate-quiz`, requestData)

      setQuiz(response.data)
      setAnswers(new Array(response.data.questions.length).fill(null))
      setCurrentQuestion(0)
      setQuizState('taking')
    } catch (error) {
      console.error('Error generating quiz:', error)
      showError('Error', 'Failed to generate quiz. Please try again.')
      setQuizState('idle')
    }
  }

  const selectAnswer = (questionIndex, optionIndex) => {
    const newAnswers = [...answers]
    newAnswers[questionIndex] = optionIndex
    setAnswers(newAnswers)
  }

  const submitQuiz = async () => {
    // Check if all questions are answered
    if (answers.includes(null)) {
      showConfirm(
        'Unanswered Questions',
        'You have unanswered questions. Are you sure you want to submit?',
        async () => {
          closeNotification()
          await processSubmit()
        },
        { confirmText: 'Submit Anyway' }
      )
      return
    }
    await processSubmit()
  }

  const processSubmit = async () => {

    setQuizState('loading')
    try {
      const formattedAnswers = answers.map((answer, index) => ({
        question_index: index,
        selected_option: answer !== null ? answer : 0
      }))

      const response = await axios.post(`${API_URL}/submit-quiz`, {
        quiz_id: quiz.quiz_id,
        answers: formattedAnswers
      })

      setResults(response.data)
      setQuizState('results')
    } catch (error) {
      console.error('Error submitting quiz:', error)
      showError('Error', 'Failed to submit quiz. Please try again.')
      setQuizState('taking')
    }
  }

  const resetQuiz = () => {
    setQuizState('idle')
    setQuiz(null)
    setCurrentQuestion(0)
    setAnswers([])
    setResults(null)
  }

  const getScoreColor = (percentage) => {
    if (percentage >= 80) return '#10b981'
    if (percentage >= 60) return '#f59e0b'
    return '#ef4444'
  }

  if (quizState === 'idle') {
    return (
      <>
        <div className="quiz-container">
          <div className="quiz-setup">
            <div className="quiz-setup-header">
              <FiAward size={48} style={{ color: 'var(--primary)' }} />
              <h2>Generate Quiz</h2>
              <p>Test your knowledge with AI-generated questions from your documents</p>
            </div>

            <div className="quiz-setup-options">
              <div className="quiz-option">
                <label>Number of Questions</label>
                <select
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="quiz-select"
                >
                  <option value={3}>3 Questions</option>
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                </select>
              </div>

              <div className="quiz-option">
                <label>Difficulty Level</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="quiz-select"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="mixed">Mixed (Easy, Medium & Hard)</option>
                </select>
              </div>

              <div className="quiz-option" style={{ position: 'relative', zIndex: 100, pointerEvents: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setUseReadProgress(!useReadProgress)}>
                  <input
                    type="checkbox"
                    checked={useReadProgress}
                    onChange={(e) => setUseReadProgress(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                      position: 'relative',
                      zIndex: 102,
                      accentColor: 'var(--accent-primary)'
                    }}
                  />
                  <span style={{ userSelect: 'none' }}>Limit to pages I've read</span>
                </div>
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
            </div>

            {selectedDocIds.length > 0 && (
              <div className="quiz-info">
                Generating quiz from {selectedDocIds.length} selected document(s)
              </div>
            )}

            <button
              className="generate-quiz-button"
              onClick={generateQuiz}
              disabled={documents.length === 0}
            >
              <FiAward />
              Generate Quiz
            </button>

            {documents.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', marginTop: '16px', fontSize: '14px' }}>
                Please upload documents first to generate a quiz
              </p>
            )}
          </div>
        </div>
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
      </>
    )
  }

  if (quizState === 'loading') {
    return (
      <>
        <div className="quiz-container">
          <div className="quiz-loading">
            <LoadingSpinner size="large" text="Generating your quiz..." />
          </div>
        </div>
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
      </>
    )
  }

  if (quizState === 'taking' && quiz) {
    const question = quiz.questions[currentQuestion]
    const progress = ((currentQuestion + 1) / quiz.questions.length) * 100

    return (
      <div className="quiz-container">
        <div className="quiz-header">
          <div className="quiz-progress">
            <div className="quiz-progress-bar">
              <div
                className="quiz-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="quiz-progress-text">
              Question {currentQuestion + 1} of {quiz.questions.length}
            </span>
          </div>
        </div>

        <div className="quiz-question-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="quiz-question-topic">{question.topic}</div>
            {question.difficulty && (
              <span
                className={`difficulty-badge ${question.difficulty.toLowerCase()}`}
              >
                {question.difficulty}
              </span>
            )}
          </div>
          <h3 className="quiz-question">{question.question}</h3>

          <div className="quiz-options">
            {question.options.map((option, index) => (
              <button
                key={index}
                className={`quiz-option-button ${answers[currentQuestion] === index ? 'selected' : ''
                  }`}
                onClick={() => selectAnswer(currentQuestion, index)}
              >
                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                <span className="option-text">{option}</span>
                {answers[currentQuestion] === index && (
                  <FiCheck className="option-check" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="quiz-navigation">
          <button
            className="quiz-nav-button"
            onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
            disabled={currentQuestion === 0}
          >
            Previous
          </button>

          <div className="quiz-dots">
            {quiz.questions.map((_, index) => (
              <button
                key={index}
                className={`quiz-dot ${index === currentQuestion ? 'active' : ''
                  } ${answers[index] !== null ? 'answered' : ''}`}
                onClick={() => setCurrentQuestion(index)}
              />
            ))}
          </div>

          {currentQuestion < quiz.questions.length - 1 ? (
            <button
              className="quiz-nav-button primary"
              onClick={() => setCurrentQuestion(currentQuestion + 1)}
            >
              Next
            </button>
          ) : (
            <button className="quiz-submit-button" onClick={submitQuiz}>
              Submit Quiz
            </button>
          )}
        </div>
      </div >
    )
  }

  if (quizState === 'results' && results) {
    return (
      <div className="quiz-container">
        <div className="quiz-results">
          <div className="results-header">
            <div
              className="results-score-circle"
              style={{ borderColor: getScoreColor(results.score_percentage) }}
            >
              <div
                className="results-score-text"
                style={{ color: getScoreColor(results.score_percentage) }}
              >
                {results.score_percentage.toFixed(0)}%
              </div>
              <div className="results-score-label">
                {results.score} / {results.total_questions}
              </div>
            </div>

            <h2>Quiz Results</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              {results.score_percentage >= 80
                ? 'Excellent work!'
                : results.score_percentage >= 60
                  ? 'Good effort!'
                  : 'Keep practicing!'}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px', fontStyle: 'italic' }}>
              Weighted scoring: Hard questions contribute 2x, Medium 1.5x, Easy 1x to your final score
            </p>
          </div>

          <div className="results-analysis">
            <h3>Performance Analysis</h3>
            <div className="analysis-text"><ReactMarkdown>{results.analysis}</ReactMarkdown></div>
          </div>

          {Object.keys(results.topic_performance).length > 0 && (
            <div className="results-topics">
              <h3>Topic Breakdown</h3>
              <div className="topic-grid">
                {Object.entries(results.topic_performance).map(([topic, perf]) => {
                  const percentage = (perf.correct / perf.total) * 100
                  return (
                    <div key={topic} className="topic-card">
                      <div className="topic-name">{topic}</div>
                      <div className="topic-score">
                        {perf.correct} / {perf.total}
                      </div>
                      <div className="topic-bar">
                        <div
                          className="topic-bar-fill"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: getScoreColor(percentage)
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="results-details">
            <h3>Question Review</h3>
            {results.results.map((result, index) => (
              <div
                key={index}
                className={`result-item ${result.is_correct ? 'correct' : 'incorrect'
                  }`}
              >
                <div className="result-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="result-number">Question {index + 1}</span>
                    {result.difficulty && (
                      <span
                        className={`difficulty-badge ${result.difficulty.toLowerCase()}`}
                      >
                        {result.difficulty}
                      </span>
                    )}
                  </div>
                  {result.is_correct ? (
                    <FiCheck className="result-icon correct" />
                  ) : (
                    <FiX className="result-icon incorrect" />
                  )}
                </div>
                <div className="result-question">{result.question}</div>
                <div className="result-answers">
                  <div
                    className={`result-answer ${!result.is_correct ? 'wrong' : ''
                      }`}
                  >
                    Your answer:{' '}
                    <strong>
                      {String.fromCharCode(65 + result.selected_option)}
                    </strong>
                  </div>
                  {!result.is_correct && (
                    <div className="result-answer correct">
                      Correct answer:{' '}
                      <strong>
                        {String.fromCharCode(65 + result.correct_answer)}
                      </strong>
                    </div>
                  )}
                </div>
                {
                  result.explanation && (
                    <div className="result-explanation">{result.explanation}</div>
                  )
                }
              </div>
            ))}
          </div>

          <button className="retry-quiz-button" onClick={resetQuiz}>
            <FiRefreshCw />
            Generate New Quiz
          </button>
        </div>
      </div >
    )
  }

  return null
}

export default Quiz
