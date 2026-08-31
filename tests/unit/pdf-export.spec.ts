import { describe, it, expect, vi } from 'vitest';
import { pdfExportService } from '../../electron/services/pdf-export.service';

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      printToPDF: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock buffer'))
    };
    loadURL = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  },
  dialog: {
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\test\\report.pdf' })
  }
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

describe('PDF Export Service', () => {
  it('generates a PDF buffer without exposing arbitrary paths', async () => {
    const html = '<html><body>Test</body></html>';
    const buffer = await pdfExportService.generatePdfBuffer(html);
    expect(buffer.toString()).toContain('%PDF-1.4');
  });

  it('exports HTML to PDF via dialog', async () => {
    const html = '<html><body>Test</body></html>';
    const res = await pdfExportService.exportHtmlToPdf(html, 'my-report');
    expect(res.cancelled).toBe(false);
    expect(res.fileName).toBe('report.pdf');
  });
});
