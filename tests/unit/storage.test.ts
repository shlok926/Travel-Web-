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

  it('1. should upload, check existence, download, and delete files', async () => {
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

  it('2. should generate cryptographically unpredictable storage keys', () => {
    const key1 = LocalStorageService.generateStorageKey('invoices', 'pdf');
    const key2 = LocalStorageService.generateStorageKey('invoices', 'pdf');

    expect(key1).toMatch(/^invoices\/\d+_[a-f0-9]{32}\.pdf$/);
    expect(key2).toMatch(/^invoices\/\d+_[a-f0-9]{32}\.pdf$/);
    expect(key1).not.toBe(key2);
  });

  it('3. should strictly reject path traversal attempts', async () => {
    const maliciousKey = '../../../../etc/passwd';
    const content = Buffer.from('malicious payload');

    await expect(
      storage.upload(content, {
        bucket: 'public',
        key: maliciousKey,
        contentType: 'text/plain',
      }),
    ).rejects.toThrow(/Path traversal detected/);
  });

  it('4. should reject file uploads exceeding maximum size limit', async () => {
    // 11MB buffer (exceeds 10MB limit)
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

    await expect(
      storage.upload(largeBuffer, {
        bucket: 'documents',
        key: 'large.pdf',
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow(/exceeds maximum allowed limit/);
  });

  it('5. should generate cryptographically verifiable HMAC signed URLs and enforce expiration', async () => {
    const bucket = 'documents';
    const key = 'test-doc.pdf';
    const ttlSeconds = 60;

    const downloadUrl = await storage.getDownloadUrl(bucket, key, ttlSeconds);
    expect(downloadUrl).toContain('expires=');
    expect(downloadUrl).toContain('signature=');

    const urlObj = new URL(downloadUrl);
    const expiresTimestamp = Number(urlObj.searchParams.get('expires'));
    const signature = urlObj.searchParams.get('signature')!;

    // A. Valid signature & active timestamp
    const isValid = storage.verifyDownloadSignature(bucket, key, expiresTimestamp, signature);
    expect(isValid).toBe(true);

    // B. Expired timestamp rejected
    const pastTimestamp = Math.floor(Date.now() / 1000) - 10;
    const isExpiredValid = storage.verifyDownloadSignature(bucket, key, pastTimestamp, signature);
    expect(isExpiredValid).toBe(false);

    // C. Tampered signature rejected
    const isTamperedSignatureValid = storage.verifyDownloadSignature(
      bucket,
      key,
      expiresTimestamp,
      'deadbeefbadsignature',
    );
    expect(isTamperedSignatureValid).toBe(false);

    // D. Tampered bucket/key rejected
    const isTamperedKeyValid = storage.verifyDownloadSignature(
      'evil-bucket',
      key,
      expiresTimestamp,
      signature,
    );
    expect(isTamperedKeyValid).toBe(false);
  });
});
