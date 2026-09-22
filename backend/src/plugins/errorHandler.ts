import { FastifyError, FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError, ErrorCodes } from '../../../shared/src/index.js';
import { ApiErrorResponse } from '../../../shared/src/types/api.js';

const errorHandlerPluginAsync: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    const timestamp = new Date().toISOString();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    // 1. Custom AppError instances
    if (error instanceof AppError) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        meta: {
          timestamp,
          requestId,
        },
      };

      return reply.status(error.statusCode).send(response);
    }

    // 2. Fastify Schema Validation Errors
    if ('validation' in error && error.validation) {
      const details = error.validation.map((v) => ({
        field:
          v.instancePath || (v.params as { missingProperty?: string })?.missingProperty || 'body',
        issue: v.message || 'Validation constraint violated',
      }));

      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request payload validation failed',
          details,
        },
        meta: {
          timestamp,
          requestId,
        },
      };

      return reply.status(400).send(response);
    }

    // 3. Fastify Not Found error
    if ('statusCode' in error && error.statusCode === 404) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: error.message || 'Route not found',
          details: [],
        },
        meta: {
          timestamp,
          requestId,
        },
      };

      return reply.status(404).send(response);
    }

    // 4. Unexpected unhandled errors
    request.log.error({ err: error, requestId }, 'Unhandled server error');

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected internal server error occurred',
        details: [],
      },
      meta: {
        timestamp,
        requestId,
      },
    };

    return reply.status(500).send(response);
  });

  // 404 Catch-All Handler
  fastify.setNotFoundHandler((request, reply) => {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: `Endpoint ${request.method} ${request.url} does not exist`,
        details: [],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    };

    return reply.status(404).send(response);
  });
};

export const errorHandlerPlugin = fp(errorHandlerPluginAsync, {
  name: 'app-error-handler-plugin',
});
