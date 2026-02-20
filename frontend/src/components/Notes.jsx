import { useState, useEffect, useMemo } from 'react';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiX,
  FiStar,
  FiEye,
  FiSearch,
  FiFilter,
  FiTag,
  FiDownload,
  FiSave,
  FiArrowLeft,
} from 'react-icons/fi';
import { FaRobot } from 'react-icons/fa';
import axios from 'axios';
import NotificationModal from './NotificationModal';
import LoadingSpinner from './LoadingSpinner';
import { useNotification } from '../hooks/useNotification';
import RichTextEditor from './RichTextEditor';
import EnhancedDrawing from './EnhancedDrawing';
import MindMapViewer from './MindMapViewer';
import FlashcardsViewer from './FlashcardsViewer';
import QuizViewer from './QuizViewer';
import TimelineViewer from './TimelineViewer';
import ComparisonTableViewer from './ComparisonTableViewer';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { API_URL } from '../config';

const NOTE_COLORS = [
  { value: '#ffffff', label: 'White' },
  { value: '#fef3c7', label: 'Amber' },
  { value: '#dbeafe', label: 'Blue' },
  { value: '#dcfce7', label: 'Green' },
  { value: '#fce7f3', label: 'Pink' },
  { value: '#f3e8ff', label: 'Purple' },
  { value: '#fed7aa', label: 'Orange' },
  { value: '#cffafe', label: 'Cyan' },
];

const AI_NOTE_TYPES = [
  { value: 'summary', label: 'Summary' },
  { value: 'key_points', label: 'Key Points' },
  { value: 'mind_map', label: 'Mind Map' },
  { value: 'flashcards', label: 'Flashcards' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'comparison_table', label: 'Comparison Table' },
];

function Notes({ documents, selectedDocIds, notebookId }) {
  // Core state
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Editor state - full screen mode
  const [isEditing, setIsEditing] = useState(false);
  const [currentNote, setCurrentNote] = useState(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('rich_text');
  const [noteColor, setNoteColor] = useState('#ffffff');
  const [noteTags, setNoteTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  // Modal states
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewingNote, setViewingNote] = useState(null);

  // AI generation state
  const [genTopic, setGenTopic] = useState('');
  const [genType, setGenType] = useState('summary');

  // Notification modal
  const {
    notification,
    closeNotification,
    showError,
    showSuccess,
    showWarning,
    showConfirm
  } = useNotification();

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterTags, setFilterTags] = useState([]);
  const [sortBy, setSortBy] = useState('date_desc');

  useEffect(() => {
    if (notebookId) {
      fetchNotes();
    }
  }, [notebookId]);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach((note) => {
      if (note.tags) {
        note.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let filtered = notes;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          (note.tags && note.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
    }

    if (filterType !== 'all') {
      if (filterType === 'user') {
        filtered = filtered.filter((note) => !note.note_type.startsWith('ai_'));
      } else if (filterType === 'ai') {
        filtered = filtered.filter((note) => note.note_type.startsWith('ai_'));
      } else {
        filtered = filtered.filter((note) => note.note_type === filterType);
      }
    }

    if (filterTags.length > 0) {
      filtered = filtered.filter(
        (note) => note.tags && filterTags.every((tag) => note.tags.includes(tag))
      );
    }

    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'date_asc':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'title_asc':
          return a.title.localeCompare(b.title);
        case 'title_desc':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [notes, searchQuery, filterType, filterTags, sortBy]);

  const fetchNotes = async () => {
    try {
      const response = await axios.get(`${API_URL}/notes/${notebookId}`);
      setNotes(response.data.notes);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const openNamePrompt = () => {
    setNoteTitle('');
    setNoteType('rich_text');
    setShowNamePrompt(true);
  };

  const startNewNote = () => {
    if (!noteTitle.trim()) {
      showWarning('Validation Error', 'Please enter a note title');
      return;
    }

    setShowNamePrompt(false);
    setCurrentNote(null);
    setNoteContent('');
    setNoteColor('#ffffff');
    setNoteTags([]);
    setIsEditing(true);
  };

  const openEditorForNote = (note) => {
    setCurrentNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteType(note.note_type);
    setNoteColor(note.color);
    setNoteTags(note.tags || []);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setIsEditing(false);
    setCurrentNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteType('rich_text');
    setNoteColor('#ffffff');
    setNoteTags([]);
    setTagInput('');
  };

  const saveNote = async () => {
    if (!noteTitle.trim()) {
      showWarning('Validation Error', 'Please enter a note title');
      return;
    }

    setIsLoading(true);
    try {
      if (currentNote) {
        await axios.put(`${API_URL}/notes/${currentNote.id}`, {
          title: noteTitle,
          content: noteContent,
          color: noteColor,
          tags: noteTags,
        });
      } else {
        await axios.post(`${API_URL}/notes`, {
          notebook_id: notebookId,
          title: noteTitle,
          content: noteContent,
          note_type: noteType,
          color: noteColor,
          tags: noteTags,
        });
      }

      await fetchNotes();
      closeEditor();
    } catch (error) {
      console.error('Error saving note:', error);
      showError('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNote = async (noteId) => {
    showConfirm(
      'Delete Note',
      'Are you sure you want to delete this note? This action cannot be undone.',
      async () => {
        try {
          await axios.delete(`${API_URL}/notes/${noteId}`);
          await fetchNotes();
          closeNotification();
          showSuccess('Success', 'Note deleted successfully!');
        } catch (error) {
          console.error('Error deleting note:', error);
          closeNotification();
          showError('Error', 'Failed to delete note. Please try again.');
        }
      }
    );
  };

  const generateAINotes = async () => {
    if (!genType) {
      showWarning('Validation Error', 'Please select a note type');
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/notes/generate`, {
        notebook_id: notebookId,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        topic: genTopic.trim() || null,
        note_type: genType,
      });

      await fetchNotes();
      setShowGenerateModal(false);
      setGenTopic('');
      setGenType('summary');
    } catch (error) {
      console.error('Error generating notes:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      showError('Error', `Failed to generate notes: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const viewNote = (note) => {
    setViewingNote(note);
    setShowViewModal(true);
  };

  const closeViewModal = () => {
    setShowViewModal(false);
    setViewingNote(null);
  };

  const handleRichTextChange = (html) => {
    setNoteContent(html);
  };

  const handleDrawingChange = (dataUrl) => {
    setNoteContent(dataUrl);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !noteTags.includes(tag)) {
      setNoteTags([...noteTags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setNoteTags(noteTags.filter((tag) => tag !== tagToRemove));
  };

  const toggleFilterTag = (tag) => {
    if (filterTags.includes(tag)) {
      setFilterTags(filterTags.filter((t) => t !== tag));
    } else {
      setFilterTags([...filterTags, tag]);
    }
  };

  const convertImageToBase64 = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        } catch (e) {
          // If CORS fails, return original URL
          resolve(url);
        }
      };
      img.onerror = () => {
        // If image fails to load, return original URL
        resolve(url);
      };
      img.src = url;
    });
  };

  const exportDrawingAsPNG = (note) => {
    try {
      // For drawings, the content is already a base64 data URL
      const link = document.createElement('a');
      link.download = `${note.title}.png`;
      link.href = note.content;
      link.click();
    } catch (error) {
      console.error('Error exporting drawing:', error);
      showNotification('Failed to export drawing', 'error');
    }
  };

  const exportNoteToPDF = async (note) => {
    try {
      // Create a temporary container for rendering
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '800px';
      container.style.padding = '40px';
      container.style.backgroundColor = 'white';

      // Add title
      const titleElement = document.createElement('h1');
      titleElement.textContent = note.title;
      titleElement.style.marginBottom = '20px';
      titleElement.style.color = 'black';
      container.appendChild(titleElement);

      // Add tags if present
      if (note.tags && note.tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.style.marginBottom = '20px';
        tagsContainer.style.display = 'flex';
        tagsContainer.style.flexWrap = 'wrap';
        tagsContainer.style.gap = '8px';

        note.tags.forEach(tag => {
          const tagSpan = document.createElement('span');
          tagSpan.textContent = tag;
          tagSpan.style.padding = '4px 12px';
          tagSpan.style.background = 'rgba(99, 102, 241, 0.1)';
          tagSpan.style.border = '1px solid rgba(99, 102, 241, 0.2)';
          tagSpan.style.borderRadius = '6px';
          tagSpan.style.fontSize = '12px';
          tagSpan.style.color = '#6366f1';
          tagsContainer.appendChild(tagSpan);
        });

        container.appendChild(tagsContainer);
      }

      // Add content with styling
      const contentElement = document.createElement('div');
      contentElement.className = 'note-rich-content';
      contentElement.innerHTML = note.content;

      // Apply inline styles to ensure they're captured
      contentElement.style.fontSize = '14px';
      contentElement.style.lineHeight = '1.8';
      contentElement.style.color = 'black';

      // Convert all images to base64 to avoid CORS issues
      const images = contentElement.querySelectorAll('img');
      const imageConversionPromises = Array.from(images).map(async (img) => {
        const originalSrc = img.src;
        try {
          const base64Src = await convertImageToBase64(originalSrc);
          img.src = base64Src;
        } catch (e) {
          console.warn('Failed to convert image:', originalSrc);
        }

        // Style images
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.borderRadius = '8px';
        img.style.margin = '1em 0';
        img.style.display = 'block';
      });

      await Promise.all(imageConversionPromises);

      // Style code blocks
      const codeBlocks = contentElement.querySelectorAll('pre');
      codeBlocks.forEach(pre => {
        pre.style.background = '#2d2d2d';
        pre.style.color = '#f8f8f2';
        pre.style.padding = '16px';
        pre.style.borderRadius = '8px';
        pre.style.overflowX = 'auto';
        pre.style.margin = '1em 0';
        pre.style.border = '1px solid #404040';

        const code = pre.querySelector('code');
        if (code) {
          code.style.background = 'transparent';
          code.style.fontSize = '13px';
          code.style.lineHeight = '1.6';
          code.style.fontFamily = "'Courier New', 'Consolas', monospace";
        }
      });

      // Style inline code
      const inlineCodes = contentElement.querySelectorAll('code:not(pre code)');
      inlineCodes.forEach(code => {
        code.style.background = '#2d2d2d';
        code.style.color = '#f8f8f2';
        code.style.padding = '2px 6px';
        code.style.borderRadius = '4px';
        code.style.fontFamily = "'Courier New', 'Consolas', monospace";
        code.style.fontSize = '0.9em';
      });

      container.appendChild(contentElement);
      document.body.appendChild(container);

      // Give a small delay to ensure everything is rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the container as canvas
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: false,
        allowTaint: false,
        backgroundColor: 'white',
        logging: false,
      });

      // Remove temporary container
      document.body.removeChild(container);

      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = 0;
      const imgY = 0;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);

      // Handle multi-page content
      let heightLeft = imgHeight * ratio - pdfHeight;
      let position = -pdfHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', imgX, position, imgWidth * ratio, imgHeight * ratio);
        heightLeft -= pdfHeight;
        position -= pdfHeight;
      }

      pdf.save(`${note.title}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      showNotification('Failed to export PDF', 'error');
    }
  };

  const exportNoteToMarkdown = (note) => {
    const markdown = `# ${note.title}\n\n${note.content.replace(/<[^>]*>/g, '')}`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    saveAs(blob, `${note.title}.md`);
  };

  const renderNoteContent = (note, isPreview = true) => {
    const content = note.content;

    switch (note.note_type) {
      case 'ai_mindmap':
        return isPreview ? (
          <div className="note-preview">Mind Map (click to view)</div>
        ) : (
          <MindMapViewer content={content} />
        );

      case 'ai_flashcards':
        return isPreview ? (
          <div className="note-preview">Flashcards (click to view)</div>
        ) : (
          <FlashcardsViewer content={content} />
        );

      case 'ai_quiz':
        return isPreview ? (
          <div className="note-preview">Quiz (click to view)</div>
        ) : (
          <QuizViewer content={content} />
        );

      case 'ai_timeline':
        return isPreview ? (
          <div className="note-preview">Timeline (click to view)</div>
        ) : (
          <TimelineViewer content={content} />
        );

      case 'comparison_table':
        return isPreview ? (
          <div className="note-preview">Comparison Table (click to view)</div>
        ) : (
          <ComparisonTableViewer content={content} />
        );

      case 'drawing':
        return <img src={content} alt="Drawing" className="note-drawing" />;

      case 'rich_text':
        return isPreview ? (
          <div
            className="note-preview"
            dangerouslySetInnerHTML={{
              __html: content.length > 200 ? content.substring(0, 200) + '...' : content,
            }}
          />
        ) : (
          <div className="note-rich-content">
            <ReactMarkdown
            remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}>
              {content}
            </ReactMarkdown>
          </div>
        );

      case 'text':
      default:
        return isPreview ? (
          <div className="note-preview">
            {content.length > 200 ? content.substring(0, 200) + '...' : content}
          </div>
        ) : (
          <div className="note-rich-content">
            <ReactMarkdown>
              {content}
            </ReactMarkdown>
          </div>
        ); 
    }
  };

  const getNoteTypeIcon = (noteType) => {
    if (noteType.startsWith('ai_')) {
      return <FaRobot className="note-type-icon ai" />;
    }
    return null;
  };

  const getNoteTypeLabel = (noteType) => {
    const labels = {
      text: 'Text',
      rich_text: 'Rich Text',
      drawing: 'Drawing',
      ai_mindmap: 'Mind Map',
      ai_flashcards: 'Flashcards',
      ai_quiz: 'Quiz',
      ai_timeline: 'Timeline',
      comparison_table: 'Comparison Table',
    };
    return labels[noteType] || noteType;
  };

  // Full-screen editor view
  if (isEditing) {
    return (
      <div className="notes-fullscreen-editor">
        {/* Top Bar */}
        <div className="editor-top-bar">
          <div className="editor-top-left">
            <button onClick={closeEditor} className="back-button">
              <FiArrowLeft /> Back to Notes
            </button>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title..."
              className="editor-title-input"
            />
          </div>
          <div className="editor-top-right">
            <button onClick={saveNote} disabled={isLoading} className="save-button">
              <FiSave /> {isLoading ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="editor-layout">
          <div className="editor-sidebar">
            <div className="sidebar-section">
              <label>Note Type</label>
              {!currentNote && (
                <div className="type-buttons">
                  <button
                    onClick={() => setNoteType('rich_text')}
                    className={noteType === 'rich_text' ? 'type-btn active' : 'type-btn'}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setNoteType('drawing')}
                    className={noteType === 'drawing' ? 'type-btn active' : 'type-btn'}
                  >
                    Drawing
                  </button>
                </div>
              )}
              {currentNote && <div className="type-display">{getNoteTypeLabel(noteType)}</div>}
            </div>

            <div className="sidebar-section">
              <label>Background Color</label>
              <div className="color-picker-grid">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNoteColor(c.value)}
                    className={`color-btn ${noteColor === c.value ? 'active' : ''}`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <label>Tags</label>
              <div className="tags-container">
                {noteTags.length!=0 ? noteTags.map((tag, idx) => (
                  <span key={idx} className="tag-item">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="tag-remove-btn">
                      <FiX />
                    </button>
                  </span>
                )):`No Tags`}
              </div>
              <div className="tag-input-row">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add tag..."
                  className="tag-input-field"
                />
                <button onClick={addTag} className="tag-add-btn">
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Main Editor Area */}
          <div className="editor-main" style={{ backgroundColor: noteColor }}>
            {noteType === 'rich_text' || currentNote?.note_type === 'rich_text' ? (
              <RichTextEditor content={noteContent} onChange={handleRichTextChange} />
            ) : noteType === 'drawing' || currentNote?.note_type === 'drawing' ? (
              <EnhancedDrawing initialData={noteContent} onChange={handleDrawingChange} />
            ) : (
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Start typing..."
                className="plain-textarea"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normal notes list view
  return (
    <div className="notes-container">
      <div className="notes-header">
        <div className="notes-header-left">
          <h2>Notes</h2>
          <span className="notes-count">({filteredNotes.length})</span>
        </div>
        <div className="notes-header-right">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
            <div className="notes-search">
              <FiSearch className="search-icon" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`icon-button ${showFilters ? 'active' : ''}`}
              title="Filters"
            >
              <FiFilter />
            </button>
          </div>

          <div className="notes-actions-row">
            <button onClick={openNamePrompt} className="action-button primary">
              <FiPlus /> <span>New Note</span>
            </button>
            <button onClick={() => setShowGenerateModal(true)} className="action-button ai-generate">
              <FaRobot /> <span>AI Notes</span>
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="notes-filters">
          <div className="filter-group">
            <label>Type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="user">User Notes</option>
              <option value="ai">AI Notes</option>
              <option value="text">Text</option>
              <option value="rich_text">Rich Text</option>
              <option value="drawing">Drawing</option>
              <option value="ai_mindmap">Mind Map</option>
              <option value="ai_flashcards">Flashcards</option>
              <option value="ai_quiz">Quiz</option>
              <option value="ai_timeline">Timeline</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Sort:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="title_asc">Title (A-Z)</option>
              <option value="title_desc">Title (Z-A)</option>
            </select>
          </div>

          {allTags.length > 0 && (
            <div className="filter-group">
              <label>Tags:</label>
              <div className="filter-tags">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleFilterTag(tag)}
                    className={`tag-filter ${filterTags.includes(tag) ? 'active' : ''}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filterTags.length > 0 && (
            <button onClick={() => setFilterTags([])} className="clear-filters">
              Clear Tag Filters
            </button>
          )}
        </div>
      )}

      <div className="notes-grid">
        {filteredNotes.length === 0 ? (
          <div className="notes-empty">
            <p>No notes yet. Create your first note or generate AI notes from your documents!</p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className="note-card"
              style={{ backgroundColor: note.color }}
              onClick={() => viewNote(note)}
            >
              <div className="note-card-header">
                <h3>{note.title}</h3>
                <div className="note-card-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditorForNote(note);
                    }}
                    className="icon-button"
                    title="Edit"
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNote(note.id);
                    }}
                    className="icon-button"
                    title="Delete"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>

              <div className="note-card-content">{renderNoteContent(note, true)}</div>

              <div className="note-card-footer">
                <div className="note-type-badge">
                  {getNoteTypeIcon(note.note_type)}
                  {getNoteTypeLabel(note.note_type)}
                </div>
                {note.tags && note.tags.length > 0 && (
                  <div className="note-tags-preview">
                    {note.tags.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="note-tag-small">
                        {tag}
                      </span>
                    ))}
                    {note.tags.length > 2 && (
                      <span className="note-tag-more">+{note.tags.length - 2}</span>
                    )}
                  </div>
                )}
                <div className="note-date">{new Date(note.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Name Prompt Modal - Simple */}
      {showNamePrompt && (
        <div className="modal-overlay" onClick={() => setShowNamePrompt(false)}>
          <div className="modal name-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Note</h2>
              <button onClick={() => setShowNamePrompt(false)} className="icon-button">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <label>Note Title</label>
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Enter note title..."
                className="form-input"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') startNewNote();
                }}
              />
              <div className="type-selector-inline">
                <label>Type:</label>
                <button
                  onClick={() => setNoteType('rich_text')}
                  className={noteType === 'rich_text' ? 'type-btn-inline active' : 'type-btn-inline'}
                >
                  Text
                </button>
                <button
                  onClick={() => setNoteType('drawing')}
                  className={noteType === 'drawing' ? 'type-btn-inline active' : 'type-btn-inline'}
                >
                  Drawing
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowNamePrompt(false)} className="action-button">
                Cancel
              </button>
              <button onClick={startNewNote} className="action-button primary">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate AI Notes Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal generate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Generate AI Notes</h2>
              <button onClick={() => setShowGenerateModal(false)} className="icon-button">
                <FiX />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Note Type</label>
                <select
                  value={genType}
                  onChange={(e) => setGenType(e.target.value)}
                  className="form-select"
                >
                  {AI_NOTE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Topic (Optional)</label>
                <input
                  type="text"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  placeholder="e.g., Machine Learning Basics"
                  className="form-input"
                />
                <small>Leave empty to generate from all content</small>
              </div>

              <div className="ai-generate-info">
                <p>
                  AI will analyze your uploaded documents and generate {genType.replace('_', ' ')}{' '}
                  notes
                  {genTopic && ` focused on "${genTopic}"`}.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowGenerateModal(false)} className="action-button">
                Cancel
              </button>
              <button onClick={generateAINotes} disabled={isLoading} className="action-button primary">
                {isLoading ? 'Generating...' : 'Generate Notes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Note Modal */}
      {showViewModal && viewingNote && (
        <div className="modal-overlay" onClick={closeViewModal}>
          <div
            className="modal note-view-modal"
            style={{ backgroundColor: viewingNote.color }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="note-view-title">
                <h2>{viewingNote.title}</h2>
                <div className="note-type-badge">
                  {getNoteTypeIcon(viewingNote.note_type)}
                  {getNoteTypeLabel(viewingNote.note_type)}
                </div>
              </div>
              <div className="note-view-actions">
                <button
                  onClick={() => {
                    if (viewingNote.note_type === 'drawing') {
                      exportDrawingAsPNG(viewingNote);
                    } else {
                      exportNoteToPDF(viewingNote);
                    }
                  }}
                  className="icon-button"
                  title={viewingNote.note_type === 'drawing' ? 'Download as PNG' : 'Export as PDF'}
                >
                  <FiDownload />
                </button>
                <button
                  onClick={() => {
                    closeViewModal();
                    openEditorForNote(viewingNote);
                  }}
                  className="icon-button"
                  title="Edit"
                >
                  <FiEdit2 />
                </button>
                <button onClick={closeViewModal} className="icon-button">
                  <FiX />
                </button>
              </div>
            </div>

            <div className="modal-body note-view-body">
              {viewingNote.tags && viewingNote.tags.length > 0 && (
                <div className="note-view-tags">
                  {viewingNote.tags.map((tag, idx) => (
                    <span key={idx} className="note-tag">
                      <FiTag /> {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="note-view-content">
              {renderNoteContent(viewingNote, false)}
              </div>

              <div className="note-view-meta">
                <span>Created: {new Date(viewingNote.created_at).toLocaleString()}</span>
                <span>Updated: {new Date(viewingNote.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-overlay-content">
            <LoadingSpinner size="large" text="Please wait..." />
          </div>
        </div>
      )}

      {/* Notification Modal */}
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
    </div>
  );
}

export default Notes;
