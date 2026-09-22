export interface UploadFileOptions {
  bucket: string;
  key: string;
  contentType: string;
  isPublic?: boolean;
  metadata?: Record<string, string>;
}

export interface StorageFile {
  key: string;
  bucket: string;
  sizeBytes: number;
  contentType: string;
  lastModified: Date;
}

export interface IStorageService {
  upload(data: Buffer | Uint8Array | string, options: UploadFileOptions): Promise<string>;
  download(bucket: string, key: string): Promise<Buffer>;
  getDownloadUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
  exists(bucket: string, key: string): Promise<boolean>;
}
