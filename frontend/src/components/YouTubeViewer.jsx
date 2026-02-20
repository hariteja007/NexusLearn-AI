import { useState, useEffect, useRef } from 'react'
import { FiYoutube, FiChevronDown, FiClock, FiMessageSquare, FiPlus, FiX, FiPlay, FiMessageCircle, FiCheck } from 'react-icons/fi'
import axios from 'axios'
import ReactPlayer from 'react-player/youtube'
import { API_URL } from '../config'

// Preset annotation colors
const ANNOTATION_COLORS = [
  { name: 'Yellow', value: '#ffeb3b' },
  { name: 'Green', value: '#4caf50' },
  { name: 'Blue', value: '#2196f3' },
  { name: 'Pink', value: '#e91e63' },
  { name: 'Purple', value: '#9c27b0' },
  { name: 'Orange', value: '#ff9800' },
  { name: 'Red', value: '#f44336' },
  { name: 'Cyan', value: '#00bcd4' }
]

function YouTubeViewer({ documents, notebookId, selectedDoc, onDocChange, metadata }) {
  const [videoData, setVideoData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showDocList, setShowDocList] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Annotation state
  const [annotations, setAnnotations] = useState([])
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const [annotationNote, setAnnotationNote] = useState('')
  const [annotationColor, setAnnotationColor] = useState('#ffeb3b')
  const [selectedText, setSelectedText] = useState(null)

  // Time range selection via transcript clicks
  const [selectionMode, setSelectionMode] = useState(false) // true when selecting range
  const [selectionStart, setSelectionStart] = useState(null) // transcript entry
  const [selectionEnd, setSelectionEnd] = useState(null) // transcript entry

  // AI Question state
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [selectedAnnotationForAI, setSelectedAnnotationForAI] = useState(null)

  const playerRef = useRef(null)
  const transcriptRef = useRef(null)

  useEffect(() => {
    if (selectedDoc && notebookId) {
      fetchVideoData()
      loadAnnotations()
    }
  }, [selectedDoc, notebookId])

  // Auto-scroll transcript to match video time
  useEffect(() => {
    if (transcriptRef.current && videoData?.transcript) {
      const activeEntry = videoData.transcript.find((entry, index) => {
        const nextEntry = videoData.transcript[index + 1]
        return currentTime >= entry.start && (!nextEntry || currentTime < nextEntry.start)
      })

      if (activeEntry) {
        const element = document.getElementById(`transcript-${activeEntry.start}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }
  }, [currentTime, videoData])

  const fetchVideoData = async () => {
    setIsLoading(true)
    try {
      const response = await axios.get(
        `${API_URL}/documents/${notebookId}/${selectedDoc.id}/content`
      )
      setVideoData(response.data)
      setDuration(response.data.duration || 0)
    } catch (error) {
      console.error('Error fetching video data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadAnnotations = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/annotations/${notebookId}?document_id=${selectedDoc.id}`
      )
      setAnnotations(response.data.annotations)
    } catch (error) {
      console.error('Error loading annotations:', error)
    }
  }

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const seekTo = (seconds) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, 'seconds')
      setPlaying(true)
    }
  }

  const handleTranscriptSelection = () => {
    const selection = window.getSelection()
    const selectedText = selection.toString().trim()

    if (selectedText.length > 0) {
      setSelectedText(selectedText)
      setShowAnnotationForm(true)
    }
  }

  const handleTranscriptClick = (entry) => {
    if (selectionMode) {
      // Selection mode - mark start or end
      if (!selectionStart) {
        // First click - mark start
        setSelectionStart(entry)
      } else if (!selectionEnd) {
        // Second click - mark end
        if (entry.start >= selectionStart.start) {
          setSelectionEnd(entry)
        } else {
          // If clicked earlier than start, swap them
          setSelectionEnd(selectionStart)
          setSelectionStart(entry)
        }
      } else {
        // Already have both - reset and start new selection
        setSelectionStart(entry)
        setSelectionEnd(null)
      }
    } else {
      // Normal mode - seek to timestamp
      seekTo(entry.start)
    }
  }

  const startRangeSelection = () => {
    setSelectionMode(true)
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  const cancelRangeSelection = () => {
    setSelectionMode(false)
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  const saveRangeAnnotation = () => {
    if (selectionStart) {
      setShowAnnotationForm(true)
    }
  }

  const createAnnotation = async () => {
    if (!annotationNote.trim() && !selectedText && !selectionStart) return

    try {
      const annotationData = {
        notebook_id: notebookId,
        document_id: selectedDoc.id,
        annotation_type: selectedText ? 'both' : 'timestamp',
        color: annotationColor,
        note: annotationNote || null,
        timestamp_start: selectionStart ? selectionStart.start : currentTime,
        timestamp_end: selectionEnd ? selectionEnd.start : (selectionStart ? selectionStart.start : null)
      }

      if (selectedText) {
        annotationData.highlighted_text = selectedText
      }

      await axios.post(`${API_URL}/annotations`, annotationData)

      setShowAnnotationForm(false)
      setAnnotationNote('')
      setSelectedText(null)
      setSelectionStart(null)
      setSelectionEnd(null)
      setSelectionMode(false)
      loadAnnotations()
    } catch (error) {
      console.error('Error creating annotation:', error)
      alert('Failed to create annotation. Please try again.')
    }
  }

  const deleteAnnotation = async (annotationId) => {
    try {
      await axios.delete(`${API_URL}/annotations/${annotationId}`)
      loadAnnotations()
    } catch (error) {
      console.error('Error deleting annotation:', error)
    }
  }

  const askAIAboutAnnotation = (annotation) => {
    setSelectedAnnotationForAI(annotation)
    setShowAIModal(true)
    setAiResponse('')
    setAiQuestion('')
  }

  const submitAIQuestion = async () => {
    if (!aiQuestion.trim()) return

    setAiLoading(true)
    try {
      // Get transcript text for the time range
      const startTime = selectedAnnotationForAI.timestamp_start
      const endTime = selectedAnnotationForAI.timestamp_end || selectedAnnotationForAI.timestamp_start

      const relevantTranscript = videoData.transcript
        .filter(entry => entry.start >= startTime && entry.start <= endTime)
        .map(entry => entry.text)
        .join(' ')

      const context = selectedAnnotationForAI.highlighted_text || relevantTranscript

      const response = await axios.post(`${API_URL}/annotations/query`, {
        annotation_id: selectedAnnotationForAI._id,
        question: aiQuestion,
        context: context
      })

      setAiResponse(response.data.answer)
    } catch (error) {
      console.error('Error asking AI:', error)
      setAiResponse('Failed to get answer. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  // Check if a transcript entry is within any annotation range
  const isTranscriptAnnotated = (entryStart) => {
    return annotations.some(ann => {
      if (ann.annotation_type === 'timestamp' || ann.annotation_type === 'both') {
        const start = ann.timestamp_start
        const end = ann.timestamp_end || ann.timestamp_start
        return entryStart >= start && entryStart <= end
      }
      return false
    })
  }

  // Get annotation color for transcript entry
  const getTranscriptAnnotationColor = (entryStart) => {
    const annotation = annotations.find(ann => {
      if (ann.annotation_type === 'timestamp' || ann.annotation_type === 'both') {
        const start = ann.timestamp_start
        const end = ann.timestamp_end || ann.timestamp_start
        return entryStart >= start && entryStart <= end
      }
      return false
    })
    return annotation?.color
  }

  // Check if transcript entry is in current selection
  const isInSelection = (entry) => {
    if (!selectionStart) return false
    if (!selectionEnd) return entry.start === selectionStart.start

    return entry.start >= selectionStart.start && entry.start <= selectionEnd.start
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-secondary)',
        gap: '16px'
      }}>
        {/* Back Button */}
        <button
          onClick={() => onDocChange?.(null)}
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-primary)'
          }}
        >
          ← Back
        </button>

        <div style={{ position: 'relative', flex: 1 }}>
          <button
            onClick={() => setShowDocList(!showDocList)}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              fontWeight: '500',
              width: '100%',
              maxWidth: '500px',
              color: 'var(--text-primary)'
            }}
          >
            <FiYoutube style={{ fontSize: '18px', color: '#ff0000' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              {selectedDoc?.filename || 'Select Video'}
            </span>
            <FiChevronDown style={{
              fontSize: '16px',
              transform: showDocList ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }} />
          </button>

          {showDocList && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '8px',
              maxWidth: '500px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 1000,
            }}>
              {documents.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => {
                    onDocChange?.(doc)
                    setShowDocList(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: selectedDoc?.id === doc.id ? 'var(--bg-secondary)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--text-primary)'
                  }}
                >
                  <FiYoutube />
                  {doc.filename}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={startRangeSelection}
          disabled={selectionMode}
          style={{
            padding: '8px 16px',
            backgroundColor: selectionMode ? '#4caf50' : 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: selectionMode ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            opacity: selectionMode ? 0.7 : 1
          }}
        >
          <FiPlus /> {selectionMode ? 'Selecting...' : 'Mark Range'}
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'var(--text-secondary)'
          }}>
            Loading video...
          </div>
        ) : videoData ? (
          <>
            {/* Left: Video Player */}
            <div style={{
              flex: '0 0 60%',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              backgroundColor: 'var(--bg-primary)',
              overflowY: 'auto'
            }}>
              <div style={{
                position: 'relative',
                paddingTop: '56.25%', // 16:9 aspect ratio
                backgroundColor: '#000',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <ReactPlayer
                  ref={playerRef}
                  url={videoData.source_url}
                  playing={playing}
                  controls
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  onProgress={({ playedSeconds }) => setCurrentTime(playedSeconds)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onDuration={setDuration}
                />
              </div>

              {/* Video Info */}
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                  {videoData.filename}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Duration: {formatTime(duration)} | Current: {formatTime(currentTime)}
                </p>
              </div>

              {/* Timestamp Annotations */}
              {annotations.filter(ann => ann.annotation_type === 'timestamp' || ann.annotation_type === 'both').length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                    <FiClock style={{ display: 'inline', marginRight: '6px' }} />
                    Marked Moments ({annotations.filter(ann => ann.annotation_type === 'timestamp' || ann.annotation_type === 'both').length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {annotations
                      .filter(ann => ann.annotation_type === 'timestamp' || ann.annotation_type === 'both')
                      .map((ann, index) => (
                        <div
                          key={ann._id || index}
                          style={{
                            padding: '12px',
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '8px',
                            borderLeft: `4px solid ${ann.color}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                            <div
                              style={{ flex: 1, cursor: 'pointer' }}
                              onClick={() => seekTo(ann.timestamp_start)}
                            >
                              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)', marginBottom: '4px' }}>
                                <FiPlay style={{ display: 'inline', marginRight: '4px', fontSize: '12px' }} />
                                {formatTime(ann.timestamp_start)}
                                {ann.timestamp_end && ann.timestamp_end !== ann.timestamp_start &&
                                  ` - ${formatTime(ann.timestamp_end)}`
                                }
                              </div>
                              {ann.note && (
                                <p style={{ fontSize: '13px', margin: 0, color: 'var(--text-primary)' }}>{ann.note}</p>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => askAIAboutAnnotation(ann)}
                                style={{
                                  background: 'rgba(33, 150, 243, 0.1)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#2196f3',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                                title="Ask AI about this moment"
                              >
                                <FiMessageCircle />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteAnnotation(ann._id)
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                  padding: '4px'
                                }}
                              >
                                <FiX />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Transcript */}
            <div style={{
              flex: '0 0 40%',
              display: 'flex',
              flexDirection: 'column',
              borderLeft: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)'
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <FiMessageSquare style={{ display: 'inline', marginRight: '8px' }} />
                  Transcript
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '400' }}>
                  {selectionMode ? 'Click to select range' : 'Click to jump'}
                </div>
              </div>

              {/* Selection Panel */}
              {selectionMode && (
                <div style={{
                  padding: '16px 20px',
                  backgroundColor: 'rgba(76, 175, 80, 0.1)',
                  borderBottom: '1px solid #4caf50'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#4caf50', marginBottom: '8px' }}>
                    Range Selection Mode
                  </div>
                  {!selectionStart && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Click on a transcript entry to mark the start
                    </div>
                  )}
                  {selectionStart && !selectionEnd && (
                    <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                      <strong>Start:</strong> {formatTime(selectionStart.start)}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Click on another entry to mark the end
                      </div>
                    </div>
                  )}
                  {selectionStart && selectionEnd && (
                    <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                      <strong>Range:</strong> {formatTime(selectionStart.start)} - {formatTime(selectionEnd.start)}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    {selectionStart && (
                      <button
                        onClick={saveRangeAnnotation}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#4caf50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <FiCheck /> Save Range
                      </button>
                    )}
                    <button
                      onClick={cancelRangeSelection}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <FiX /> Cancel
                    </button>
                  </div>
                </div>
              )}

              <div
                ref={transcriptRef}
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '16px 20px'
                }}
                onMouseUp={!selectionMode ? handleTranscriptSelection : undefined}
              >
                {videoData.transcript && videoData.transcript.length > 0 ? (
                  videoData.transcript.map((entry, index) => {
                    const isActive = currentTime >= entry.start &&
                      (index === videoData.transcript.length - 1 || currentTime < videoData.transcript[index + 1].start)

                    const isAnnotated = isTranscriptAnnotated(entry.start)
                    const annotationColor = getTranscriptAnnotationColor(entry.start)
                    const inSelection = isInSelection(entry)

                    return (
                      <div
                        key={index}
                        id={`transcript-${entry.start}`}
                        style={{
                          marginBottom: '2px',
                          padding: '12px',
                          borderRadius: '6px',
                          backgroundColor: inSelection
                            ? 'rgba(76, 175, 80, 0.15)'
                            : isActive
                            ? 'var(--primary-alpha)'
                            : isAnnotated
                            ? `${annotationColor}15`
                            : 'transparent',
                          borderLeft: isAnnotated ? `4px solid ${annotationColor}` : '4px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          border: inSelection ? '2px solid #4caf50' : 'none'
                        }}
                        onClick={() => handleTranscriptClick(entry)}
                      >
                        {isAnnotated && (
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            fontSize: '10px',
                            padding: '2px 6px',
                            backgroundColor: annotationColor,
                            borderRadius: '4px',
                            color: '#000',
                            fontWeight: '600'
                          }}>
                            MARKED
                          </div>
                        )}
                        <div style={{
                          fontSize: '11px',
                          color: 'var(--primary)',
                          fontWeight: '600',
                          marginBottom: '4px'
                        }}>
                          {formatTime(entry.start)}
                        </div>
                        <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                          {entry.text}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px' }}>
                    No transcript available for this video
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Annotation Form Modal */}
      {showAnnotationForm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000
          }}
          onClick={() => {
            setShowAnnotationForm(false)
            setSelectionStart(null)
            setSelectionEnd(null)
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              padding: '24px',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '500px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              {selectedText ? 'Annotate Transcript' : selectionStart && selectionEnd ? 'Add Time Range Note' : 'Add Timestamp Note'}
            </h3>

            {selectedText && (
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                fontStyle: 'italic'
              }}>
                "{selectedText}"
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
                {selectionStart && selectionEnd
                  ? `Time Range: ${formatTime(selectionStart.start)} - ${formatTime(selectionEnd.start)}`
                  : selectionStart
                  ? `Timestamp: ${formatTime(selectionStart.start)}`
                  : `Timestamp: ${formatTime(currentTime)}`
                }
              </label>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
                Note (optional)
              </label>
              <textarea
                value={annotationNote}
                onChange={(e) => setAnnotationNote(e.target.value)}
                placeholder="Add a note about this moment..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: '14px',
                  resize: 'vertical',
                  outline: 'none',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
                Color
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ANNOTATION_COLORS.map(({ name, value }) => (
                  <button
                    key={value}
                    onClick={() => setAnnotationColor(value)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: value,
                      border: annotationColor === value ? '3px solid var(--text-primary)' : '2px solid var(--border)',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title={name}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAnnotationForm(false)
                  setSelectionStart(null)
                  setSelectionEnd(null)
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={createAnnotation}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Save Annotation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Question Modal */}
      {showAIModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowAIModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              padding: '24px',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '600px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Ask AI About This Moment
            </h3>

            <div style={{
              padding: '12px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--primary)' }}>
                {formatTime(selectedAnnotationForAI?.timestamp_start)}
                {selectedAnnotationForAI?.timestamp_end &&
                  ` - ${formatTime(selectedAnnotationForAI.timestamp_end)}`
                }
              </div>
              {selectedAnnotationForAI?.note && (
                <div style={{ fontSize: '13px' }}>{selectedAnnotationForAI.note}</div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
                Your Question
              </label>
              <textarea
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="What would you like to know about this moment?"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: '14px',
                  resize: 'vertical',
                  outline: 'none',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            {aiResponse && (
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                borderRadius: '8px',
                marginBottom: '16px',
                borderLeft: '4px solid #2196f3'
              }}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#2196f3' }}>
                  AI Response:
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                  {aiResponse}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAIModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Close
              </button>
              <button
                onClick={submitAIQuestion}
                disabled={aiLoading || !aiQuestion.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: aiLoading || !aiQuestion.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: aiLoading || !aiQuestion.trim() ? 0.6 : 1
                }}
              >
                {aiLoading ? 'Asking...' : 'Ask AI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default YouTubeViewer
