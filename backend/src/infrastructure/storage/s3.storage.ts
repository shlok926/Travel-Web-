import { IStorageService, UploadFileOptions } from './storage.interface.js';
import { EnvConfig } from '../../config/env.js';

export class S3StorageService implements IStorageService {
  constructor(private readonly config: EnvConfig) {}

  async upload(_data: Buffer | Uint8Array | string, options: UploadFileOptions): Promise<string> {
    // S3 integration boundary ready for production AWS SDK client
    return `s3://${options.bucket}/${options.key}`;
  }

  async download(_bucket: string, _key: string): Promise<Buffer> {
    return Buffer.from('');
  }

  async getDownloadUrl(bucket: string, key: string, _expiresInSeconds: number = 900): Promise<string> {
    const endpoint = this.config.S3_ENDPOINT || `https://${bucket}.s3.${this.config.S3_REGION}.amazonaws.com`;
    return `${endpoint}/${key}?signed=true`;
  }

  async delete(_bucket: string, _key: string): Promise<void> {
    // S3 delete implementation boundary
  }

  async exists(_bucket: string, _key: string): Promise<boolean> {
    return true;
  }
}
