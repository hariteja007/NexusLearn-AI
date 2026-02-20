import React, { useState, useMemo } from 'react';
import { FaCheck, FaTimes, FaRedo } from 'react-icons/fa';

const QuizViewer = ({ content }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState([]);

  // Parse quiz from content
  const questions = useMemo(() => {
    try {
      // Clean up content - remove markdown code blocks if present
      let cleanContent = content.trim();

      // Remove markdown code blocks like ```json ... ``` or ``` ... ```
      cleanContent = cleanContent.replace(/^```(?:json)?\s*\n/gm, '');
      cleanContent = cleanContent.replace(/\n```\s*$/gm, '');
      cleanContent = cleanContent.trim();

      const data = JSON.parse(cleanContent);
      if (Array.isArray(data)) {
        // Normalize field names: convert correct_answer to correctAnswer
        return data.map(q => ({
          ...q,
          correctAnswer: q.correctAnswer ?? q.correct_answer ?? 0
        }));
      }
      return [];
    } catch (error) {
      console.error('JSON parsing failed, trying text parser:', error);
      return parseTextQuiz(content);
    }
  }, [content]);

  const currentQuestion = questions[currentIndex];

  const handleAnswerSelect = (index) => {
    if (showResult) return;
    setSelectedAnswer(index);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    setShowResult(true);
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    if (isCorrect && !answeredQuestions.includes(currentIndex)) {
      setScore(score + 1);
      setAnsweredQuestions([...answeredQuestions, currentIndex]);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setCompleted(false);
    setAnsweredQuestions([]);
  };

  if (questions.length === 0) {
    return (
      <div className="quiz-viewer">
        <div className="quiz-empty">
          <p>No quiz questions available</p>
          <small>The quiz content may be in an unexpected format. Try generating a new quiz.</small>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="quiz-viewer">
        <div className="quiz-completed">
          <h2>Quiz Complete!</h2>
          <div className="quiz-score">
            Your Score: {score} / {questions.length}
          </div>
          <div className="quiz-percentage">
            {Math.round((score / questions.length) * 100)}%
          </div>
          <button onClick={handleRestart} className="quiz-restart-button">
            <FaRedo /> Restart Quiz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-viewer">
      <div className="quiz-progress">
        Question {currentIndex + 1} of {questions.length}
        <div className="quiz-progress-bar">
          <div
            className="quiz-progress-fill"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="quiz-question">
        <h3>{currentQuestion.question}</h3>
      </div>

      <div className="quiz-options">
        {currentQuestion.options.map((option, index) => {
          let className = 'quiz-option';
          if (showResult) {
            if (index === currentQuestion.correctAnswer) {
              className += ' correct';
            } else if (index === selectedAnswer && index !== currentQuestion.correctAnswer) {
              className += ' incorrect';
            }
          } else if (index === selectedAnswer) {
            className += ' selected';
          }

          return (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              className={className}
              disabled={showResult}
            >
              <span className="option-label">{String.fromCharCode(65 + index)}.</span>
              <span className="option-text">{option}</span>
              {showResult && index === currentQuestion.correctAnswer && (
                <FaCheck className="option-icon correct-icon" />
              )}
              {showResult &&
                index === selectedAnswer &&
                index !== currentQuestion.correctAnswer && (
                  <FaTimes className="option-icon incorrect-icon" />
                )}
            </button>
          );
        })}
      </div>

      {showResult && currentQuestion.explanation && (
        <div className="quiz-explanation">
          <strong>Explanation:</strong> {currentQuestion.explanation}
        </div>
      )}

      <div className="quiz-actions">
        {!showResult ? (
          <button
            onClick={handleSubmitAnswer}
            disabled={selectedAnswer === null}
            className="quiz-submit-button"
          >
            Submit Answer
          </button>
        ) : (
          <button onClick={handleNextQuestion} className="quiz-next-button">
            {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
          </button>
        )}
      </div>

      <div className="quiz-score-display">Current Score: {score}</div>
    </div>
  );
};

// Parse text-based quiz
const parseTextQuiz = (text) => {
  const questions = [];

  // Try splitting by different patterns to find questions
  // Pattern 1: Split by question numbers (1. 2. 3. etc)
  let sections = text.split(/(?=^\d+\.)/m);

  // If that doesn't work, try splitting by double newlines
  if (sections.length === 1) {
    sections = text.split(/\n\s*\n/);
  }

  console.log('Parsing quiz with', sections.length, 'sections');
  console.log('Raw text:', text);

  sections.forEach((section, sectionIndex) => {
    const lines = section.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return;

    let question = '';
    let options = [];
    let correctAnswer = -1;
    let explanation = '';

    console.log(`Section ${sectionIndex}:`, lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Question line - more flexible patterns
      if (line.match(/^\*?\*?Question\s*\d*[\*\:]|\*?\d+\.|^Q\d*:/i)) {
        question = line.replace(/^\*?\*?Question\s*\d*[\*\:]\s*|\*?\d+\.\s*|^Q\d*:\s*/i, '').trim();
        console.log('Found question:', question);
      }
      // Options (A, B, C, D or a, b, c, d) - handle markdown bold
      else if (line.match(/^\*?[a-dA-D][\)\.\:]|\*?\([a-dA-D]\)/)) {
        const optionText = line.replace(/^\*?[a-dA-D][\)\.\:]\s*|\*?\([a-dA-D]\)\s*/,'').trim();
        options.push(optionText);
        console.log('Found option', String.fromCharCode(65 + options.length - 1) + ':', optionText);
      }
      // Correct answer marker - very flexible pattern
      else if (line.match(/^\*{0,2}(Answer|Correct(\s+Answer)?)\*{0,2}[\s:\*]/i)) {
        // Remove markdown formatting and label
        const answerText = line
          .replace(/^\*{0,2}(Answer|Correct(\s+Answer)?)\*{0,2}[\s:\*]+/i, '')
          .replace(/\*\*/g, '')
          .trim();

        console.log('Found answer line:', line, '→ extracted text:', answerText);

        // Try to extract the letter
        const letterMatch = answerText.match(/\b[A-D]\b/i);

        if (letterMatch) {
          const answerLetter = letterMatch[0].toUpperCase();
          correctAnswer = answerLetter.charCodeAt(0) - 65; // A=0, B=1, etc.
          console.log('✓ Parsed correct answer:', answerLetter, '→ index:', correctAnswer);
        } else {
          console.warn('✗ Could not extract letter from answer text:', answerText);
        }
      }
      // Explanation - handle markdown
      else if (line.match(/^\*{0,2}Explanation\*{0,2}:/i)) {
        explanation = line.replace(/^\*{0,2}Explanation\*{0,2}:\s*/i, '').trim();
        console.log('Found explanation:', explanation);
      }
    }

    if (question && options.length >= 2) {
      // If no correct answer was marked, default to first option
      if (correctAnswer === -1) {
        console.warn('⚠ No correct answer found for question:', question);
        console.warn('Full section text:', section);
        correctAnswer = 0;
      } else {
        console.log('✓ Question complete with correct answer index:', correctAnswer);
      }

      questions.push({
        question,
        options,
        correctAnswer,
        explanation,
      });
    }
  });

  return questions;
};

export default QuizViewer;
