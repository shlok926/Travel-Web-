import { IStorageService } from './storage.interface.js';
import { LocalStorageService } from './local.storage.js';
import { S3StorageService } from './s3.storage.js';
import { EnvConfig } from '../../config/env.js';

export * from './storage.interface.js';
export * from './local.storage.js';
export * from './s3.storage.js';

export class StorageFactory {
  static create(config: EnvConfig): IStorageService {
    if (config.STORAGE_DRIVER === 's3') {
      return new S3StorageService(config);
    }
    return new LocalStorageService(config.STORAGE_LOCAL_PATH);
  }
}
