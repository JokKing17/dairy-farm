type Context = Record<string, unknown>;

export function logServerError(event: string, error: unknown, context: Context = {}) {
  const payload = {
    level: "error",
    event,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error && process.env.NODE_ENV !== "production" ? error.stack : undefined,
    ...context,
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}
