import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  FaPen,
  FaEraser,
  FaSquare,
  FaCircle,
  FaMinus,
  FaFont,
  FaUndo,
  FaRedo,
  FaTrash,
  FaDownload,
} from 'react-icons/fa';

const EnhancedDrawing = ({ initialData, onChange }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [startPos, setStartPos] = useState(null);
  const [isAddingText, setIsAddingText] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [tempCanvas, setTempCanvas] = useState(null);

  const colorPalette = [
    '#000000', '#ffffff', '#ff0000', '#00ff00',
    '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#ff8800', '#8800ff', '#00ff88', '#ff0088',
  ];

  const lineWidths = [1, 2, 4, 6, 8, 12, 16];

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(canvas.toDataURL());
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);

    if (onChange) {
      onChange(canvas.toDataURL());
    }
  }, [history, historyStep, onChange]);

  const loadFromHistory = useCallback((step) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      if (onChange) {
        onChange(canvas.toDataURL());
      }
    };
    img.src = history[step];
  }, [history, onChange]);

  useEffect(() => {
    if (initialized) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (initialData) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL();
        setHistory([dataUrl]);
        setHistoryStep(0);
        setInitialized(true);
      };
      img.src = initialData;
    } else {
      const dataUrl = canvas.toDataURL();
      setHistory([dataUrl]);
      setHistoryStep(0);
      setInitialized(true);
    }
  }, [initialized, initialData]);

  const undo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      loadFromHistory(newStep);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      loadFromHistory(newStep);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    const pos = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (tool === 'text') {
      setTextPosition(pos);
      setIsAddingText(true);
      return;
    }

    setIsDrawing(true);
    setStartPos(pos);

    // Save current canvas state for shapes (rectangle, circle, line)
    if (['rectangle', 'circle', 'line'].includes(tool)) {
      setTempCanvas(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const pos = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (tool === 'pen') {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lineWidth * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (['rectangle', 'circle', 'line'].includes(tool) && tempCanvas) {
      // Restore the canvas to the state before starting the shape
      ctx.putImageData(tempCanvas, 0, 0);

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;

      if (tool === 'rectangle') {
        const width = pos.x - startPos.x;
        const height = pos.y - startPos.y;
        ctx.strokeRect(startPos.x, startPos.y, width, height);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(
          Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
        );
        ctx.beginPath();
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setTempCanvas(null);
      saveToHistory();
    }
  };

  const addText = () => {
    if (textInput.trim() && textPosition) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');

      ctx.font = `${lineWidth * 8}px Arial`;
      ctx.fillStyle = color;
      ctx.fillText(textInput, textPosition.x, textPosition.y);

      saveToHistory();
      setTextInput('');
      setIsAddingText(false);
      setTextPosition(null);
    }
  };

  const cancelText = () => {
    setTextInput('');
    setIsAddingText(false);
    setTextPosition(null);
  };

  return (
    <div className="enhanced-drawing">
      <div className="drawing-toolbar">
        <div className="tool-group">
          <button
            onClick={() => setTool('pen')}
            className={tool === 'pen' ? 'tool-button active' : 'tool-button'}
            title="Pen"
          >
            <FaPen />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={tool === 'eraser' ? 'tool-button active' : 'tool-button'}
            title="Eraser"
          >
            <FaEraser />
          </button>
          <button
            onClick={() => setTool('rectangle')}
            className={tool === 'rectangle' ? 'tool-button active' : 'tool-button'}
            title="Rectangle"
          >
            <FaSquare />
          </button>
          <button
            onClick={() => setTool('circle')}
            className={tool === 'circle' ? 'tool-button active' : 'tool-button'}
            title="Circle"
          >
            <FaCircle />
          </button>
          <button
            onClick={() => setTool('line')}
            className={tool === 'line' ? 'tool-button active' : 'tool-button'}
            title="Line"
          >
            <FaMinus />
          </button>
          <button
            onClick={() => setTool('text')}
            className={tool === 'text' ? 'tool-button active' : 'tool-button'}
            title="Text"
          >
            <FaFont />
          </button>
        </div>

        <div className="tool-divider"></div>

        <div className="tool-group color-group">
          <label>Color:</label>
          <div className="color-palette">
            {colorPalette.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={color === c ? 'color-swatch active' : 'color-swatch'}
                style={{
                  backgroundColor: c,
                  border: c === '#ffffff' ? '1px solid #ccc' : 'none',
                }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-picker-input"
              title="Custom Color"
            />
          </div>
        </div>

        <div className="tool-divider"></div>

        <div className="tool-group">
          <label>Size:</label>
          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="size-select"
          >
            {lineWidths.map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </div>

        <div className="tool-divider"></div>

        <div className="tool-group">
          <button
            onClick={undo}
            disabled={historyStep <= 0}
            className="tool-button"
            title="Undo"
          >
            <FaUndo />
          </button>
          <button
            onClick={redo}
            disabled={historyStep >= history.length - 1}
            className="tool-button"
            title="Redo"
          >
            <FaRedo />
          </button>
          <button onClick={clearCanvas} className="tool-button" title="Clear">
            <FaTrash />
          </button>
          <button onClick={downloadCanvas} className="tool-button" title="Download">
            <FaDownload />
          </button>
        </div>
      </div>

      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="drawing-canvas"
        />
      </div>

      {isAddingText && (
        <div className="text-input-modal">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter text..."
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter') addText();
            }}
          />
          <div className="text-input-actions">
            <button onClick={addText} className="action-button primary">
              Add
            </button>
            <button onClick={cancelText} className="action-button">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedDrawing;
