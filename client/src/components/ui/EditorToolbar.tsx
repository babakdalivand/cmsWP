import { Editor } from '@tiptap/react';
import {
  Bold, Italic, Strikethrough, Code, Link as LinkIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Undo2, Redo2, Eraser,
} from 'lucide-react';

interface Props { editor: Editor | null }

export default function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  const btn = (
    icon: React.ReactNode,
    onClick: () => void,
    active = false,
    title = ''
  ) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}  // keep focus in editor
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-blue text-white'
          : 'text-text-muted hover:text-text hover:bg-blue/10'
      }`}
    >
      {icon}
    </button>
  );

  const sep = <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />;

  function promptLink() {
    const previous = editor!.getAttributes('link').href || '';
    const url = window.prompt('آدرس لینک:', previous);
    if (url === null) return;
    if (url === '') {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    // Normalize
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    editor!.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank' }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-surface-2 rounded-t-2xl">
      {btn(<Heading1 size={16} />, () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        editor.isActive('heading', { level: 1 }), 'تیتر بزرگ')}
      {btn(<Heading2 size={16} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        editor.isActive('heading', { level: 2 }), 'تیتر متوسط')}
      {btn(<Heading3 size={16} />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        editor.isActive('heading', { level: 3 }), 'تیتر کوچک')}

      {sep}

      {btn(<Bold size={16} />,         () => editor.chain().focus().toggleBold().run(),
        editor.isActive('bold'), 'پررنگ (Ctrl+B)')}
      {btn(<Italic size={16} />,       () => editor.chain().focus().toggleItalic().run(),
        editor.isActive('italic'), 'مورب (Ctrl+I)')}
      {btn(<Strikethrough size={16} />,() => editor.chain().focus().toggleStrike().run(),
        editor.isActive('strike'), 'خط‌خورده')}
      {btn(<Code size={16} />,         () => editor.chain().focus().toggleCode().run(),
        editor.isActive('code'), 'کد inline')}

      {sep}

      {btn(<LinkIcon size={16} />,     promptLink,
        editor.isActive('link'), 'افزودن/ویرایش لینک')}

      {sep}

      {btn(<List size={16} />,         () => editor.chain().focus().toggleBulletList().run(),
        editor.isActive('bulletList'), 'لیست نشانه‌دار')}
      {btn(<ListOrdered size={16} />,  () => editor.chain().focus().toggleOrderedList().run(),
        editor.isActive('orderedList'), 'لیست شماره‌دار')}
      {btn(<Quote size={16} />,        () => editor.chain().focus().toggleBlockquote().run(),
        editor.isActive('blockquote'), 'نقل قول')}
      {btn(<Minus size={16} />,        () => editor.chain().focus().setHorizontalRule().run(),
        false, 'خط افقی')}

      {sep}

      {btn(<Undo2 size={16} />,        () => editor.chain().focus().undo().run(),
        false, 'بازگشت (Ctrl+Z)')}
      {btn(<Redo2 size={16} />,        () => editor.chain().focus().redo().run(),
        false, 'تکرار')}
      {btn(<Eraser size={16} />,
        () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
        false, 'پاک کردن قالب‌بندی')}
    </div>
  );
}
