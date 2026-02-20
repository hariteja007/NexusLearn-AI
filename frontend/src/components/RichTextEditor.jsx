import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  FaBold,
  FaItalic,
  FaUnderline,
  FaStrikethrough,
  FaHighlighter,
  FaHeading,
  FaListUl,
  FaListOl,
  FaAlignLeft,
  FaAlignCenter,
  FaAlignRight,
  FaAlignJustify,
  FaImage,
  FaLink,
  FaTable,
  FaUndo,
  FaRedo,
  FaCode,
  FaQuoteRight,
} from 'react-icons/fa';

const MenuBar = ({ editor }) => {
  if (!editor) {
    return null;
  }

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('http://localhost:8000/upload-image', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            editor.chain().focus().setImage({ src: data.url }).run();
          } else {
            alert('Failed to upload image');
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          alert('Error uploading image');
        }
      }
    };

    input.click();
  };

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
    }
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const highlightColors = [
    { color: '#fef08a', label: 'Yellow' },
    { color: '#86efac', label: 'Green' },
    { color: '#fca5a5', label: 'Red' },
    { color: '#a5b4fc', label: 'Blue' },
    { color: '#f9a8d4', label: 'Pink' },
    { color: '#d8b4fe', label: 'Purple' },
  ];

  return (
    <div className="editor-menu-bar">
      {/* History */}
      <div className="menu-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="menu-button"
          title="Undo"
        >
          <FaUndo />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="menu-button"
          title="Redo"
        >
          <FaRedo />
        </button>
      </div>

      <div className="menu-divider"></div>

      {/* Text Formatting */}
      <div className="menu-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'menu-button active' : 'menu-button'}
          title="Bold"
        >
          <FaBold />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'menu-button active' : 'menu-button'}
          title="Italic"
        >
          <FaItalic />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'menu-button active' : 'menu-button'}
          title="Underline"
        >
          <FaUnderline />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'menu-button active' : 'menu-button'}
          title="Strikethrough"
        >
          <FaStrikethrough />
        </button>
      </div>

      <div className="menu-divider"></div>

      {/* Headings */}
      <div className="menu-group">
        <select
          onChange={(e) => {
            const level = parseInt(e.target.value);
            if (level === 0) {
              editor.chain().focus().setParagraph().run();
            } else {
              editor.chain().focus().toggleHeading({ level }).run();
            }
          }}
          value={
            editor.isActive('heading', { level: 1 })
              ? 1
              : editor.isActive('heading', { level: 2 })
              ? 2
              : editor.isActive('heading', { level: 3 })
              ? 3
              : 0
          }
          className="menu-select"
        >
          <option value="0">Normal</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
      </div>

      <div className="menu-divider"></div>

      {/* Highlight Colors */}
      <div className="menu-group">
        <div className="highlight-dropdown">
          <button className="menu-button" title="Highlight">
            <FaHighlighter />
          </button>
          <div className="highlight-colors">
            <button
              onClick={() => editor.chain().focus().unsetHighlight().run()}
              className="color-button no-color"
            >
              None
            </button>
            {highlightColors.map((item) => (
              <button
                key={item.color}
                onClick={() => editor.chain().focus().toggleHighlight({ color: item.color }).run()}
                className="color-button"
                style={{ backgroundColor: item.color }}
                title={item.label}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="menu-divider"></div>

      {/* Lists */}
      <div className="menu-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'menu-button active' : 'menu-button'}
          title="Bullet List"
        >
          <FaListUl />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'menu-button active' : 'menu-button'}
          title="Numbered List"
        >
          <FaListOl />
        </button>
      </div>

      <div className="menu-divider"></div>

      {/* Alignment */}
      <div className="menu-group">
        <button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={editor.isActive({ textAlign: 'left' }) ? 'menu-button active' : 'menu-button'}
          title="Align Left"
        >
          <FaAlignLeft />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={editor.isActive({ textAlign: 'center' }) ? 'menu-button active' : 'menu-button'}
          title="Align Center"
        >
          <FaAlignCenter />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={editor.isActive({ textAlign: 'right' }) ? 'menu-button active' : 'menu-button'}
          title="Align Right"
        >
          <FaAlignRight />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          className={editor.isActive({ textAlign: 'justify' }) ? 'menu-button active' : 'menu-button'}
          title="Justify"
        >
          <FaAlignJustify />
        </button>
      </div>

      <div className="menu-divider"></div>

      {/* Block Elements */}
      <div className="menu-group">
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'menu-button active' : 'menu-button'}
          title="Code Block"
        >
          <FaCode />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'menu-button active' : 'menu-button'}
          title="Quote"
        >
          <FaQuoteRight />
        </button>
      </div>

      <div className="menu-divider"></div>

      {/* Insert Elements */}
      <div className="menu-group">
        <button onClick={addLink} className="menu-button" title="Insert Link">
          <FaLink />
        </button>
      </div>
    </div>
  );
};

const RichTextEditor = ({ content, onChange }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) {
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
      },
    },
  });

  useEffect(() => {
    if (editor && content && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="rich-text-editor">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
