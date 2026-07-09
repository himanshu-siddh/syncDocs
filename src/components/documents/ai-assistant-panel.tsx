"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Loader2, Sparkles } from "lucide-react";

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

const actionLabels: Record<AiAction, string> = {
  grammar: "Grammar",
  rewrite: "Rewrite",
  summarize: "Summarize",
  title: "Title",
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
  const [loadingAction, setLoadingAction] = useState<AiAction | null>(null);

  const runAction = async (action: AiAction) => {
    const sourceText = editor?.getText().trim();

    if (!sourceText) {
      setResult("Add document text before using AI.");
      return;
    }

    setLoadingAction(action);
    setResult("");

    try {
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
        let errorMessage = "AI request failed. Check your Gemini configuration.";

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
    } finally {
      setLoadingAction(null);
    }
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
          {(Object.keys(actionLabels) as AiAction[]).map((action) => {
            const isLoading = loadingAction === action;

            return (
              <Button
                key={action}
                type="button"
                variant="secondary"
                disabled={loadingAction !== null || !editor}
                onClick={() => void runAction(action)}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {actionLabels[action]}
              </Button>
            );
          })}
        </div>
        <Textarea
          value={result}
          readOnly
          placeholder={loadingAction ? "Generating..." : "AI output appears here."}
        />
        {!canWrite ? <p className="text-xs text-zinc-500 dark:text-zinc-300">Viewer role can run AI but cannot apply edits.</p> : null}
      </CardContent>
    </Card>
  );
}
