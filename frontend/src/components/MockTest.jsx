import { useState, useEffect } from 'react'
import { FiLoader, FiCheckCircle, FiCode, FiFileText, FiList, FiRefreshCw } from 'react-icons/fi'
import axios from 'axios'
import ReactMarkdown from 'react-markdown';
import { API_URL } from '../config'

function MockTest({ documents, selectedDocIds, notebookId }) {
  const [testState, setTestState] = useState('idle') // idle, loading, taking, results
  const [test, setTest] = useState(null)
  const [theoryAnswers, setTheoryAnswers] = useState([])
  const [codingAnswers, setCodingAnswers] = useState([])
  const [reorderAnswers, setReorderAnswers] = useState([])
  const [results, setResults] = useState(null)

  // Configuration
  const [numTheory, setNumTheory] = useState(3)
  const [numCoding, setNumCoding] = useState(2)
  const [numReorder, setNumReorder] = useState(2)
  const [difficulty, setDifficulty] = useState('medium')
  const [programmingLanguage, setProgrammingLanguage] = useState('python')
  const [useReadProgress, setUseReadProgress] = useState(false) // Limit to read pages (default: disabled)
  const [readingProgress, setReadingProgress] = useState({})

  // Drag state
  const [draggedItem, setDraggedItem] = useState(null)
  const [draggedIndex, setDraggedIndex] = useState(null)

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

  const generateTest = async () => {
    if (documents.length === 0) {
      alert('Please upload documents first')
      return
    }

    // Collect completed pages if useReadProgress is enabled
    let pageNumbers = null
    if (useReadProgress && Object.keys(readingProgress).length > 0) {
      pageNumbers = Object.values(readingProgress).flat()

      if (pageNumbers.length === 0) {
        alert('You haven\'t read any pages yet. Disable "Limit to pages I\'ve read" or read some content first.')
        return
      }
    }

    setTestState('loading')
    try {
      const requestData = {
        notebook_id: notebookId,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        num_theory: numTheory,
        num_coding: numCoding,
        num_reorder: numReorder,
        difficulty: difficulty,
        programming_language: programmingLanguage
      }

      // Add page_numbers if limiting to read pages
      if (pageNumbers && pageNumbers.length > 0) {
        requestData.page_numbers = pageNumbers
      }

      const response = await axios.post(`${API_URL}/generate-mock-test`, requestData)

      setTest(response.data)

      // Initialize answer arrays
      setTheoryAnswers(new Array(response.data.theory_questions.length).fill(''))
      setCodingAnswers(
        response.data.coding_questions.map(q => ({
          code: q.function_signature || '',
          language: q.language || 'python'
        }))
      )
      setReorderAnswers(
        response.data.reorder_questions.map(q => [...q.items])
      )

      setTestState('taking')
    } catch (error) {
      console.error('Error generating test:', error)
      alert('Error generating mock test. Please try again.')
      setTestState('idle')
    }
  }

  const submitTest = async () => {
    setTestState('loading')
    try {
      console.log('Submitting test with ID:', test.test_id)
      console.log('Theory answers:', theoryAnswers.length)
      console.log('Coding answers:', codingAnswers.length)
      console.log('Reorder answers:', reorderAnswers.length)

      const response = await axios.post(`${API_URL}/submit-mock-test`, {
        test_id: test.test_id,
        theory_answers: theoryAnswers.map((answer, index) => ({
          question_index: index,
          answer_text: answer || ''  // Ensure not undefined
        })),
        coding_answers: codingAnswers.map((answer, index) => ({
          question_index: index,
          code: answer?.code || '',
          language: answer?.language || 'python'
        })),
        reorder_answers: reorderAnswers.map((answer, index) => ({
          question_index: index,
          ordered_items: answer || []
        }))
      })

      console.log('Test submitted successfully')
      setResults(response.data)
      setTestState('results')
    } catch (error) {
      console.error('Error submitting test:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error occurred'
      alert(`Error submitting test: ${errorMessage}\n\nPlease check the console for more details.`)
      setTestState('taking')
    }
  }

  const resetTest = () => {
    setTestState('idle')
    setTest(null)
    setTheoryAnswers([])
    setCodingAnswers([])
    setReorderAnswers([])
    setResults(null)
  }

  // Drag and drop handlers
  const handleDragStart = (questionIndex, itemIndex, item) => {
    setDraggedItem(item)
    setDraggedIndex(itemIndex)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (questionIndex, dropIndex) => {
    if (draggedItem === null || draggedIndex === null) return

    const newOrder = [...reorderAnswers[questionIndex]]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(dropIndex, 0, draggedItem)

    const newReorderAnswers = [...reorderAnswers]
    newReorderAnswers[questionIndex] = newOrder
    setReorderAnswers(newReorderAnswers)

    setDraggedItem(null)
    setDraggedIndex(null)
  }

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981'
    if (score >= 60) return '#f59e0b'
    return '#ef4444'
  }

  if (testState === 'idle') {
    return (
      <div className="mock-test-container">
        <div className="mock-test-setup">
          <div className="mock-test-header">
            <FiFileText size={48} style={{ color: 'var(--primary)' }} />
            <h2>Generate Mock Test</h2>
            <p>Comprehensive test with theory, coding, and reordering questions</p>
          </div>

          <div className="mock-test-config">
            <div className="config-group">
              <label>Theory Questions (Written Answers)</label>
              <select
                value={numTheory}
                onChange={(e) => setNumTheory(Number(e.target.value))}
                className="mock-select"
              >
                <option value={2}>2 Questions</option>
                <option value={3}>3 Questions</option>
                <option value={5}>5 Questions</option>
              </select>
            </div>

            <div className="config-group">
              <label>Coding Questions (If Applicable)</label>
              <select
                value={numCoding}
                onChange={(e) => setNumCoding(Number(e.target.value))}
                className="mock-select"
              >
                <option value={0}>0 Questions</option>
                <option value={1}>1 Question</option>
                <option value={2}>2 Questions</option>
                <option value={3}>3 Questions</option>
              </select>
            </div>

            <div className="config-group">
              <label>Programming Language</label>
              <select
                value={programmingLanguage}
                onChange={(e) => setProgrammingLanguage(e.target.value)}
                className="mock-select"
                disabled={numCoding === 0}
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="c">C</option>
                <option value="go">Go</option>
                <option value="rust">Rust</option>
              </select>
            </div>

            <div className="config-group">
              <label>Reordering Questions</label>
              <select
                value={numReorder}
                onChange={(e) => setNumReorder(Number(e.target.value))}
                className="mock-select"
              >
                <option value={1}>1 Question</option>
                <option value={2}>2 Questions</option>
                <option value={3}>3 Questions</option>
              </select>
            </div>

            <div className="config-group">
              <label>Difficulty Level</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mock-select"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="mixed">Mixed (Easy, Medium & Hard)</option>
              </select>
            </div>

            <div className="config-group" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
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
          </div>

          {selectedDocIds.length > 0 && (
            <div className="mock-info">
              Generating from {selectedDocIds.length} selected document(s)
            </div>
          )}

          <button
            className="generate-mock-button"
            onClick={generateTest}
            disabled={documents.length === 0}
          >
            <FiFileText />
            Generate Mock Test
          </button>
        </div>
      </div>
    )
  }

  if (testState === 'loading') {
    return (
      <div className="mock-test-container">
        <div className="mock-loading">
          <FiLoader className="spinner" size={48} />
          <p>{results ? 'Evaluating your answers...' : 'Generating your test...'}</p>
        </div>
      </div>
    )
  }

  if (testState === 'taking' && test) {
    return (
      <div className="mock-test-container">
        <div className="mock-test-content">
          <h2 className="mock-title">Mock Test</h2>
          <p className="mock-subtitle">
            Answer all questions to the best of your ability
          </p>

          {/* Theory Questions */}
          {test.theory_questions.length > 0 && (
            <div className="question-section">
              <div className="section-header">
                <FiFileText />
                <h3>Theory Questions</h3>
              </div>

              {test.theory_questions.map((question, index) => (
                <div key={index} className="test-question">
                  <div className="question-header">
                    <span className="question-number">Question {index + 1}</span>
                    <span className="question-topic">{question.topic}</span>
                    {question.difficulty && (
                      <span
                        className={`difficulty-badge ${question.difficulty.toLowerCase()}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          backgroundColor:
                            question.difficulty.toLowerCase() === 'easy' ? '#10b981' :
                            question.difficulty.toLowerCase() === 'medium' ? '#f59e0b' :
                            '#ef4444',
                          color: 'white'
                        }}
                      >
                        {question.difficulty}
                      </span>
                    )}
                  </div>
                  <p className="question-text">{question.question}</p>
                  <textarea
                    className="theory-answer"
                    value={theoryAnswers[index]}
                    onChange={(e) => {
                      const newAnswers = [...theoryAnswers]
                      newAnswers[index] = e.target.value
                      setTheoryAnswers(newAnswers)
                    }}
                    placeholder="Type your answer here..."
                    rows={6}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Coding Questions */}
          {test.coding_questions.length > 0 && (
            <div className="question-section">
              <div className="section-header">
                <FiCode />
                <h3>Coding Questions</h3>
              </div>

              {test.coding_questions.map((question, index) => (
                <div key={index} className="test-question">
                  <div className="question-header">
                    <span className="question-number">Coding {index + 1}</span>
                    <span className="question-topic">{question.topic}</span>
                    {question.difficulty && (
                      <span
                        className={`difficulty-badge ${question.difficulty.toLowerCase()}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          backgroundColor:
                            question.difficulty.toLowerCase() === 'easy' ? '#10b981' :
                            question.difficulty.toLowerCase() === 'medium' ? '#f59e0b' :
                            '#ef4444',
                          color: 'white'
                        }}
                      >
                        {question.difficulty}
                      </span>
                    )}
                  </div>
                  <p className="question-text">{question.question}</p>

                  {question.test_cases && question.test_cases.length > 0 && (
                    <div className="test-cases">
                      <strong>Test Cases:</strong>
                      {question.test_cases.map((tc, i) => (
                        <div key={i} className="test-case">
                          Input: <code>{tc.input}</code>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="code-editor">
                    <div className="code-editor-header">
                      <span>{question.language || 'python'}</span>
                    </div>
                    <textarea
                      className="code-input"
                      value={codingAnswers[index]?.code}
                      onChange={(e) => {
                        const newAnswers = [...codingAnswers]
                        newAnswers[index] = {
                          ...newAnswers[index],
                          code: e.target.value
                        }
                        setCodingAnswers(newAnswers)
                      }}
                      placeholder="// Write your solution here..."
                      rows={12}
                      spellCheck={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reordering Questions */}
          {test.reorder_questions.length > 0 && (
            <div className="question-section">
              <div className="section-header">
                <FiList />
                <h3>Reordering Questions</h3>
              </div>

              {test.reorder_questions.map((question, qIndex) => (
                <div key={qIndex} className="test-question">
                  <div className="question-header">
                    <span className="question-number">Reorder {qIndex + 1}</span>
                    <span className="question-topic">{question.topic}</span>
                    {question.difficulty && (
                      <span
                        className={`difficulty-badge ${question.difficulty.toLowerCase()}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          backgroundColor:
                            question.difficulty.toLowerCase() === 'easy' ? '#10b981' :
                            question.difficulty.toLowerCase() === 'medium' ? '#f59e0b' :
                            '#ef4444',
                          color: 'white'
                        }}
                      >
                        {question.difficulty}
                      </span>
                    )}
                  </div>
                  <p className="question-text">{question.question}</p>
                  <p className="reorder-instruction">Drag and drop to reorder</p>

                  <div className="reorder-list">
                    {reorderAnswers[qIndex]?.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="reorder-item"
                        draggable
                        onDragStart={() => handleDragStart(qIndex, itemIndex, item)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(qIndex, itemIndex)}
                      >
                        <span className="reorder-number">{itemIndex + 1}</span>
                        <span className="reorder-text">{item}</span>
                        <span className="drag-handle">⋮⋮</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="submit-mock-button" onClick={submitTest}>
            <FiCheckCircle />
            Submit Test
          </button>
        </div>
      </div>
    )
  }

  if (testState === 'results' && results) {
    return (
      <div className="mock-test-container">
        <div className="mock-results">
          <div className="results-header">
            <div
              className="results-score-circle"
              style={{ borderColor: getScoreColor(results.overall_score) }}
            >
              <div
                className="results-score-text"
                style={{ color: getScoreColor(results.overall_score) }}
              >
                {results.overall_score.toFixed(0)}%
              </div>
              <div className="results-score-label">Overall Score</div>
            </div>

            <h2>Mock Test Results</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px', fontStyle: 'italic' }}>
              Weighted scoring: Hard questions contribute 2x, Medium 1.5x, Easy 1x to your final score
            </p>
          </div>

          <div className="results-analysis">
            <h3>Overall Analysis</h3>
            <div className="analysis-text"><ReactMarkdown>{results.overall_analysis}</ReactMarkdown></div>
          </div>

          {/* Theory Results */}
          {results.theory_results.length > 0 && (
            <div className="results-section">
              <h3><FiFileText /> Theory Questions</h3>
              {results.theory_results.map((result, index) => (
                <div key={index} className="result-card">
                  <div className="result-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Question {index + 1}</span>
                      {result.difficulty && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            backgroundColor:
                              result.difficulty.toLowerCase() === 'easy' ? '#10b981' :
                              result.difficulty.toLowerCase() === 'medium' ? '#f59e0b' :
                              '#ef4444',
                            color: 'white'
                          }}
                        >
                          {result.difficulty}
                        </span>
                      )}
                    </div>
                    <span
                      className="result-score"
                      style={{ color: getScoreColor(result.score) }}
                    >
                      {result.score.toFixed(0)}%
                    </span>
                  </div>
                  <p className="result-question">{result.question}</p>

                  <div className="result-answer-box">
                    <strong>Your Answer:</strong>
                    <p>{result.user_answer}</p>
                  </div>

                  <div className="result-feedback">
                    <strong>Feedback:</strong>
                    <p>{result.feedback}</p>
                  </div>

                  {result.covered_points.length > 0 && (
                    <div className="result-points covered">
                      <strong>Points Covered:</strong>
                      <ul>
                        {result.covered_points.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.missing_points.length > 0 && (
                    <div className="result-points missing">
                      <strong>Points Missed:</strong>
                      <ul>
                        {result.missing_points.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Coding Results */}
          {results.coding_results.length > 0 && (
            <div className="results-section">
              <h3><FiCode /> Coding Questions</h3>
              {results.coding_results.map((result, index) => (
                <div key={index} className="result-card">
                  <div className="result-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Coding {index + 1}</span>
                      {result.difficulty && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            backgroundColor:
                              result.difficulty.toLowerCase() === 'easy' ? '#10b981' :
                              result.difficulty.toLowerCase() === 'medium' ? '#f59e0b' :
                              '#ef4444',
                            color: 'white'
                          }}
                        >
                          {result.difficulty}
                        </span>
                      )}
                    </div>
                    <span
                      className="result-score"
                      style={{ color: getScoreColor(result.score) }}
                    >
                      {result.score.toFixed(0)}%
                    </span>
                  </div>
                  <p className="result-question">{result.question}</p>

                  <div className="result-code-box">
                    <strong>Your Solution:</strong>
                    <pre><code>{result.user_code}</code></pre>
                  </div>

                  <div className="result-feedback">
                    <strong>Correctness:</strong>
                    <p>{result.correctness}</p>
                  </div>

                  <div className="result-feedback">
                    <strong>Code Quality:</strong>
                    <p>{result.code_quality}</p>
                  </div>

                  <div className="result-feedback">
                    <strong>Overall Feedback:</strong>
                    <p>{result.feedback}</p>
                  </div>

                  {result.suggestions.length > 0 && (
                    <div className="result-suggestions">
                      <strong>Suggestions for Improvement:</strong>
                      <ul>
                        {result.suggestions.map((suggestion, i) => (
                          <li key={i}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reorder Results */}
          {results.reorder_results.length > 0 && (
            <div className="results-section">
              <h3><FiList /> Reordering Questions</h3>
              {results.reorder_results.map((result, index) => (
                <div key={index} className="result-card">
                  <div className="result-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Reorder {index + 1}</span>
                      {result.difficulty && (
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            backgroundColor:
                              result.difficulty.toLowerCase() === 'easy' ? '#10b981' :
                              result.difficulty.toLowerCase() === 'medium' ? '#f59e0b' :
                              '#ef4444',
                            color: 'white'
                          }}
                        >
                          {result.difficulty}
                        </span>
                      )}
                    </div>
                    <span
                      className="result-score"
                      style={{ color: getScoreColor(result.score) }}
                    >
                      {result.correct_positions}/{result.total_items} correct
                    </span>
                  </div>
                  <p className="result-question">{result.question}</p>

                  <div className="reorder-comparison">
                    <div className="order-column">
                      <strong>Your Order:</strong>
                      <ol>
                        {result.user_order.map((item, i) => (
                          <li
                            key={i}
                            className={item === result.correct_order[i] ? 'correct-item' : 'incorrect-item'}
                          >
                            {item}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="order-column">
                      <strong>Correct Order:</strong>
                      <ol>
                        {result.correct_order.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="retry-mock-button" onClick={resetTest}>
            <FiRefreshCw />
            Generate New Test
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default MockTest
