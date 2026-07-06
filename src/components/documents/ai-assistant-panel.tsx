"use client";

import { useState, useTransition } from "react";
import type { Editor } from "@tiptap/react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type AiAction = "grammar" | "rewrite" | "summarize" | "title";

type AiAssistantPanelProps = {
  documentId: string;
  editor: Editor | null;
  canWrite: boolean;
  onTitleGenerated: (title: string) => void;
};

function textToParagraphHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</p>`)
    .join("");
}

export function AiAssistantPanel({
  documentId,
  editor,
  canWrite,
  onTitleGenerated,
}: AiAssistantPanelProps) {
  const [result, setResult] = useState("");
  const [pending, startTransition] = useTransition();

  const runAction = (action: AiAction) => {
    startTransition(async () => {
      const sourceText = editor?.getText().trim();

      if (!sourceText) {
        setResult("Add document text before using AI.");
        return;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId,
          action,
          text: sourceText,
        }),
      });

      if (!response.ok) {
        let errorMessage = "AI request failed. Check your OpenAI configuration.";

        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          errorMessage = payload.message ?? payload.error ?? errorMessage;
        } catch {
          // Keep the generic fallback when the body is not JSON.
        }

        setResult(errorMessage);
        return;
      }

      const payload = (await response.json()) as { text: string };
      setResult(payload.text);

      if ((action === "grammar" || action === "rewrite") && canWrite) {
        editor?.commands.setContent(textToParagraphHtml(payload.text));
      }

      if (action === "title") {
        onTitleGenerated(payload.text);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" disabled={pending || !editor} onClick={() => runAction("grammar")}>
            Grammar
          </Button>
          <Button type="button" variant="secondary" disabled={pending || !editor} onClick={() => runAction("rewrite")}>
            Rewrite
          </Button>
          <Button type="button" variant="secondary" disabled={pending || !editor} onClick={() => runAction("summarize")}>
            Summarize
          </Button>
          <Button type="button" variant="secondary" disabled={pending || !editor} onClick={() => runAction("title")}>
            Title
          </Button>
        </div>
        <Textarea value={result} readOnly placeholder="AI output appears here." />
        {!canWrite ? <p className="text-xs text-zinc-500 dark:text-zinc-300">Viewer role can run AI but cannot apply edits.</p> : null}
      </CardContent>
    </Card>
  );
}
