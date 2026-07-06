import { openai } from "@ai-sdk/openai";
import { APICallError, generateText, RetryError } from "ai";
import { NextResponse } from "next/server";

import { aiPrompts } from "@/ai/prompts";
import { assertDocumentRole } from "@/server/authz";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import { aiActionSchema } from "@/validation/document";

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        {
          error: "OpenAI is not configured",
          message: "Add OPENAI_API_KEY to your .env file and restart the dev server.",
        },
        { status: 503 },
      );
    }

    const user = await requireUser();
    const body = await parseJson(request, aiActionSchema);

    if (!body.documentId.startsWith("local-")) {
      await assertDocumentRole(body.documentId, user.id);
    }

    const { text } = await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      system: aiPrompts[body.action],
      prompt: body.text,
      temperature: body.action === "title" ? 0.2 : 0.4,
      // Quota and API-key failures are user-actionable; do not hide them
      // behind slow retry loops that eventually look like generic 500s.
      maxRetries: 0,
    });

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      const message = error.message.toLowerCase();
      let userMessage = error.message;

      if (message.includes("insufficient_quota") || error.statusCode === 429) {
        userMessage =
          "OpenAI quota exceeded. Add billing or credits at platform.openai.com, then try again.";
      } else if (message.includes("invalid_api_key") || error.statusCode === 401) {
        userMessage = "Invalid OpenAI API key. Check OPENAI_API_KEY in your .env file.";
      }

      return NextResponse.json(
        {
          error: "AI provider request failed",
          message: userMessage,
          code: error.data,
        },
        { status: error.statusCode ?? 502 },
      );
    }

    if (RetryError.isInstance(error) && APICallError.isInstance(error.lastError)) {
      return NextResponse.json(
        {
          error: "AI provider request failed",
          message: error.lastError.message,
          code: error.lastError.data,
        },
        { status: error.lastError.statusCode ?? 502 },
      );
    }

    return handleRouteError(error);
  }
}
