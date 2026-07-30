/**
 * Application error hierarchy.
 *
 * Every error carries a stable machine-readable `code` so that transport layers
 * (server actions, route handlers) can map errors to responses without string
 * matching on messages.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super("VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super("NOT_FOUND", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authorized", details?: ErrorDetails) {
    super("UNAUTHORIZED", message, details);
  }
}

export class CalculationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super("CALCULATION_ERROR", message, details);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
