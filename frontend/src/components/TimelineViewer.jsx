import React, { useMemo } from 'react';
import { FaCircle } from 'react-icons/fa';

const TimelineViewer = ({ content }) => {
  // Parse timeline events from content
  const events = useMemo(() => {
    try {
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch {
      return parseTextTimeline(content);
    }
  }, [content]);

  if (events.length === 0) {
    return (
      <div className="timeline-viewer">
        <div className="timeline-empty">No timeline events available</div>
      </div>
    );
  }

  return (
    <div className="timeline-viewer">
      <div className="timeline-container">
        {events.map((event, index) => (
          <div key={index} className="timeline-event">
            <div className="timeline-marker">
              <FaCircle className="timeline-dot" />
              {index < events.length - 1 && <div className="timeline-line"></div>}
            </div>
            <div className="timeline-content">
              <div className="timeline-date">{event.date}</div>
              <div className="timeline-title">{event.title}</div>
              {event.description && (
                <div className="timeline-description">{event.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Parse text-based timeline
const parseTextTimeline = (text) => {
  const events = [];

  // Split by double newlines to get event blocks
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());

  blocks.forEach((block) => {
    const lines = block.split('\n').filter((l) => l.trim());

    if (lines.length === 0) return;

    let date = '';
    let title = '';
    let description = '';

    // Look for the backend format: [Date/Year]: [Event Title]
    const backendFormat = lines[0].match(/^\[([^\]]+)\]:\s*(.+)/);

    if (backendFormat) {
      // Backend format: [Date]: Title
      date = backendFormat[1];
      title = backendFormat[2];
      // Rest of the lines are description
      description = lines.slice(1).join(' ').trim();
    } else {
      // Try other formats
      // Look for date patterns at the start
      const dateMatch = lines[0].match(/^(\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/);

      if (dateMatch) {
        date = dateMatch[1];
        title = lines[0].replace(dateMatch[0], '').replace(/^[\s:-]+/, '').trim();
        description = lines.slice(1).join(' ').trim();
      } else {
        // No clear date, use first line as title
        title = lines[0];
        description = lines.slice(1).join(' ').trim();
        date = 'Date Unknown';
      }
    }

    if (title) {
      events.push({
        date: date || 'Unknown',
        title: title,
        description: description,
      });
    }
  });

  // If no events found, try bullet point format
  if (events.length === 0) {
    const lines = text.split('\n').filter((l) => l.trim());
    let currentDate = '';

    lines.forEach((line) => {
      const trimmed = line.trim();

      // Check for heading as date
      if (trimmed.match(/^#+\s*/)) {
        currentDate = trimmed.replace(/^#+\s*/, '');
      }
      // Check for bullet points
      else if (trimmed.match(/^[-*•]\s*/)) {
        const text = trimmed.replace(/^[-*•]\s*/, '');
        events.push({
          date: currentDate || 'Unknown',
          title: text,
          description: '',
        });
      }
      // Check for numbered list
      else if (trimmed.match(/^\d+\.\s*/)) {
        const text = trimmed.replace(/^\d+\.\s*/, '');
        events.push({
          date: currentDate || 'Unknown',
          title: text,
          description: '',
        });
      }
    });
  }

  return events.length > 0
    ? events
    : [
        {
          date: 'Sample Date',
          title: 'Sample Event',
          description: 'Sample Description',
        },
      ];
};

export default TimelineViewer;
