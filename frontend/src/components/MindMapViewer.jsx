import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';

const MindMapViewer = ({ content }) => {
  // Parse the mindmap content from AI
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    try {
      // Try to parse as JSON first
      const data = JSON.parse(content);
      return data;
    } catch {
      // If not JSON, parse from text format
      return parseTextMindMap(content);
    }
  }, [content]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="mindmap-viewer">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-right"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

// Helper function to parse text-based mindmap into nodes and edges
const parseTextMindMap = (text) => {
  const lines = text.split('\n').filter((line) => line.trim());
  const nodes = [];
  const edges = [];
  let nodeId = 0;

  // Simple parsing: indentation-based hierarchy
  const nodeStack = [];
  let currentLevel = 0;

  lines.forEach((line, index) => {
    // Count leading spaces/tabs for indentation
    const match = line.match(/^(\s*)/);
    const indent = match ? match[1].length : 0;
    const level = Math.floor(indent / 2);

    // Clean the text
    const text = line.trim().replace(/^[-*•]\s*/, '');

    if (!text) return;

    const id = `node-${nodeId++}`;
    const node = {
      id,
      data: { label: text },
      position: { x: level * 250, y: index * 100 },
      type: level === 0 ? 'input' : 'default',
      style: {
        background: level === 0 ? '#6366f1' : level === 1 ? '#8b5cf6' : '#a78bfa',
        color: 'white',
        border: '2px solid #4338ca',
        borderRadius: '8px',
        padding: '10px',
        fontSize: level === 0 ? '16px' : '14px',
        fontWeight: level === 0 ? 'bold' : 'normal',
      },
    };

    nodes.push(node);

    // Track hierarchy
    if (level > currentLevel) {
      nodeStack.push(id);
    } else if (level < currentLevel) {
      nodeStack.splice(level + 1);
      nodeStack.push(id);
    } else {
      nodeStack[level] = id;
    }

    // Create edge to parent
    if (level > 0 && nodeStack[level - 1]) {
      edges.push({
        id: `edge-${edges.length}`,
        source: nodeStack[level - 1],
        target: id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#8b5cf6' },
      });
    }

    currentLevel = level;
  });

  // If no nodes were created, create a default one
  if (nodes.length === 0) {
    nodes.push({
      id: 'node-0',
      data: { label: 'Mind Map' },
      position: { x: 250, y: 50 },
      type: 'input',
      style: {
        background: '#6366f1',
        color: 'white',
        border: '2px solid #4338ca',
        borderRadius: '8px',
        padding: '10px',
      },
    });
  }

  return { nodes, edges };
};

export default MindMapViewer;
