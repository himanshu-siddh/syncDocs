"use client";

import Collaboration from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading1, Heading2, Italic, List, Quote } from "lucide-react";
import * as Y from "yjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  ydoc: Y.Doc;
  editable: boolean;
  onEditorReady?: (editor: NonNullable<ReturnType<typeof useEditor>>) => void;
};

export function RichTextEditor({ ydoc, editable, onEditorReady }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-zinc max-w-none rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-sm focus-within:ring-2 focus-within:ring-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus-within:ring-zinc-600",
      },
    },
    onCreate({ editor: createdEditor }) {
      onEditorReady?.(createdEditor);
    },
  });

  if (!editor) {
    return <div className="min-h-[60vh] rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-800" />;
  }

  editor.setEditable(editable);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-white p-2 text-zinc-950 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50">
        {[
          {
            label: "Bold",
            icon: Bold,
            active: editor.isActive("bold"),
            action: () => editor.chain().focus().toggleBold().run(),
          },
          {
            label: "Italic",
            icon: Italic,
            active: editor.isActive("italic"),
            action: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: "Heading 1",
            icon: Heading1,
            active: editor.isActive("heading", { level: 1 }),
            action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
          },
          {
            label: "Heading 2",
            icon: Heading2,
            active: editor.isActive("heading", { level: 2 }),
            action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          },
          {
            label: "Bullet list",
            icon: List,
            active: editor.isActive("bulletList"),
            action: () => editor.chain().focus().toggleBulletList().run(),
          },
          {
            label: "Quote",
            icon: Quote,
            active: editor.isActive("blockquote"),
            action: () => editor.chain().focus().toggleBlockquote().run(),
          },
        ].map((item) => (
          <Button
            key={item.label}
            type="button"
            size="sm"
            variant="ghost"
            disabled={!editable}
            className={cn(item.active && "bg-zinc-100 dark:bg-zinc-600")}
            onClick={item.action}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
      {!editable ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-300">You have viewer access. Editing is disabled.</p>
      ) : null}
    </div>
  );
}
