import { useState, useEffect, useRef } from 'react'
import { FiZap, FiEdit3, FiSave, FiX, FiCheck, FiLoader, FiArrowRight, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import axios from 'axios'
import { API_URL } from '../config'

function PDFAnalyzer({ notebookId, selectedDoc, onHighlightsUpdate, onAnalysisComplete, onNavigateToPage, onSwitchToAnnotations }) {
  const [analysisMode, setAnalysisMode] = useState('auto')
  const [customPrompt, setCustomPrompt] = useState('')
  const [questionTypes, setQuestionTypes] = useState({
    '2-marks': true,
    '5-marks': true,
    '10-marks': true
  })

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [previewHighlights, setPreviewHighlights] = useState([])
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  const [selectedHighlights, setSelectedHighlights] = useState(new Set())
  const [selectedQuestions, setSelectedQuestions] = useState(new Set())
  const [error, setError] = useState(null)

  // Panel expansion state
  const [expandedSections, setExpandedSections] = useState({
    '2-marks': true,
    '5-marks': true,
    '10-marks': true,
    highlights: true
  })

  const eventSourceRef = useRef(null)

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const toggleQuestionType = (type) => {
    setQuestionTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }))
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const analyzeDocument = async () => {
    if (!selectedDoc) return

    setIsAnalyzing(true)
    setError(null)
    setPreviewHighlights([])
    setGeneratedQuestions([])
    setProgress({ current: 0, total: 0 })

    // Clear preview highlights in parent component
    if (onHighlightsUpdate) {
      onHighlightsUpdate([])
    }

    try {
      const token = localStorage.getItem('token')
      const selectedTypes = Object.entries(questionTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type, _]) => type)

      const requestBody = {
        mode: analysisMode,
        custom_prompt: analysisMode === 'custom' ? customPrompt : null,
        question_types: selectedTypes
      }

      // Use fetch for SSE
      const response = await fetch(
        `${API_URL}/documents/${notebookId}/${selectedDoc.id}/analyze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        }
      )

      if (!response.ok) {
        throw new Error('Analysis request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.error) {
                setError(data.error)
                setIsAnalyzing(false)
                return
              }

              if (data.status === 'processing') {
                setProgress({ current: data.page, total: data.total_pages })

                // Add highlights from this page
                if (data.highlights && data.highlights.length > 0) {
                  setPreviewHighlights(prev => {
                    const updated = [...prev, ...data.highlights]
                    // Notify parent component of highlight updates
                    if (onHighlightsUpdate) {
                      onHighlightsUpdate(updated)
                    }
                    return updated
                  })
                }

                // Add questions from this page
                if (data.questions && data.questions.length > 0) {
                  setGeneratedQuestions(prev => [...prev, ...data.questions])
                }
              } else if (data.status === 'complete') {
                setIsAnalyzing(false)
                if (onAnalysisComplete) {
                  onAnalysisComplete({
                    highlights: previewHighlights,
                    questions: generatedQuestions
                  })
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.message || 'Failed to analyze document')
      setIsAnalyzing(false)
    }
  }

  const toggleHighlightSelection = (highlightId) => {
    setSelectedHighlights(prev => {
      const newSet = new Set(prev)
      if (newSet.has(highlightId)) {
        newSet.delete(highlightId)
      } else {
        newSet.add(highlightId)
      }
      return newSet
    })
  }

  const toggleQuestionSelection = (questionId) => {
    setSelectedQuestions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(questionId)) {
        newSet.delete(questionId)
      } else {
        newSet.add(questionId)
      }
      return newSet
    })
  }

  const selectAllHighlights = () => {
    setSelectedHighlights(new Set(previewHighlights.map(h => h.id)))
  }

  const selectAllQuestions = () => {
    setSelectedQuestions(new Set(generatedQuestions.map(q => q.id)))
  }

  const saveSelected = async () => {
    try {
      const token = localStorage.getItem('token')

      const selectedHighlightsList = previewHighlights.filter(h =>
        selectedHighlights.has(h.id)
      )
      const selectedQuestionsList = generatedQuestions.filter(q =>
        selectedQuestions.has(q.id)
      )

      await axios.post(
        `${API_URL}/annotations/save-preview`,
        {
          notebook_id: notebookId,
          document_id: selectedDoc.id,
          highlights: selectedHighlightsList,
          questions: selectedQuestionsList
        },
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      )

      alert(`Saved ${selectedHighlightsList.length} highlights and ${selectedQuestionsList.length} questions!`)

      // Clear selections and preview
      setSelectedHighlights(new Set())
      setSelectedQuestions(new Set())
      setPreviewHighlights([])
      setGeneratedQuestions([])

      // Switch to annotations tab to see saved highlights
      if (onSwitchToAnnotations) {
        setTimeout(() => onSwitchToAnnotations(), 500)
      }

    } catch (err) {
      console.error('Error saving:', err)
      alert('Failed to save selections')
    }
  }

  const groupQuestionsByTopic = () => {
    const grouped = {}

    generatedQuestions.forEach(q => {
      const topic = q.topic || 'General'
      if (!grouped[topic]) {
        grouped[topic] = {
          '2-marks': [],
          '5-marks': [],
          '10-marks': []
        }
      }
      if (grouped[topic][q.type]) {
        grouped[topic][q.type].push(q)
      }
    })

    return grouped
  }

  const groupHighlightsByTopic = () => {
    const grouped = {}

    previewHighlights.forEach(h => {
      const topic = h.topic || 'General'
      if (!grouped[topic]) {
        grouped[topic] = []
      }
      grouped[topic].push(h)
    })

    return grouped
  }

  const questionsByTopic = groupQuestionsByTopic()
  const highlightsByTopic = groupHighlightsByTopic()

  return (
    <div className="pdf-analyzer">
      {/* Analysis Controls */}
      <div className="analyzer-controls-wrapper">
        <div className="analyzer-controls">
        <h3>AI Document Analysis</h3>

        {/* Mode Selection */}
        <div className="mode-selection">
          <button
            className={`mode-btn ${analysisMode === 'auto' ? 'active' : ''}`}
            onClick={() => setAnalysisMode('auto')}
          >
            <FiZap /> Auto Highlight
          </button>
          <button
            className={`mode-btn ${analysisMode === 'custom' ? 'active' : ''}`}
            onClick={() => setAnalysisMode('custom')}
          >
            <FiEdit3 /> Custom Prompt
          </button>
        </div>

        {/* Custom Prompt Input */}
        {analysisMode === 'custom' && (
          <div className="custom-prompt">
            <label>What would you like to highlight?</label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="E.g., 'Highlight all mathematical formulas and theorems' or 'Find all key dates and historical events'"
              rows={3}
            />
          </div>
        )}

        {/* Question Type Selection */}
        <div className="question-types">
          <label>Generate Questions:</label>
          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={questionTypes['2-marks']}
                onChange={() => toggleQuestionType('2-marks')}
              />
              2-Marks
            </label>
            <label>
              <input
                type="checkbox"
                checked={questionTypes['5-marks']}
                onChange={() => toggleQuestionType('5-marks')}
              />
              5-Marks
            </label>
            <label>
              <input
                type="checkbox"
                checked={questionTypes['10-marks']}
                onChange={() => toggleQuestionType('10-marks')}
              />
              10-Marks
            </label>
          </div>
        </div>

        {/* Analyze Button */}
        <button
          className="analyze-btn"
          onClick={analyzeDocument}
          disabled={isAnalyzing || !selectedDoc}
        >
          {isAnalyzing ? (
            <>
              <FiLoader className="spin" /> Analyzing...
            </>
          ) : (
            <>
              <FiZap /> Analyze Document
            </>
          )}
        </button>

        {/* Progress Bar */}
        {isAnalyzing && (
          <div className="progress-bar">
            <div className="progress-text">
              Page {progress.current} of {progress.total}
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <FiX /> {error}
          </div>
        )}
        </div>
      </div>

      {/* Results Panel - Organized by Topic */}
      {(previewHighlights.length > 0 || generatedQuestions.length > 0) && (
        <div className="results-panel">
          {Object.entries(questionsByTopic).map(([topic, questionTypes]) => {
            const topicHighlights = highlightsByTopic[topic] || []
            const has2Marks = questionTypes['2-marks'].length > 0
            const has5Marks = questionTypes['5-marks'].length > 0
            const has10Marks = questionTypes['10-marks'].length > 0

            return (
              <div key={topic} className="topic-section">
                <div
                  className="topic-header"
                  onClick={() => toggleSection(topic)}
                >
                  <h3>
                    📚 {topic}
                  </h3>
                  <span className="topic-stats">
                    {topicHighlights.length} highlights • {questionTypes['2-marks'].length + questionTypes['5-marks'].length + questionTypes['10-marks'].length} questions
                  </span>
                  {expandedSections[topic] ? <FiChevronUp /> : <FiChevronDown />}
                </div>

                {expandedSections[topic] && (
                  <div className="topic-content">
                    {/* Highlights for this topic */}
                    {topicHighlights.length > 0 && (
                      <div className="topic-highlights">
                        <h4>Key Points</h4>
                        <div className="highlights-list">
                          {topicHighlights.map(h => (
                            <div
                              key={h.id}
                              className={`highlight-item ${selectedHighlights.has(h.id) ? 'selected' : ''}`}
                              onClick={() => toggleHighlightSelection(h.id)}
                            >
                              <div className="highlight-check">
                                {selectedHighlights.has(h.id) ? <FiCheck /> : <div className="empty-check" />}
                              </div>
                              <div className="highlight-content">
                                <div
                                  className="highlight-color-indicator"
                                  style={{ backgroundColor: h.color }}
                                />
                                <div className="highlight-text">"{h.text}"</div>
                                <div className="highlight-reason">{h.reason}</div>
                                <button
                                  className="goto-page-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (onNavigateToPage) onNavigateToPage(h.page)
                                  }}
                                >
                                  <FiArrowRight /> Page {h.page}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Questions for this topic */}
                    <div className="topic-questions">
                      {has2Marks && (
                        <div className="question-type-group">
                          <h5>2-Mark Questions</h5>
                          {questionTypes['2-marks'].map(q => (
                            <div
                              key={q.id}
                              className={`question-item ${selectedQuestions.has(q.id) ? 'selected' : ''}`}
                              onClick={() => toggleQuestionSelection(q.id)}
                            >
                              <div className="question-check">
                                {selectedQuestions.has(q.id) ? <FiCheck /> : <div className="empty-check" />}
                              </div>
                              <div className="question-content">
                                <div className="question-text"><strong>Q:</strong> {q.question}</div>
                                <div className="question-answer"><strong>A:</strong> {q.answer}</div>
                                <button
                                  className="goto-page-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (onNavigateToPage) onNavigateToPage(q.page)
                                  }}
                                >
                                  <FiArrowRight /> Page {q.page}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {has5Marks && (
                        <div className="question-type-group">
                          <h5>5-Mark Questions</h5>
                          {questionTypes['5-marks'].map(q => (
                            <div
                              key={q.id}
                              className={`question-item ${selectedQuestions.has(q.id) ? 'selected' : ''}`}
                              onClick={() => toggleQuestionSelection(q.id)}
                            >
                              <div className="question-check">
                                {selectedQuestions.has(q.id) ? <FiCheck /> : <div className="empty-check" />}
                              </div>
                              <div className="question-content">
                                <div className="question-text"><strong>Q:</strong> {q.question}</div>
                                <div className="question-answer"><strong>A:</strong> {q.answer}</div>
                                <button
                                  className="goto-page-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (onNavigateToPage) onNavigateToPage(q.page)
                                  }}
                                >
                                  <FiArrowRight /> Page {q.page}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {has10Marks && (
                        <div className="question-type-group">
                          <h5>10-Mark Questions</h5>
                          {questionTypes['10-marks'].map(q => (
                            <div
                              key={q.id}
                              className={`question-item ${selectedQuestions.has(q.id) ? 'selected' : ''}`}
                              onClick={() => toggleQuestionSelection(q.id)}
                            >
                              <div className="question-check">
                                {selectedQuestions.has(q.id) ? <FiCheck /> : <div className="empty-check" />}
                              </div>
                              <div className="question-content">
                                <div className="question-text"><strong>Q:</strong> {q.question}</div>
                                <div className="question-answer"><strong>A:</strong> {q.answer}</div>
                                <button
                                  className="goto-page-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (onNavigateToPage) onNavigateToPage(q.page)
                                  }}
                                >
                                  <FiArrowRight /> Page {q.page}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Action Buttons */}
          <div className="action-buttons">
            <button className="select-all-btn" onClick={selectAllHighlights}>
              Select All Highlights
            </button>
            <button className="select-all-btn" onClick={selectAllQuestions}>
              Select All Questions
            </button>
            <button
              className="save-btn"
              onClick={saveSelected}
              disabled={selectedHighlights.size === 0 && selectedQuestions.size === 0}
            >
              <FiSave /> Save Selected ({selectedHighlights.size} highlights, {selectedQuestions.size} questions)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PDFAnalyzer
