import { Injectable, signal, computed } from '@angular/core';
import mrTranslations from '../../../../public/assets/i18n/mr.json';
import enTranslations from '../../../../public/assets/i18n/en.json';

export type LanguageCode = 'mr' | 'en';

type TranslationDictionary = Record<string, unknown>;

@Injectable({
  providedIn: 'root',
})
export class I18nService {
  private readonly translations: Record<LanguageCode, TranslationDictionary> = {
    mr: mrTranslations as TranslationDictionary,
    en: enTranslations as TranslationDictionary,
  };

  /**
   * Signal tracking current active UI language. Defaults to Marathi ('mr').
   */
  readonly currentLanguage = signal<LanguageCode>('mr');

  /**
   * Reactive signal for instant template bindings.
   */
  readonly isMarathi = computed(() => this.currentLanguage() === 'mr');

  /**
   * Set active application language ('mr' or 'en').
   */
  setLanguage(lang: LanguageCode): void {
    if (lang === 'mr' || lang === 'en') {
      this.currentLanguage.set(lang);
    }
  }

  /**
   * Toggle between Marathi and English instantly.
   */
  toggleLanguage(): void {
    this.currentLanguage.update((curr) => (curr === 'mr' ? 'en' : 'mr'));
  }

  /**
   * Synchronously translate a dotted key (e.g. 'setup.centre_name') with fallback to English then raw key.
   */
  translate(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLanguage();
    const dictionary = this.translations[lang];

    let result = this.resolveKey(dictionary, key);

    // Fallback to English if not found in Marathi
    if (!result && lang !== 'en') {
      result = this.resolveKey(this.translations.en, key);
    }

    if (!result) {
      return key;
    }

    // Parameter interpolation (e.g. {{name}})
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, 'g'), String(paramValue));
      }
    }

    return result;
  }

  private resolveKey(dict: TranslationDictionary, dottedKey: string): string | null {
    if (!dict || !dottedKey) return null;
    const parts = dottedKey.split('.');
    let current: unknown = dict;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }

    return typeof current === 'string' ? current : null;
  }
}
