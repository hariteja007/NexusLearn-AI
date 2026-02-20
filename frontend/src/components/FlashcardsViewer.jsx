import React, { useState, useMemo } from 'react';
import { FaChevronLeft, FaChevronRight, FaSyncAlt } from 'react-icons/fa';

const FlashcardsViewer = ({ content }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Parse flashcards from content
  const flashcards = useMemo(() => {
    try {
      // Try to parse as JSON
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch {
      // Parse from text format
      return parseTextFlashcards(content);
    }
  }, [content]);

  const currentCard = flashcards[currentIndex] || { front: 'No flashcards', back: 'No content' };

  const nextCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % flashcards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
  };

  const flipCard = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div className="flashcards-viewer">
      <div className="flashcard-counter">
        Card {currentIndex + 1} of {flashcards.length}
      </div>

      <div className="flashcard-container">
        <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={flipCard}>
          <div className="flashcard-front">
            <div className="flashcard-label">Question</div>
            <div className="flashcard-content">{currentCard.front}</div>
            <div className="flashcard-hint">Click to flip</div>
          </div>
          <div className="flashcard-back">
            <div className="flashcard-label">Answer</div>
            <div className="flashcard-content">{currentCard.back}</div>
            <div className="flashcard-hint">Click to flip back</div>
          </div>
        </div>
      </div>

      <div className="flashcard-controls">
        <button
          onClick={prevCard}
          disabled={flashcards.length <= 1}
          className="flashcard-nav-button"
        >
          <FaChevronLeft /> Previous
        </button>
        <button onClick={flipCard} className="flashcard-flip-button">
          <FaSyncAlt /> Flip Card
        </button>
        <button
          onClick={nextCard}
          disabled={flashcards.length <= 1}
          className="flashcard-nav-button"
        >
          Next <FaChevronRight />
        </button>
      </div>
    </div>
  );
};

// Parse text-based flashcards
const parseTextFlashcards = (text) => {
  const cards = [];
  const sections = text.split(/\n\s*\n/); // Split by double newlines

  sections.forEach((section) => {
    const lines = section.split('\n').filter((l) => l.trim());
    if (lines.length >= 2) {
      // Look for Q: and A: format
      let front = '';
      let back = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(/^(Q|Question):/i)) {
          front = line.replace(/^(Q|Question):\s*/i, '');
          // Get following lines until A:
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].match(/^(A|Answer):/i)) {
              back = lines[j].replace(/^(A|Answer):\s*/i, '');
              // Get following lines
              for (let k = j + 1; k < lines.length; k++) {
                if (!lines[k].match(/^(Q|Question):/i)) {
                  back += '\n' + lines[k];
                } else {
                  break;
                }
              }
              break;
            } else {
              front += '\n' + lines[j];
            }
          }
          break;
        }
      }

      if (front && back) {
        cards.push({ front: front.trim(), back: back.trim() });
      }
    }
  });

  // If no cards found with Q/A format, try numbered format
  if (cards.length === 0) {
    let currentCard = null;
    sections.forEach((section) => {
      const lines = section.split('\n').filter((l) => l.trim());
      if (lines.length >= 2) {
        currentCard = {
          front: lines[0].replace(/^\d+\.\s*/, ''),
          back: lines.slice(1).join('\n'),
        };
        cards.push(currentCard);
      }
    });
  }

  return cards.length > 0
    ? cards
    : [{ front: 'Sample Question', back: 'Sample Answer' }];
};

export default FlashcardsViewer;
