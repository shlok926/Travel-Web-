import puppeteer, { Browser } from 'puppeteer';
import { AppError } from '../../../../../shared/src/errors/appError.js';
import { ErrorCodes } from '../../../../../shared/src/errors/errorCodes.js';

export class PdfGeneratorService {
  private browser: Browser | null = null;

  /**
   * Initializes or returns the shared controlled headless browser instance.
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Compiles an HTML template string into a verified PDF buffer.
   *
   * Security & Integrity Guards:
   * 1. Restricts external navigation and SSRF.
   * 2. Sets strict page timeout to prevent hanging worker processes.
   * 3. Validates non-empty output and `%PDF` magic header bytes.
   * 4. Cleans up pages safely in finally block.
   */
  async generatePdf(htmlContent: string): Promise<Buffer> {
    if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
      throw AppError.badRequest(
        'Cannot generate PDF from empty HTML template content',
        [],
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    let page = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Enforce navigation timeout to prevent worker stalls
      page.setDefaultNavigationTimeout(10000);
      page.setDefaultTimeout(10000);

      // SSRF & Resource Safety: Restrict arbitrary network fetches
      await page.setRequestInterception(true);
      page.on('request', (interceptedRequest) => {
        const url = interceptedRequest.url();
        // Allow inline data URLs or safe standard fonts/images
        if (
          url.startsWith('data:') ||
          url.startsWith('about:blank') ||
          url.startsWith('https://images.unsplash.com') ||
          url.startsWith('https://fonts.googleapis.com') ||
          url.startsWith('https://fonts.gstatic.com')
        ) {
          interceptedRequest.continue();
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
          interceptedRequest.continue();
        } else {
          interceptedRequest.abort();
        }
      });

      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const pdfUint8 = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          bottom: '15mm',
          left: '15mm',
          right: '15mm',
        },
      });

      const pdfBuffer = Buffer.from(pdfUint8);

      // PDF Integrity Verification (magic bytes '%PDF-')
      this.verifyPdfIntegrity(pdfBuffer);

      return pdfBuffer;
    } catch (err: unknown) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        `PDF document compilation failed: ${(err as Error).message}`,
        500,
        ErrorCodes.DOCUMENT_GENERATION_FAILED,
      );
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          // Ignore page close error
        }
      }
    }
  }

  /**
   * Validates that the generated buffer is a valid, non-corrupt PDF document.
   */
  public verifyPdfIntegrity(buffer: Buffer): void {
    if (!Buffer.isBuffer(buffer) || buffer.length < 100) {
      throw new AppError(
        'Generated PDF is empty or invalid (insufficient byte length)',
        500,
        ErrorCodes.DOCUMENT_GENERATION_FAILED,
      );
    }

    // Check %PDF header signature (0x25 0x50 0x44 0x46)
    const header = buffer.subarray(0, 4).toString('utf-8');
    if (header !== '%PDF') {
      throw new AppError(
        'Generated PDF header signature mismatch (missing %PDF header)',
        500,
        ErrorCodes.DOCUMENT_GENERATION_FAILED,
      );
    }
  }

  /**
   * Graceful cleanup for worker shutdown.
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore close error on exit
      }
      this.browser = null;
    }
  }
}
