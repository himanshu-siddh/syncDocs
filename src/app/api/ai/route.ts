import { createGoogle } from "@ai-sdk/google";
import { APICallError, generateText, RetryError } from "ai";
import { NextResponse } from "next/server";

import { aiPrompts } from "@/ai/prompts";
import { assertDocumentRole } from "@/server/authz";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import { aiActionSchema } from "@/validation/document";

const geminiModel =
  process.env.GEMINI_MODEL ??
  process.env.GEMINI_RESUME_CHAT_MODEL ??
  "gemini-2.5-flash";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Gemini is not configured",
          message: "Add GEMINI_API_KEY to your .env file and restart the dev server.",
        },
        { status: 503 },
      );
    }

    const google = createGoogle({ apiKey });

    const user = await requireUser();
    const body = await parseJson(request, aiActionSchema);

    if (!body.documentId.startsWith("local-")) {
      await assertDocumentRole(body.documentId, user.id);
    }

    const { text } = await generateText({
      model: google(geminiModel),
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

      if (
        message.includes("quota") ||
        message.includes("resource_exhausted") ||
        error.statusCode === 429
      ) {
        userMessage =
          "Gemini quota exceeded. Check your Google AI billing and rate limits, then try again.";
      } else if (
        message.includes("api key") ||
        message.includes("api_key") ||
        error.statusCode === 401 ||
        error.statusCode === 403
      ) {
        userMessage = "Invalid Gemini API key. Check GEMINI_API_KEY in your .env file.";
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
