/**
 * Asia/Kolkata Business Date Provider
 *
 * Strict business date generation in Indian Standard Time (IST, UTC+05:30).
 * Never slices UTC ISO strings to prevent evening shift date rollovers.
 * Allows deterministic clock injection for automated testing.
 */

export interface BusinessDateProvider {
  /**
   * Get the current business date in Asia/Kolkata timezone (YYYY-MM-DD).
   */
  getToday(): string;

  /**
   * Get the current system timestamp as UTC ISO 8601 string.
   */
  getNowIso(): string;
}

class DefaultBusinessDateProvider implements BusinessDateProvider {
  private readonly formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  getToday(): string {
    // en-CA format produces YYYY-MM-DD in the specified timezone
    return this.formatter.format(new Date());
  }

  getNowIso(): string {
    return new Date().toISOString();
  }
}

let activeProvider: BusinessDateProvider = new DefaultBusinessDateProvider();

export const businessDateProvider = {
  getToday(): string {
    return activeProvider.getToday();
  },

  getNowIso(): string {
    return activeProvider.getNowIso();
  },

  setProvider(provider: BusinessDateProvider): void {
    activeProvider = provider;
  },

  resetProvider(): void {
    activeProvider = new DefaultBusinessDateProvider();
  },
};
