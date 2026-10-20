import type { CheckId } from "./types";

export interface EngineErrorOptions {
  checkId: CheckId;
  cause?: unknown;
}

export class NavigationError extends Error {
  readonly checkId: CheckId;
  override readonly cause?: unknown;

  constructor(message: string, checkIdOrOptions: CheckId | EngineErrorOptions, cause?: unknown) {
    super(message);
    this.name = "NavigationError";
    if (typeof checkIdOrOptions === "object" && checkIdOrOptions !== null) {
      this.checkId = checkIdOrOptions.checkId;
      this.cause = checkIdOrOptions.cause ?? cause;
    } else {
      this.checkId = checkIdOrOptions;
      this.cause = cause;
    }
    Object.setPrototypeOf(this, NavigationError.prototype);
  }
}

export class CheckTimeoutError extends Error {
  readonly checkId: CheckId;
  override readonly cause?: unknown;

  constructor(message: string, checkIdOrOptions: CheckId | EngineErrorOptions, cause?: unknown) {
    super(message);
    this.name = "CheckTimeoutError";
    if (typeof checkIdOrOptions === "object" && checkIdOrOptions !== null) {
      this.checkId = checkIdOrOptions.checkId;
      this.cause = checkIdOrOptions.cause ?? cause;
    } else {
      this.checkId = checkIdOrOptions;
      this.cause = cause;
    }
    Object.setPrototypeOf(this, CheckTimeoutError.prototype);
  }
}

export class CheckFailedError extends Error {
  readonly checkId: CheckId;
  override readonly cause?: unknown;

  constructor(message: string, checkIdOrOptions: CheckId | EngineErrorOptions, cause?: unknown) {
    super(message);
    this.name = "CheckFailedError";
    if (typeof checkIdOrOptions === "object" && checkIdOrOptions !== null) {
      this.checkId = checkIdOrOptions.checkId;
      this.cause = checkIdOrOptions.cause ?? cause;
    } else {
      this.checkId = checkIdOrOptions;
      this.cause = cause;
    }
    Object.setPrototypeOf(this, CheckFailedError.prototype);
  }
}
