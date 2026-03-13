import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useEffect, useRef } from "react";

interface TiptapEditorProps {
  /** Markdown 格式的内容 */
  content: string;
  /** 内容变化回调，返回 Markdown 格式 */
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export function TiptapEditor({
  content,
  onChange,
  editable = true,
  placeholder = "开始输入...",
}: TiptapEditorProps) {
  // 用于跟踪上一次的内容，避免无限循环
  // 初始化为 null，确保首次渲染时会设置内容
  const lastContentRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      // Markdown 扩展
      Markdown,
    ],
    // 初始内容为空，稍后通过 effect 设置
    content: "",
    editable,
    editorProps: {
      attributes: {
        class: "tiptap-editor-content",
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      if (onChange) {
        // 使用 MarkdownManager 将内容序列化为 Markdown
        const markdownManager = editor.storage.markdown?.manager;
        if (markdownManager) {
          const markdown = markdownManager.serialize(editor.getJSON());
          lastContentRef.current = markdown;
          onChange(markdown);
        } else {
          // 降级到 HTML
          onChange(editor.getHTML());
        }
      }
    },
  });

  // 初始化和更新内容
  useEffect(() => {
    if (!editor) return;

    // 如果内容没有变化，不需要更新
    if (content === lastContentRef.current) return;

    lastContentRef.current = content;

    // 使用 MarkdownManager 解析 Markdown 内容
    const markdownManager = editor.storage.markdown?.manager;
    if (markdownManager && content) {
      try {
        const jsonContent = markdownManager.parse(content);
        editor.commands.setContent(jsonContent);
      } catch (e) {
        console.error("解析 Markdown 失败:", e);
        // 降级：直接作为纯文本处理
        editor.commands.setContent(`<p>${content}</p>`);
      }
    } else if (content) {
      // 没有 MarkdownManager 时，直接设置内容
      editor.commands.setContent(content);
    } else {
      editor.commands.clearContent();
    }
  }, [content, editor]);

  return (
    <div className="tiptap-editor-wrapper">
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  );
}

export default TiptapEditor;
