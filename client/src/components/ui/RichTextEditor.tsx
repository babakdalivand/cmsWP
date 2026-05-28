import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState } from 'react';
import EditorToolbar from './EditorToolbar';
import { Code2, X, CheckCheck } from 'lucide-react';

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
function sanitizeHtml(raw: string): string {
  // Strip markdown code fences: ```html ... ``` or ``` ... ```
  let html = raw.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '');
  // Remove <style> and <script> blocks
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Unwrap <div> containers
  html = html.replace(/<\/?div[^>]*>/gi, '');
  // Strip class, id, style, dir attributes
  html = html.replace(/\s+(class|id|style|dir|data-[a-z-]+)="[^"]*"/gi, '');
  html = html.replace(/\s+(class|id|style|dir|data-[a-z-]+)='[^']*'/gi, '');
  // Unwrap <span>, <figure>, <figcaption>
  html = html.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
  html = html.replace(/<\/?figure[^>]*>/gi, '');
  html = html.replace(/<\/?figcaption[^>]*>/gi, '');
  // Unwrap semantic containers
  html = html.replace(/<\/?(header|footer|section|article|aside|nav|main)[^>]*>/gi, '');
  return html.trim();
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'متن خود را اینجا بنویسید...',
  dir = 'rtl',
  minHeight = 220,
}: Props) {
  const [showHtmlImport, setShowHtmlImport] = useState(false);
  const [rawHtml, setRawHtml] = useState('');

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
      transformPastedHTML: (html) => sanitizeHtml(html),
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

  function importHtml() {
    if (!editor || !rawHtml.trim()) return;
    const clean = sanitizeHtml(rawHtml);
    editor.commands.setContent(clean, { emitUpdate: true } as any);
    onChange(clean);
    setRawHtml('');
    setShowHtmlImport(false);
  }

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-surface focus-within:border-blue/40 transition-colors">
      <EditorToolbar editor={editor} />

      {/* HTML Import bar */}
      <div className="flex justify-end px-2 pt-1 pb-0">
        <button
          type="button"
          onClick={() => setShowHtmlImport(v => !v)}
          title="وارد کردن HTML خام"
          className="flex items-center gap-1 text-xs text-label hover:text-blue transition-colors px-2 py-1 rounded"
        >
          <Code2 size={13} />
          وارد کردن HTML
        </button>
      </div>

      {showHtmlImport && (
        <div className="mx-3 mb-2 border border-orange-400/40 rounded-xl bg-orange-50/10 p-3">
          <p className="text-xs text-label mb-2">HTML خام (div، style و class ها حذف می‌شوند):</p>
          <textarea
            value={rawHtml}
            onChange={e => setRawHtml(e.target.value)}
            rows={5}
            dir="ltr"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono text-text resize-y focus:outline-none focus:border-blue"
            placeholder="<h2>عنوان</h2><p>...</p>"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={importHtml}
              className="flex items-center gap-1 text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors"
            >
              <CheckCheck size={13} /> وارد کردن
            </button>
            <button
              type="button"
              onClick={() => { setShowHtmlImport(false); setRawHtml(''); }}
              className="flex items-center gap-1 text-xs text-label hover:text-text px-2 py-1.5 rounded-lg"
            >
              <X size={13} /> انصراف
            </button>
          </div>
        </div>
      )}

      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
