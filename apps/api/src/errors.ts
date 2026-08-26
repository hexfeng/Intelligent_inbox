export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly retryable = false
  ) {
    super(message);
  }
}

export function assertFound<T>(value: T | null | undefined, code: string, message: string): T {
  if (value == null) throw new AppError(code, message, 404, false);
  return value;
}
