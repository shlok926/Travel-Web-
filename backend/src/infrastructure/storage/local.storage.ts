import fs from 'node:fs/promises';
import path from 'node:path';
import { IStorageService, UploadFileOptions } from './storage.interface.js';

export class LocalStorageService implements IStorageService {
  constructor(private readonly basePath: string = './uploads') {}

  private getFilePath(bucket: string, key: string): string {
    return path.join(this.basePath, bucket, key);
  }

  async upload(data: Buffer | Uint8Array | string, options: UploadFileOptions): Promise<string> {
    const fullPath = this.getFilePath(options.bucket, options.key);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, Buffer.from(data));

    return options.key;
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const fullPath = this.getFilePath(bucket, key);
    return fs.readFile(fullPath);
  }

  async getDownloadUrl(bucket: string, key: string, _expiresInSeconds: number = 900): Promise<string> {
    // Return relative or local route path for local development
    return `/api/v1/storage/${bucket}/${key}`;
  }

  async delete(bucket: string, key: string): Promise<void> {
    const fullPath = this.getFilePath(bucket, key);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const fullPath = this.getFilePath(bucket, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
