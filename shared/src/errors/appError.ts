import { ErrorCode, ErrorCodes } from './errorCodes.js';

export interface ErrorDetail {
  field?: string;
  issue: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: ErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    details: ErrorDetail[] = [],
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message: string,
    details: ErrorDetail[] = [],
    code: ErrorCode = ErrorCodes.VALIDATION_ERROR,
  ): AppError {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(
    message: string = 'Authentication required',
    code: ErrorCode = ErrorCodes.UNAUTHORIZED,
  ): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(
    message: string = 'Access denied',
    code: ErrorCode = ErrorCodes.FORBIDDEN,
  ): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(
    message: string = 'Requested resource not found',
    code: ErrorCode = ErrorCodes.NOT_FOUND,
  ): AppError {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code: ErrorCode = ErrorCodes.CONFLICT): AppError {
    return new AppError(message, 409, code);
  }

  static tooManyRequests(
    message: string = 'Rate limit exceeded. Please try again later.',
  ): AppError {
    return new AppError(message, 429, ErrorCodes.RATE_LIMITED);
  }

  static internal(message: string = 'An unexpected internal error occurred'): AppError {
    return new AppError(message, 500, ErrorCodes.INTERNAL_ERROR, [], false);
  }

  static serviceUnavailable(message: string = 'Service temporarily unavailable'): AppError {
    return new AppError(message, 503, ErrorCodes.SERVICE_UNAVAILABLE, [], true);
  }
}
