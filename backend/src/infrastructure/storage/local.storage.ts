import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { IStorageService, UploadFileOptions } from './storage.interface.js';
import { AppError } from '../../../../shared/src/errors/appError.js';
import { ErrorCodes } from '../../../../shared/src/errors/errorCodes.js';

export class LocalStorageService implements IStorageService {
  private readonly absoluteBasePath: string;
  private readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

  constructor(private readonly basePath: string = './uploads') {
    this.absoluteBasePath = path.resolve(process.cwd(), this.basePath);
  }

  /**
   * Generates secure, unpredictable storage keys to prevent user-controlled filesystem paths.
   */
  static generateStorageKey(prefix: string, extension: string): string {
    const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedExt = extension.replace(/[^a-zA-Z0-9]/g, '');
    const randomId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${sanitizedPrefix}/${timestamp}_${randomId}.${sanitizedExt}`;
  }

  /**
   * Resolves and strictly validates that file path resides inside the authorized storage boundary.
   * Prevents directory traversal attacks (e.g. `../../etc/passwd`).
   */
  private getSecureFilePath(bucket: string, key: string): string {
    if (bucket.includes('..') || key.includes('..')) {
      throw new AppError(
        'Path traversal detected: Access to path outside storage root is prohibited.',
        403,
        ErrorCodes.ACCESS_FORBIDDEN,
      );
    }

    const resolvedPath = path.resolve(this.absoluteBasePath, bucket, key);

    if (!resolvedPath.startsWith(this.absoluteBasePath)) {
      throw new AppError(
        'Path traversal detected: Access to path outside storage root is prohibited.',
        403,
        ErrorCodes.ACCESS_FORBIDDEN,
      );
    }

    return resolvedPath;
  }

  async upload(data: Buffer | Uint8Array | string, options: UploadFileOptions): Promise<string> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    if (buffer.length > this.MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        `File upload exceeds maximum allowed limit of ${this.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const fullPath = this.getSecureFilePath(options.bucket, options.key);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return options.key;
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const fullPath = this.getSecureFilePath(bucket, key);
    try {
      return await fs.readFile(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError(
          `Requested document or media resource not found in storage.`,
          404,
          ErrorCodes.RESOURCE_NOT_FOUND,
        );
      }
      throw err;
    }
  }

  async getDownloadUrl(
    bucket: string,
    key: string,
    _expiresInSeconds: number = 900,
  ): Promise<string> {
    // Return relative API route for local development (enforcing path security)
    const sanitizedBucket = encodeURIComponent(bucket);
    const sanitizedKey = encodeURIComponent(key);
    return `/api/v1/storage/${sanitizedBucket}/${sanitizedKey}`;
  }

  async delete(bucket: string, key: string): Promise<void> {
    const fullPath = this.getSecureFilePath(bucket, key);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const fullPath = this.getSecureFilePath(bucket, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
