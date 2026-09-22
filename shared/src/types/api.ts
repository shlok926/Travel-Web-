import { ErrorCode } from '../errors/errorCodes.js';
import { ErrorDetail } from '../errors/appError.js';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    requestId?: string;
    [key: string]: unknown;
  };
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  meta: {
    timestamp: string;
    requestId?: string;
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
  };
  meta: {
    timestamp: string;
    requestId?: string;
  };
}
