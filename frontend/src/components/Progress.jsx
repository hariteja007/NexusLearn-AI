import { useState, useEffect } from 'react'
import { FiAward, FiTrendingUp, FiBarChart2, FiCheckCircle, FiClock, FiStar, FiTarget, FiBook, FiBookmark } from 'react-icons/fi'
import axios from 'axios'
import LoadingSpinner from './LoadingSpinner'
import { API_URL } from '../config'

function Progress({ notebookId }) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'quizzes', 'tests', 'interviews', 'reading'
  const [quizHistory, setQuizHistory] = useState([])
  const [testHistory, setTestHistory] = useState([])
  const [interviewHistory, setInterviewHistory] = useState([])
  const [readingProgressData, setReadingProgressData] = useState([])
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    avgQuizScore: 0,
    totalTests: 0,
    avgTestScore: 0,
    totalInterviews: 0,
    avgInterviewScore: 0,
    totalDocuments: 0,
    documentsWithProgress: 0,
    avgCompletion: 0
  })

  useEffect(() => {
    if (notebookId) {
      fetchAllHistory()
    }
  }, [notebookId])

  const fetchAllHistory = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      // Fetch all histories in parallel
      const [quizRes, testRes, interviewRes, readingRes] = await Promise.all([
        axios.get(`${API_URL}/quiz-history/${notebookId}`, { headers }),
        axios.get(`${API_URL}/mock-test-history/${notebookId}`, { headers }),
        axios.get(`${API_URL}/interview-history/${notebookId}`, { headers }),
        axios.get(`${API_URL}/reading-progress/all/${notebookId}`, { headers })
      ])

      const quizData = quizRes.data.quiz_history || []
      const testData = testRes.data.test_history || []
      const interviewData = interviewRes.data.interview_history || []
      const readingData = readingRes.data.progress || {}

      console.log('Reading data received:', readingData)

      // Convert progress map to array
      const readingArray = Object.values(readingData)

      console.log('Reading array:', readingArray)

      setQuizHistory(quizData)
      setTestHistory(testData)
      setInterviewHistory(interviewData)
      setReadingProgressData(readingArray)

      // Calculate stats
      const avgQuiz = quizData.length > 0
        ? quizData.reduce((sum, q) => sum + q.score_percentage, 0) / quizData.length
        : 0

      const avgTest = testData.length > 0
        ? testData.reduce((sum, t) => sum + t.overall_score, 0) / testData.length
        : 0

      const avgInterview = interviewData.length > 0
        ? interviewData.reduce((sum, i) => sum + (i.score?.overall_score || 0), 0) / interviewData.length
        : 0

      // Calculate reading stats
      const documentsWithProgress = readingArray.filter(p => p.completion_percentage > 0).length
      const avgCompletion = readingArray.length > 0
        ? readingArray.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / readingArray.length
        : 0

      const statsData = {
        totalQuizzes: quizData.length,
        avgQuizScore: avgQuiz,
        totalTests: testData.length,
        avgTestScore: avgTest,
        totalInterviews: interviewData.length,
        avgInterviewScore: avgInterview,
        totalDocuments: readingArray.length,
        documentsWithProgress: documentsWithProgress,
        avgCompletion: avgCompletion
      }

      console.log('Calculated stats:', statsData)

      setStats(statsData)

    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981'
    if (score >= 60) return '#f59e0b'
    return '#ef4444'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="progress-container">
      <style>{`
        .progress-container {
          padding: 24px;
          height: 100%;
          overflow-y: auto;
          background: var(--bg-primary);
        }

        .progress-header {
          margin-bottom: 32px;
        }

        .progress-header h2 {
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .progress-header p {
          color: var(--text-secondary);
          margin: 0;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid var(--border-color);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .stat-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .stat-icon.quiz {
          background: rgba(99, 102, 241, 0.1);
          color: #6366f1;
        }

        .stat-icon.test {
          background: rgba(168, 85, 247, 0.1);
          color: #a855f7;
        }

        .stat-icon.interview {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .stat-icon.reading {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .stat-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .stat-subvalue {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .tabs-container {
          margin-bottom: 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .tabs {
          display: flex;
          gap: 8px;
        }

        .tab {
          padding: 12px 20px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .tab:hover {
          color: var(--text-primary);
        }

        .tab.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }

        .history-section {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 24px;
          border: 1px solid var(--border-color);
        }

        .history-empty {
          text-align: center;
          padding: 48px 20px;
          color: var(--text-secondary);
        }

        .history-empty svg {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .history-item {
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
          transition: background 0.2s;
        }

        .history-item:last-child {
          border-bottom: none;
        }

        .history-item:hover {
          background: var(--bg-primary);
          border-radius: 8px;
        }

        .history-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .history-item-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .history-item-date {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .history-item-stats {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
        }

        .history-stat {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .history-stat-label {
          color: var(--text-secondary);
        }

        .history-stat-value {
          font-weight: 600;
          color: var(--text-primary);
        }

        .score-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
        }

        .topic-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .topic-chip {
          padding: 4px 10px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .overview-grid {
          display: grid;
          gap: 24px;
        }

        .recent-activity {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 24px;
          border: 1px solid var(--border-color);
        }

        .recent-activity h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 20px 0;
          color: var(--text-primary);
        }

        .activity-item {
          padding: 12px;
          margin-bottom: 8px;
          background: var(--bg-primary);
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .activity-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .activity-icon {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .activity-details h4 {
          font-size: 13px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--text-primary);
        }

        .activity-details p {
          font-size: 12px;
          margin: 0;
          color: var(--text-secondary);
        }

        .no-data-message {
          text-align: center;
          padding: 80px 20px;
          color: var(--text-secondary);
        }

        .no-data-message svg {
          font-size: 64px;
          margin-bottom: 20px;
          opacity: 0.3;
        }

        .no-data-message h3 {
          font-size: 20px;
          margin: 0 0 8px 0;
          color: var(--text-primary);
        }

        .no-data-message p {
          margin: 0;
          font-size: 14px;
        }
      `}</style>

      <div className="progress-header">
        <h2>📊 Your Progress</h2>
        <p>Track your learning journey and performance metrics</p>
      </div>

      {stats.totalQuizzes === 0 && stats.totalTests === 0 && stats.totalInterviews === 0 && stats.totalDocuments === 0 ? (
        <div className="no-data-message">
          <FiBarChart2 />
          <h3>No Activity Yet</h3>
          <p>Complete quizzes, mock tests, or interviews to see your progress here</p>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-icon quiz">
                  <FiAward />
                </div>
                <span className="stat-label">Quizzes</span>
              </div>
              <div className="stat-value">{stats.totalQuizzes}</div>
              <div className="stat-subvalue">
                Avg Score: {stats.avgQuizScore.toFixed(1)}%
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-icon test">
                  <FiTarget />
                </div>
                <span className="stat-label">Mock Tests</span>
              </div>
              <div className="stat-value">{stats.totalTests}</div>
              <div className="stat-subvalue">
                Avg Score: {stats.avgTestScore.toFixed(1)}%
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-icon interview">
                  <FiStar />
                </div>
                <span className="stat-label">Interviews</span>
              </div>
              <div className="stat-value">{stats.totalInterviews}</div>
              <div className="stat-subvalue">
                Avg Score: {stats.avgInterviewScore.toFixed(1)}%
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-icon reading">
                  <FiBook />
                </div>
                <span className="stat-label">Reading Progress</span>
              </div>
              <div className="stat-value">{stats.documentsWithProgress}/{stats.totalDocuments}</div>
              <div className="stat-subvalue">
                Avg Completion: {stats.avgCompletion.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="tabs-container">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                className={`tab ${activeTab === 'quizzes' ? 'active' : ''}`}
                onClick={() => setActiveTab('quizzes')}
              >
                Quizzes ({stats.totalQuizzes})
              </button>
              <button
                className={`tab ${activeTab === 'tests' ? 'active' : ''}`}
                onClick={() => setActiveTab('tests')}
              >
                Mock Tests ({stats.totalTests})
              </button>
              <button
                className={`tab ${activeTab === 'interviews' ? 'active' : ''}`}
                onClick={() => setActiveTab('interviews')}
              >
                Interviews ({stats.totalInterviews})
              </button>
              <button
                className={`tab ${activeTab === 'reading' ? 'active' : ''}`}
                onClick={() => setActiveTab('reading')}
              >
                Reading ({stats.documentsWithProgress})
              </button>
            </div>
          </div>

          {activeTab === 'overview' && (
            <div className="overview-grid">
              <div className="recent-activity">
                <h3>Recent Activity</h3>
                {[...quizHistory.slice(0, 3).map(q => ({ ...q, type: 'quiz' })),
                  ...testHistory.slice(0, 3).map(t => ({ ...t, type: 'test' })),
                  ...interviewHistory.slice(0, 3).map(i => ({ ...i, type: 'interview' }))]
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                  .slice(0, 10)
                  .map((item, idx) => (
                    <div key={idx} className="activity-item">
                      <div className="activity-info">
                        <div className={`activity-icon ${item.type}`}>
                          {item.type === 'quiz' ? <FiAward /> : item.type === 'test' ? <FiTarget /> : <FiStar />}
                        </div>
                        <div className="activity-details">
                          <h4>
                            {item.type === 'quiz' ? `Quiz: ${item.total_questions} questions` :
                             item.type === 'test' ? `Mock Test: ${item.total_questions} questions` :
                             `Interview: ${item.interview_type}`}
                          </h4>
                          <p>{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                      <span
                        className="score-badge"
                        style={{
                          background: `${getScoreColor(item.score_percentage || item.overall_score || item.score?.overall_score || 0)}20`,
                          color: getScoreColor(item.score_percentage || item.overall_score || item.score?.overall_score || 0)
                        }}
                      >
                        {(item.score_percentage || item.overall_score || item.score?.overall_score || 0).toFixed(0)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'quizzes' && (
            <div className="history-section">
              {quizHistory.length === 0 ? (
                <div className="history-empty">
                  <FiAward />
                  <p>No quiz history yet</p>
                </div>
              ) : (
                quizHistory.map((quiz, idx) => (
                  <div key={idx} className="history-item">
                    <div className="history-item-header">
                      <div className="history-item-title">
                        Quiz #{quizHistory.length - idx}
                      </div>
                      <div className="history-item-date">
                        {formatDate(quiz.created_at)}
                      </div>
                    </div>
                    <div className="history-item-stats">
                      <div className="history-stat">
                        <FiCheckCircle style={{ color: getScoreColor(quiz.score_percentage) }} />
                        <span className="history-stat-label">Score:</span>
                        <span
                          className="history-stat-value"
                          style={{ color: getScoreColor(quiz.score_percentage) }}
                        >
                          {quiz.score}/{quiz.total_questions} ({quiz.score_percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="history-stat">
                        <FiTarget />
                        <span className="history-stat-label">Difficulty:</span>
                        <span className="history-stat-value">{quiz.difficulty}</span>
                      </div>
                      <div className="history-stat">
                        <FiTrendingUp />
                        <span className="history-stat-label">Topics:</span>
                        <span className="history-stat-value">
                          {Object.keys(quiz.topic_performance || {}).length}
                        </span>
                      </div>
                    </div>
                    {quiz.weak_topics && quiz.weak_topics.length > 0 && (
                      <div className="topic-chips">
                        {quiz.weak_topics.map((topic, i) => (
                          <span key={i} className="topic-chip" style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                            ⚠️ {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="history-section">
              {testHistory.length === 0 ? (
                <div className="history-empty">
                  <FiTarget />
                  <p>No mock test history yet</p>
                </div>
              ) : (
                testHistory.map((test, idx) => (
                  <div key={idx} className="history-item">
                    <div className="history-item-header">
                      <div className="history-item-title">
                        Mock Test #{testHistory.length - idx}
                      </div>
                      <div className="history-item-date">
                        {formatDate(test.created_at)}
                      </div>
                    </div>
                    <div className="history-item-stats">
                      <div className="history-stat">
                        <FiCheckCircle style={{ color: getScoreColor(test.overall_score) }} />
                        <span className="history-stat-label">Overall:</span>
                        <span
                          className="history-stat-value"
                          style={{ color: getScoreColor(test.overall_score) }}
                        >
                          {test.overall_score.toFixed(1)}%
                        </span>
                      </div>
                      <div className="history-stat">
                        <span className="history-stat-label">Theory:</span>
                        <span className="history-stat-value">{test.theory_avg.toFixed(1)}%</span>
                      </div>
                      {test.coding_avg > 0 && (
                        <div className="history-stat">
                          <span className="history-stat-label">Coding:</span>
                          <span className="history-stat-value">{test.coding_avg.toFixed(1)}%</span>
                        </div>
                      )}
                      <div className="history-stat">
                        <span className="history-stat-label">Reorder:</span>
                        <span className="history-stat-value">{test.reorder_avg.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'interviews' && (
            <div className="history-section">
              {interviewHistory.length === 0 ? (
                <div className="history-empty">
                  <FiStar />
                  <p>No interview history yet</p>
                </div>
              ) : (
                interviewHistory.map((interview, idx) => (
                  <div key={idx} className="history-item">
                    <div className="history-item-header">
                      <div className="history-item-title">
                        {interview.interview_type} Interview
                      </div>
                      <div className="history-item-date">
                        {formatDate(interview.created_at)}
                      </div>
                    </div>
                    {interview.score && (
                      <div className="history-item-stats">
                        <div className="history-stat">
                          <FiCheckCircle style={{ color: getScoreColor(interview.score.overall_score || 0) }} />
                          <span className="history-stat-label">Overall:</span>
                          <span
                            className="history-stat-value"
                            style={{ color: getScoreColor(interview.score.overall_score || 0) }}
                          >
                            {(interview.score.overall_score || 0).toFixed(0)}%
                          </span>
                        </div>
                        <div className="history-stat">
                          <span className="history-stat-label">Communication:</span>
                          <span className="history-stat-value">{(interview.score.communication_score || 0).toFixed(0)}%</span>
                        </div>
                        <div className="history-stat">
                          <span className="history-stat-label">Technical:</span>
                          <span className="history-stat-value">{(interview.score.technical_score || 0).toFixed(0)}%</span>
                        </div>
                        <div className="history-stat">
                          <span className="history-stat-label">Problem Solving:</span>
                          <span className="history-stat-value">{(interview.score.problem_solving_score || 0).toFixed(0)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'reading' && (
            <div className="history-section">
              <h3>Reading Progress</h3>
              {readingProgressData.length === 0 ? (
                <div className="history-empty">
                  <FiBook />
                  <p>No reading progress yet.</p>
                  <p style={{ fontSize: '14px', marginTop: '8px', opacity: 0.7 }}>
                    To track your reading progress, go to the PDF View section and open any document.
                    Your progress will be automatically saved as you read!
                  </p>
                </div>
              ) : (
                readingProgressData.map((progress, index) => (
                  <div key={index} className="history-item">
                    <div className="history-item-header">
                      <div>
                        <div className="history-item-title">
                          <FiBook style={{ marginRight: '8px', display: 'inline' }} />
                          {progress.filename || `Document ${progress.document_id}`}
                        </div>
                        <div className="history-item-date">
                          Last read: {formatDate(progress.last_read_at)}
                        </div>
                      </div>
                      <span
                        className="score-badge"
                        style={{
                          background: `${getScoreColor(progress.completion_percentage || 0)}20`,
                          color: getScoreColor(progress.completion_percentage || 0)
                        }}
                      >
                        {(progress.completion_percentage || 0).toFixed(0)}%
                      </span>
                    </div>

                    <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--bg-primary)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${progress.completion_percentage || 0}%`,
                          height: '100%',
                          background: getScoreColor(progress.completion_percentage || 0),
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>

                    <div className="history-item-stats">
                      <div className="history-stat">
                        <span className="history-stat-label">Current Page:</span>
                        <span className="history-stat-value">{progress.current_page || 1} / {progress.total_pages || 0}</span>
                      </div>
                      <div className="history-stat">
                        <span className="history-stat-label">Pages Read:</span>
                        <span className="history-stat-value">{progress.completed_pages?.length || 0}</span>
                      </div>
                      <div className="history-stat">
                        <span className="history-stat-label">Time Spent:</span>
                        <span className="history-stat-value">
                          {Math.floor((progress.time_spent_seconds || 0) / 60)} min
                        </span>
                      </div>
                      <div className="history-stat">
                        <span className="history-stat-label">Bookmarks:</span>
                        <span className="history-stat-value">
                          <FiBookmark style={{ marginRight: '4px', display: 'inline' }} />
                          {progress.bookmarks_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Progress
