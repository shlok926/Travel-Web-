import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { EnvConfig } from '../config/env.js';

export interface LoggingOptions {
  config: EnvConfig;
}

const loggingPluginAsync: FastifyPluginAsync<LoggingOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const isDev = options.config.NODE_ENV === 'development';

  // Request correlation hook
  fastify.addHook('onRequest', async (request, reply) => {
    const reqId = request.headers['x-request-id'] || request.id;
    reply.header('x-request-id', reqId);
  });

  // Sensitive field redaction helper
  if (isDev) {
    fastify.log.info('Structured Pino logging initialized in development mode');
  }
};

export const loggingPlugin = fp(loggingPluginAsync, {
  name: 'app-logging-plugin',
});
