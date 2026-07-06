const retryableCodes = new Set(["EAI_AGAIN", "P1001"]);

function getRetryCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const maybeError = error as {
    code?: string;
    cause?: { code?: string };
    meta?: { driverAdapterError?: { cause?: { kind?: string } } };
  };

  return (
    maybeError.code ??
    maybeError.cause?.code ??
    maybeError.meta?.driverAdapterError?.cause?.kind ??
    null
  );
}

export function isRetryableDatabaseError(error: unknown) {
  const code = getRetryCode(error);
  const message = error instanceof Error ? error.message : "";

  return Boolean(
    (code && retryableCodes.has(code)) ||
      message.includes("EAI_AGAIN") ||
      message.includes("Can't reach database server"),
  );
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableDatabaseError(error) || attempt === attempts - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  throw lastError;
}
