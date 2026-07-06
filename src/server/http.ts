import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId || !session.user?.email) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
    id: userId,
    email: session.user.email,
    name: session.user.name ?? session.user.email,
  };
}

export async function parseJson<T>(request: Request, schema: { parse: (value: unknown) => T }) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > 2_500_000) {
    throw new Response("Request body is too large", { status: 413 });
  }

  try {
    return schema.parse(await request.json());
  } catch (error) {
    return Promise.reject(
      new Response(error instanceof Error ? error.message : "Invalid request body", {
        status: 400,
      }),
    );
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  console.error(error);
  return new Response("Internal Server Error", { status: 500 });
}
