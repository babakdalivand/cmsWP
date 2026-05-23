import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';
import EditorToolbar from './EditorToolbar';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
  minHeight?: number;
}

/**
 * Tiptap-based rich text editor.
 *  - Output: clean HTML compatible with WordPress (saved to content_fa / content_en)
 *  - Toolbar: H1/H2/H3, bold/italic/strike/code, link, lists, quote, hr, undo/redo, clear
 *  - Persian / RTL aware
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'متن خود را اینجا بنویسید...',
  dir = 'rtl',
  minHeight = 220,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap returns "<p></p>" for empty content — treat as empty string
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        dir,
        class: 'prose-tiptap',
      },
    },
  });

  // Sync external value changes back into the editor (e.g. after AI generation)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || '';
    if (current === incoming) return;
    // The "false" arg skips emitting an update event (avoids onChange loop)
    editor.commands.setContent(incoming, { emitUpdate: false } as any);
  }, [value, editor]);

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-surface focus-within:border-blue/40 transition-colors">
      <EditorToolbar editor={editor} />
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
