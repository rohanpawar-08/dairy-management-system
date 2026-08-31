import { describe, it, expect } from 'vitest';
import { reportTemplateService } from '../../electron/services/report-template.service';

describe('Report Template Service', () => {
  const mockProfile = {
    dairy_name_mr: 'Test Dairy',
    dairy_name_en: 'Test Dairy EN',
    phone_number: '1234567890',
    address_mr: 'Pune',
    address_en: 'Pune',
    registration_number: 'REG123'
  };

  it('generates HTML for DAILY_COLLECTION_SUMMARY', () => {
    const data = {
      fromDate: '2026-09-08',
      toDate: '2026-09-08',
      generatedAt: '08/09/2026',
      totalCollections: 10,
      uniqueFarmers: 5,
      totalLitresFormatted: '100.0',
      totalAmountFormatted: '₹1000.00',
      cowLitresFormatted: '50.0',
      cowAmountFormatted: '₹500.00',
      cowFatAvg: '4.5',
      cowSnfAvg: '8.5',
      buffaloLitresFormatted: '50.0',
      buffaloAmountFormatted: '₹500.00',
      buffaloFatAvg: '7.5',
      buffaloSnfAvg: '9.0',
      morningLitresFormatted: '50.0',
      morningAmountFormatted: '₹500.00',
      eveningLitresFormatted: '50.0',
      eveningAmountFormatted: '₹500.00'
    };

    const html = reportTemplateService.generateHtml('DAILY_COLLECTION_SUMMARY', data, mockProfile);
    expect(html).toContain('Test Dairy EN');
    expect(html).toContain('100.0');
    expect(html).not.toContain('<script>');
  });

  it('escapes malicious HTML input in data and profile', () => {
    const maliciousProfile = {
      ...mockProfile,
      dairy_name_mr: '<script>alert(1)</script>',
      dairy_name_en: '<script>alert(1)</script>'
    };
    
    const maliciousData = {
      fromDate: '<img src=x onerror=alert(2)>',
      toDate: '2026-09-08',
      generatedAt: '08/09/2026',
      totalCollections: 10,
      uniqueFarmers: 5,
      totalLitresFormatted: '100.0',
      totalAmountFormatted: '₹1000.00',
      cowLitresFormatted: '50.0',
      cowAmountFormatted: '₹500.00',
      cowFatAvg: '4.5',
      cowSnfAvg: '8.5',
      buffaloLitresFormatted: '50.0',
      buffaloAmountFormatted: '₹500.00',
      buffaloFatAvg: '7.5',
      buffaloSnfAvg: '9.0',
      morningLitresFormatted: '50.0',
      morningAmountFormatted: '₹500.00',
      eveningLitresFormatted: '50.0',
      eveningAmountFormatted: '₹500.00'
    };

    const html = reportTemplateService.generateHtml('DAILY_COLLECTION_SUMMARY', maliciousData, maliciousProfile);
    
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    
    // Also verify strict CSP and no external resources
    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toMatch(/http:/);
    expect(html).not.toMatch(/https:/);
  });
});
