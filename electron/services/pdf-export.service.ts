import { BrowserWindow, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

export const pdfExportService = {
  async exportHtmlToPdf(html: string, suggestedFilename: string): Promise<{ cancelled: boolean, fileName?: string }> {
    // Sanitize filename
    const safeFilename = suggestedFilename.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.pdf';
    
    const result = await dialog.showSaveDialog({
      title: 'Export PDF',
      defaultPath: safeFilename,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    
    if (result.canceled || !result.filePath) {
      return { cancelled: true };
    }
    
    const filePath = result.filePath;
    
    const pdfBuffer = await this.generatePdfBuffer(html);
    await fs.writeFile(filePath, pdfBuffer);
    
    return { cancelled: false, fileName: path.basename(filePath) };
  },

  async generatePdfBuffer(html: string): Promise<Buffer> {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false
      }
    });
    
    win.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
    
    win.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true
    });
    
    win.destroy();
    
    return pdfBuffer;
  }
};
