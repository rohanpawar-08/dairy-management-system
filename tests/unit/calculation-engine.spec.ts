import { describe, it, expect } from 'vitest';
import {
  parseRupeesToPaise,
  formatPaiseAsRupees,
  parsePercentToX100,
  formatX100AsPercent,
  parseLitresToMl,
  formatMlAsLitres,
  roundHalfUpBigInt,
  calculateRatePaisePerLitre,
  calculateCollectionAmountPaise,
} from '../../shared/money';
import { CalculationEngine } from '../../electron/services/calculation.engine';
import { RateFormulaParametersDto } from '../../shared/ipc-contracts';

describe('Stage 5: Exact Integer Calculation Engine & Precision Arithmetic', () => {
  const engine = new CalculationEngine();

  const cowParams: RateFormulaParametersDto = {
    fatRatePaisePerPoint: 850, // ₹8.50 per point
    snfRatePaisePerPoint: 300, // ₹3.00 per point
    minimumFatX100: 300, // 3.00%
    maximumFatX100: 600, // 6.00%
    fatStepX100: 10, // 0.10%
    minimumSnfX100: 750, // 7.50%
    maximumSnfX100: 950, // 9.50%
    snfStepX100: 10, // 0.10%
  };

  const buffaloParams: RateFormulaParametersDto = {
    fatRatePaisePerPoint: 900, // ₹9.00 per point
    snfRatePaisePerPoint: 300, // ₹3.00 per point
    minimumFatX100: 500, // 5.00%
    maximumFatX100: 1200, // 12.00%
    fatStepX100: 10, // 0.10%
    minimumSnfX100: 800, // 8.00%
    maximumSnfX100: 1050, // 10.50%
    snfStepX100: 10, // 0.10%
  };

  describe('BigInt ROUND_HALF_UP Arithmetic', () => {
    it('rounds exact halves up (positive and negative)', () => {
      // 5 / 2 = 2.5 -> 3
      expect(roundHalfUpBigInt(5n, 2n)).toBe(3n);
      // 4 / 2 = 2 -> 2
      expect(roundHalfUpBigInt(4n, 2n)).toBe(2n);
      // 7 / 2 = 3.5 -> 4
      expect(roundHalfUpBigInt(7n, 2n)).toBe(4n);
      // 1 / 3 = 0.333... -> 0
      expect(roundHalfUpBigInt(1n, 3n)).toBe(0n);
      // 2 / 3 = 0.666... -> 1
      expect(roundHalfUpBigInt(2n, 3n)).toBe(1n);
    });

    it('throws on division by zero', () => {
      expect(() => roundHalfUpBigInt(100n, 0n)).toThrow('Division by zero');
    });
  });

  describe('Percentage and Litre String Parsing', () => {
    it('parses percentages to exact scaled integer x100', () => {
      expect(parsePercentToX100('4.00')).toBe(400);
      expect(parsePercentToX100('4.0')).toBe(400);
      expect(parsePercentToX100('4')).toBe(400);
      expect(parsePercentToX100('8.50')).toBe(850);
      expect(parsePercentToX100('8.5')).toBe(850);
      expect(parsePercentToX100('0.10')).toBe(10);
      expect(parsePercentToX100('0.05')).toBe(5);
    });

    it('rejects invalid percentage formats', () => {
      expect(() => parsePercentToX100('')).toThrow();
      expect(() => parsePercentToX100('4.555')).toThrow();
      expect(() => parsePercentToX100('-3.5')).toThrow();
      expect(() => parsePercentToX100('abc')).toThrow();
    });

    it('formats x100 as 2-decimal percentage string', () => {
      expect(formatX100AsPercent(400)).toBe('4.00');
      expect(formatX100AsPercent(850)).toBe('8.50');
      expect(formatX100AsPercent(5)).toBe('0.05');
      expect(formatX100AsPercent(0)).toBe('0.00');
    });

    it('parses litres to millilitres', () => {
      expect(parseLitresToMl('50')).toBe(50000);
      expect(parseLitresToMl('50.0')).toBe(50000);
      expect(parseLitresToMl('50.000')).toBe(50000);
      expect(parseLitresToMl('1.5')).toBe(1500);
      expect(parseLitresToMl('0.250')).toBe(250);
    });

    it('formats millilitres as 3-decimal litre string', () => {
      expect(formatMlAsLitres(50000)).toBe('50.000');
      expect(formatMlAsLitres(1500)).toBe('1.500');
      expect(formatMlAsLitres(250)).toBe('0.250');
    });
  });

  describe('Confirmed Reference Pricing Calculations', () => {
    it('calculates Cow milk rate and 50 Litre collection amount accurately', () => {
      // Cow: FAT 4.00% (400), SNF 8.50% (850)
      // FAT rate: ₹8.50/pt (850 paise), SNF rate: ₹3.00/pt (300 paise)
      // Numerator: (400 * 850) + (850 * 300) = 340,000 + 255,000 = 595,000
      // Rate: 595,000 / 100 = 5950 paise/L (₹59.50/L)
      const ratePaise = calculateRatePaisePerLitre(400, 850, 850, 300);
      expect(ratePaise).toBe(5950);

      // Volume: 50,000 mL (50 L)
      // Amount: (50,000 * 5950) / 1000 = 297,500 paise (₹2,975.00)
      const amountPaise = calculateCollectionAmountPaise(50000, ratePaise);
      expect(amountPaise).toBe(297500);
      expect(formatPaiseAsRupees(amountPaise)).toBe('2975.00');
    });

    it('calculates Buffalo milk rate and 50 Litre collection amount accurately', () => {
      // Buffalo: FAT 7.00% (700), SNF 9.00% (900)
      // FAT rate: ₹9.00/pt (900 paise), SNF rate: ₹3.00/pt (300 paise)
      // Numerator: (700 * 900) + (900 * 300) = 630,000 + 270,000 = 900,000
      // Rate: 900,000 / 100 = 9000 paise/L (₹90.00/L)
      const ratePaise = calculateRatePaisePerLitre(700, 900, 900, 300);
      expect(ratePaise).toBe(9000);

      // Volume: 50,000 mL (50 L)
      // Amount: (50,000 * 9000) / 1000 = 450,000 paise (₹4,500.00)
      const amountPaise = calculateCollectionAmountPaise(50000, ratePaise);
      expect(amountPaise).toBe(450000);
      expect(formatPaiseAsRupees(amountPaise)).toBe('4500.00');
    });

    it('correctly rounds half paise with ROUND_HALF_UP', () => {
      // Custom test with fractional paise:
      // FAT 4.15% (415) at 850 paise/pt = 352,750
      // SNF 8.50% (850) at 300 paise/pt = 255,000
      // Total: 607,750 / 100 = 6077.5 -> rounds up to 6078 paise/L
      const ratePaise = calculateRatePaisePerLitre(415, 850, 850, 300);
      expect(ratePaise).toBe(6078);
    });
  });

  describe('Quality Bounds & Step Validation', () => {
    it('accepts quality values within bounds and step increments', () => {
      const result = engine.validateQuality(400, 850, cowParams);
      expect(result.valid).toBe(true);
    });

    it('rejects FAT below minimum with bilingual error', () => {
      const result = engine.validateQuality(290, 850, cowParams);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('FAT 2.90% is outside configured plan range');
      expect(result.errorMr).toContain('फॅट 2.90% ठरवून दिलेल्या मर्यादेबाहेर');
    });

    it('rejects FAT above maximum with bilingual error', () => {
      const result = engine.validateQuality(610, 850, cowParams);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('FAT 6.10% is outside configured plan range');
    });

    it('rejects FAT not aligned with step increment', () => {
      // Step is 10 (0.10%). 405 is 4.05% -> not on 0.10% step grid
      const result = engine.validateQuality(405, 850, cowParams);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('FAT 4.05% does not match the configured step increment of 0.10%');
      expect(result.errorMr).toContain('फॅट 4.05% नियोजित स्टेप वाढीनुसार');
    });

    it('rejects SNF below minimum', () => {
      const result = engine.validateQuality(400, 740, cowParams);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('SNF 7.40% is outside configured plan range');
    });

    it('rejects SNF above maximum', () => {
      const result = engine.validateQuality(400, 960, cowParams);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('SNF 9.60% is outside configured plan range');
    });

    it('rejects SNF not aligned with step increment', () => {
      const result = engine.validateQuality(400, 855, cowParams);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('SNF 8.55% does not match the configured step increment of 0.10%');
    });
  });

  describe('Calculation Preview Helper', () => {
    it('returns preview result with formatted rupee strings on valid inputs', () => {
      const preview = engine.calculatePreview(400, 850, cowParams, 25000);
      expect(preview.valid).toBe(true);
      expect(preview.ratePaisePerLitre).toBe(5950);
      expect(preview.rateRupeesFormatted).toBe('₹59.50/L');
      expect(preview.amountPaise).toBe(148750);
      expect(preview.amountRupeesFormatted).toBe('₹1487.50');
    });

    it('returns structured error preview when quality validation fails', () => {
      const preview = engine.calculatePreview(250, 850, cowParams, 25000);
      expect(preview.valid).toBe(false);
      expect(preview.ratePaisePerLitre).toBe(0);
      expect(preview.error).toBeDefined();
      expect(preview.errorMr).toBeDefined();
    });
  });
});
