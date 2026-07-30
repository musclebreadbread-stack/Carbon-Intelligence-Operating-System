/**
 * Server-action result contract.
 *
 * Deliberately *not* a `'use server'` module: a file with that directive may only
 * export async functions, and these are types and pure helpers.
 *
 * `ActionState` is a discriminated union shaped for `useActionState`, so a form can
 * render field-level errors without a second round trip. Message *keys* are
 * returned alongside the English message so the UI can localise to Korean without
 * the action layer knowing anything about the UI language.
 */

import type { ZodError } from "zod";

import { AppError } from "@/lib/core/errors";
import { fieldErrors } from "@/lib/validation";

/** Stable codes the UI switches on. */
export const ACTION_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "DEMO_MODE",
  "CALCULATION_ERROR",
  "LLM_ERROR",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;
export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

export type ActionSuccess<T> = {
  readonly status: "success";
  readonly data: T;
  /** English message; pair with `messageKey` for localisation. */
  readonly message: string;
  readonly messageKey: string;
};

export type ActionError = {
  readonly status: "error";
  readonly code: ActionErrorCode;
  readonly message: string;
  readonly messageKey: string;
  /** Field-level messages keyed by dotted path, for `useActionState` forms. */
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  /** Non-sensitive detail for the error panel. */
  readonly details?: Readonly<Record<string, unknown>>;
};

export type ActionState<T = unknown> = ActionSuccess<T> | ActionError;

/** Neutral state for `useActionState`'s initial value. */
export const IDLE_ACTION_STATE: ActionError = {
  status: "error",
  code: "INTERNAL_ERROR",
  message: "",
  messageKey: "action.idle",
};

export function isActionSuccess<T>(state: ActionState<T>): state is ActionSuccess<T> {
  return state.status === "success";
}

export function actionSuccess<T>(
  data: T,
  message: string,
  messageKey: string,
): ActionSuccess<T> {
  return { status: "success", data, message, messageKey };
}

export function actionError(
  code: ActionErrorCode,
  message: string,
  messageKey: string,
  extra: {
    readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
    readonly details?: Readonly<Record<string, unknown>>;
  } = {},
): ActionError {
  return { status: "error", code, message, messageKey, ...extra };
}

/** Turns a zod failure into field-level errors the form can render inline. */
export function validationFailure(error: ZodError): ActionError {
  return actionError(
    "VALIDATION_ERROR",
    "The submitted values are not valid",
    "action.error.validation",
    { fieldErrors: fieldErrors(error) },
  );
}

/**
 * The demo-mode refusal. Returned rather than thrown, so a form shows an
 * explanation instead of an error boundary.
 */
export function demoModeFailure(): ActionError {
  return actionError(
    "DEMO_MODE",
    "No database is configured, so this change was not saved. Displayed figures are still computed from the bundled sample data.",
    "action.error.demoMode",
  );
}

/** Maps a domain `AppError` code onto an `ActionErrorCode`. */
export function actionCodeFor(error: AppError): ActionErrorCode {
  switch (error.code) {
    case "UNAUTHORIZED":
      return "UNAUTHORIZED";
    case "VALIDATION_ERROR":
      return "VALIDATION_ERROR";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "CALCULATION_ERROR":
      return "CALCULATION_ERROR";
    case "TOOL_INPUT_INVALID":
      return "VALIDATION_ERROR";
    case "TOOL_NOT_FOUND":
      return "NOT_FOUND";
    case "MCP_ERROR":
      return "INTERNAL_ERROR";
    case "LLM_RATE_LIMITED":
      return "RATE_LIMITED";
    case "LLM_UNAUTHORIZED":
    case "LLM_TIMEOUT":
    case "LLM_INVALID_RESPONSE":
    case "LLM_NOT_CONFIGURED":
      return "LLM_ERROR";
    default:
      return "INTERNAL_ERROR";
  }
}

/**
 * Converts any throwable into an `ActionError`.
 *
 * An unexpected error is reported without its message, because an action's return
 * value is serialised to the client and a raw database error can leak schema
 * details. The message is logged server-side instead.
 */
export function toActionError(error: unknown): ActionError {
  if (error instanceof AppError) {
    return actionError(actionCodeFor(error), error.message, `action.error.${error.code}`, {
      details: error.details as Readonly<Record<string, unknown>> | undefined,
    });
  }
  console.error("[action] unhandled error", error);
  return actionError(
    "INTERNAL_ERROR",
    "Something went wrong. The change was not saved.",
    "action.error.internal",
  );
}
