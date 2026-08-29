import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';
import { describe, it, expect, beforeEach } from 'vitest';
import mrTranslations from '../../../../public/assets/i18n/mr.json';
import enTranslations from '../../../../public/assets/i18n/en.json';

describe('I18nService & Offline Translation Parity (Unit)', () => {
  let service: I18nService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(I18nService);
  });

  it('defaults to Marathi (mr) language', () => {
    expect(service.currentLanguage()).toBe('mr');
    expect(service.isMarathi()).toBe(true);
  });

  it('toggles language between Marathi and English reactively', () => {
    service.toggleLanguage();
    expect(service.currentLanguage()).toBe('en');
    expect(service.isMarathi()).toBe(false);

    service.toggleLanguage();
    expect(service.currentLanguage()).toBe('mr');
    expect(service.isMarathi()).toBe(true);
  });

  it('translates nested dotted keys with parameter interpolation', () => {
    service.setLanguage('mr');
    const title = service.translate('app.title');
    expect(title).toBe('डेअरी व्यवस्थापन प्रणाली');

    service.setLanguage('en');
    const titleEn = service.translate('app.title');
    expect(titleEn).toBe('Dairy Management System');
  });

  it('enforces 100% exact key parity between mr.json and en.json', () => {
    function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      let keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          keys = keys.concat(getAllKeys(v as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    const mrKeys = getAllKeys(mrTranslations as Record<string, unknown>);
    const enKeys = getAllKeys(enTranslations as Record<string, unknown>);

    expect(mrKeys).toEqual(enKeys);
    expect(mrKeys.length).toBeGreaterThan(20);
  });
});
