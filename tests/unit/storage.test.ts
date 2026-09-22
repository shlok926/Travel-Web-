import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import { LocalStorageService } from '../../backend/src/infrastructure/storage/local.storage.js';

describe('Object Storage Abstraction — LocalStorageService', () => {
  const testBasePath = './tmp/test-uploads';
  const storage = new LocalStorageService(testBasePath);

  afterAll(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // Cleanup
    }
  });

  it('should upload, check existence, download, and delete files', async () => {
    const bucket = 'invoices';
    const key = 'INV-2026-001.pdf';
    const content = Buffer.from('PDF Mock Content');

    // 1. Upload
    await storage.upload(content, {
      bucket,
      key,
      contentType: 'application/pdf',
    });

    // 2. Exists
    const exists = await storage.exists(bucket, key);
    expect(exists).toBe(true);

    // 3. Download
    const downloaded = await storage.download(bucket, key);
    expect(downloaded.toString()).toBe('PDF Mock Content');

    // 4. Download URL
    const url = await storage.getDownloadUrl(bucket, key);
    expect(url).toContain(`/api/v1/storage/${bucket}/${key}`);

    // 5. Delete
    await storage.delete(bucket, key);
    const existsAfterDelete = await storage.exists(bucket, key);
    expect(existsAfterDelete).toBe(false);
  });
});
