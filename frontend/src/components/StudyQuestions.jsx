import { useState, useEffect } from 'react'
import { FiZap, FiLoader, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import axios from 'axios'
import { API_URL } from '../config'

function StudyQuestions({ notebookId, documentId, onHighlightAnswer }) {
  const [questions, setQuestions] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [expandedTypes, setExpandedTypes] = useState({
    '2-marks': true,
    '5-marks': true,
    '10-marks': true
  })
  const [selectedQuestion, setSelectedQuestion] = useState(null)

  // Load existing questions on mount
  useEffect(() => {
    loadQuestions()
  }, [notebookId, documentId])

  const loadQuestions = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const response = await axios.get(
        `${API_URL}/pdf-questions/${notebookId}?doc_id=${documentId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )

      setQuestions(response.data.questions || [])
    } catch (err) {
      console.error('Error loading questions:', err)
    }
  }

  const handleGenerateQuestions = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await axios.post(
        `${API_URL}/documents/${notebookId}/${documentId}/analyze`,
        {
          question_types: ['2-marks', '5-marks', '10-marks']
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data.status === 'success') {
        setQuestions(response.data.questions || [])
      }
    } catch (err) {
      console.error('Error generating questions:', err)
      setError(err.response?.data?.detail || 'Failed to generate questions')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleQuestionClick = (question) => {
    setSelectedQuestion(question.id)

    // Call the callback to highlight the answer in PDF
    if (onHighlightAnswer && question.answer_text_snippet) {
      onHighlightAnswer({
        text: question.answer_text_snippet,
        page: question.page
      })
    }
  }

  const toggleTypeExpansion = (type) => {
    setExpandedTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }))
  }

  // Group questions by type
  const questionsByType = {
    '2-marks': questions.filter(q => q.type === '2-marks'),
    '5-marks': questions.filter(q => q.type === '5-marks'),
    '10-marks': questions.filter(q => q.type === '10-marks')
  }

  return (
    <div className="study-questions">
      {/* Header */}
      <div className="study-questions-header">
        <h3>Study Questions</h3>
        <button
          className={`generate-btn ${isGenerating ? 'generating' : ''}`}
          onClick={handleGenerateQuestions}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <FiLoader className="spin" />
              Generating...
            </>
          ) : (
            <>
              <FiZap />
              Generate Questions
            </>
          )}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Questions List */}
      <div className="questions-list">
        {questions.length === 0 ? (
          <div className="empty-state">
            <FiZap size={48} />
            <p>Click "Generate Questions" to analyze this PDF and create study questions</p>
          </div>
        ) : (
          <>
            {/* 2-marks questions */}
            {questionsByType['2-marks'].length > 0 && (
              <div className="question-section">
                <div
                  className="section-header"
                  onClick={() => toggleTypeExpansion('2-marks')}
                >
                  <h4>2-Mark Questions ({questionsByType['2-marks'].length})</h4>
                  {expandedTypes['2-marks'] ? <FiChevronUp /> : <FiChevronDown />}
                </div>
                {expandedTypes['2-marks'] && (
                  <div className="questions-container">
                    {questionsByType['2-marks'].map((q, idx) => (
                      <div
                        key={q.id}
                        className={`question-card ${selectedQuestion === q.id ? 'selected' : ''}`}
                        onClick={() => handleQuestionClick(q)}
                      >
                        <div className="question-number">Q{idx + 1}</div>
                        <div className="question-content">
                          <div className="question-text">{q.question}</div>
                          <div className="question-meta">Page {q.page}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5-marks questions */}
            {questionsByType['5-marks'].length > 0 && (
              <div className="question-section">
                <div
                  className="section-header"
                  onClick={() => toggleTypeExpansion('5-marks')}
                >
                  <h4>5-Mark Questions ({questionsByType['5-marks'].length})</h4>
                  {expandedTypes['5-marks'] ? <FiChevronUp /> : <FiChevronDown />}
                </div>
                {expandedTypes['5-marks'] && (
                  <div className="questions-container">
                    {questionsByType['5-marks'].map((q, idx) => (
                      <div
                        key={q.id}
                        className={`question-card ${selectedQuestion === q.id ? 'selected' : ''}`}
                        onClick={() => handleQuestionClick(q)}
                      >
                        <div className="question-number">Q{idx + 1}</div>
                        <div className="question-content">
                          <div className="question-text">{q.question}</div>
                          <div className="question-meta">Page {q.page}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 10-marks questions */}
            {questionsByType['10-marks'].length > 0 && (
              <div className="question-section">
                <div
                  className="section-header"
                  onClick={() => toggleTypeExpansion('10-marks')}
                >
                  <h4>10-Mark Questions ({questionsByType['10-marks'].length})</h4>
                  {expandedTypes['10-marks'] ? <FiChevronUp /> : <FiChevronDown />}
                </div>
                {expandedTypes['10-marks'] && (
                  <div className="questions-container">
                    {questionsByType['10-marks'].map((q, idx) => (
                      <div
                        key={q.id}
                        className={`question-card ${selectedQuestion === q.id ? 'selected' : ''}`}
                        onClick={() => handleQuestionClick(q)}
                      >
                        <div className="question-number">Q{idx + 1}</div>
                        <div className="question-content">
                          <div className="question-text">{q.question}</div>
                          <div className="question-meta">Page {q.page}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default StudyQuestions
