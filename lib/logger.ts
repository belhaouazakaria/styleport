type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  event: string;
  message: string;
  context?: Record<string, unknown>;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}

function write(level: LogLevel, payload: LogPayload) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event: payload.event,
    message: payload.message,
    ...(payload.context ? { context: payload.context } : {}),
  };

  const serialized = JSON.stringify(entry);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export function logInfo(event: string, message: string, context?: Record<string, unknown>) {
  write("info", { event, message, context });
}

export function logWarn(event: string, message: string, context?: Record<string, unknown>) {
  write("warn", { event, message, context });
}

export function logError(
  event: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
) {
  write("error", {
    event,
    message,
    context: {
      ...(context || {}),
      ...(error ? { error: normalizeError(error) } : {}),
    },
  });
}

