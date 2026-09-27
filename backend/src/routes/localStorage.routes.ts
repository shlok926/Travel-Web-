import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IStorageService, LocalStorageService } from '../infrastructure/storage/index.js';
import { EnvConfig } from '../config/env.js';
import { AppError, ErrorCodes } from '../../../shared/src/index.js';

export interface LocalStorageRoutesOptions {
  storage: IStorageService;
  config?: EnvConfig;
}

export const localStorageRoutes: FastifyPluginAsync<LocalStorageRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { storage, config } = options;

  // Development/Test only signed storage download handler
  fastify.get<{
    Params: { bucket: string; '*': string };
    Querystring: { expires?: string; signature?: string };
  }>('/:bucket/*', async (request, reply) => {
    // In production, local filesystem direct serving is strictly prohibited
    if (config?.NODE_ENV === 'production' || config?.STORAGE_DRIVER === 's3') {
      throw new AppError(
        'Direct local storage serving is disabled in this environment.',
        403,
        ErrorCodes.ACCESS_FORBIDDEN,
      );
    }

    const { bucket } = request.params;
    const rawKey = request.params['*'];
    const { expires, signature } = request.query;

    if (!rawKey || !bucket) {
      throw AppError.badRequest('Bucket and file key parameters are required');
    }

    const key = decodeURIComponent(rawKey);

    if (!expires || !signature) {
      throw new AppError(
        'Access denied: presigned URL requires valid expires and signature parameters.',
        403,
        ErrorCodes.ACCESS_FORBIDDEN,
      );
    }

    const expiresTimestamp = Number(expires);
    if (!Number.isFinite(expiresTimestamp)) {
      throw new AppError('Invalid expires parameter format.', 400, ErrorCodes.VALIDATION_ERROR);
    }

    if (!(storage instanceof LocalStorageService)) {
      throw new AppError('Invalid storage service instance.', 500, ErrorCodes.INTERNAL_ERROR);
    }

    const isValid = storage.verifyDownloadSignature(bucket, key, expiresTimestamp, signature);
    if (!isValid) {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (currentTimestamp > expiresTimestamp) {
        throw new AppError(
          'Download link has expired. Please request a fresh document download URL.',
          403,
          ErrorCodes.ACCESS_FORBIDDEN,
        );
      }
      throw new AppError(
        'Access denied: invalid signature or tampered download URL.',
        403,
        ErrorCodes.ACCESS_FORBIDDEN,
      );
    }

    const fileBuffer = await storage.download(bucket, key);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
      .status(200)
      .send(fileBuffer);
  });
};
