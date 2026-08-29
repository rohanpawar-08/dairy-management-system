import {
  RateFormulaParametersDto,
  CalculateRatePreviewResult,
} from '../../shared/ipc-contracts';
import {
  calculateRatePaisePerLitre,
  calculateCollectionAmountPaise,
  formatPaiseAsRupees,
  formatX100AsPercent,
} from '../../shared/money';

export interface QualityValidationResult {
  valid: boolean;
  error?: string;
  errorMr?: string;
}

export class CalculationEngine {
  /**
   * Validate FAT and SNF values against the configured rate plan formula bounds and step alignment.
   */
  validateQuality(
    fatX100: number,
    snfX100: number,
    params: RateFormulaParametersDto
  ): QualityValidationResult {
    // 1. FAT Bounds
    if (fatX100 < params.minimumFatX100 || fatX100 > params.maximumFatX100) {
      const minFatStr = formatX100AsPercent(params.minimumFatX100);
      const maxFatStr = formatX100AsPercent(params.maximumFatX100);
      const curFatStr = formatX100AsPercent(fatX100);
      return {
        valid: false,
        error: `FAT ${curFatStr}% is outside configured plan range (${minFatStr}% to ${maxFatStr}%).`,
        errorMr: `फॅट ${curFatStr}% ठरवून दिलेल्या मर्यादेबाहेर (${minFatStr}% ते ${maxFatStr}%) आहे.`,
      };
    }

    // 2. FAT Step Alignment
    if ((fatX100 - params.minimumFatX100) % params.fatStepX100 !== 0) {
      const curFatStr = formatX100AsPercent(fatX100);
      const stepStr = formatX100AsPercent(params.fatStepX100);
      return {
        valid: false,
        error: `FAT ${curFatStr}% does not match the configured step increment of ${stepStr}%.`,
        errorMr: `फॅट ${curFatStr}% नियोजित स्टेप वाढीनुसार (${stepStr}%) योग्य नाही.`,
      };
    }

    // 3. SNF Bounds
    if (snfX100 < params.minimumSnfX100 || snfX100 > params.maximumSnfX100) {
      const minSnfStr = formatX100AsPercent(params.minimumSnfX100);
      const maxSnfStr = formatX100AsPercent(params.maximumSnfX100);
      const curSnfStr = formatX100AsPercent(snfX100);
      return {
        valid: false,
        error: `SNF ${curSnfStr}% is outside configured plan range (${minSnfStr}% to ${maxSnfStr}%).`,
        errorMr: `एसएनएफ ${curSnfStr}% ठरवून दिलेल्या मर्यादेबाहेर (${minSnfStr}% ते ${maxSnfStr}%) आहे.`,
      };
    }

    // 4. SNF Step Alignment
    if ((snfX100 - params.minimumSnfX100) % params.snfStepX100 !== 0) {
      const curSnfStr = formatX100AsPercent(snfX100);
      const stepStr = formatX100AsPercent(params.snfStepX100);
      return {
        valid: false,
        error: `SNF ${curSnfStr}% does not match the configured step increment of ${stepStr}%.`,
        errorMr: `एसएनएफ ${curSnfStr}% नियोजित स्टेप वाढीनुसार (${stepStr}%) योग्य नाही.`,
      };
    }

    return { valid: true };
  }

  /**
   * Calculate milk rate and optional collection amount.
   *
   * @throws Error if quality values are out of bounds or misaligned with steps.
   */
  calculate(
    fatX100: number,
    snfX100: number,
    params: RateFormulaParametersDto,
    quantityMl?: number
  ): { ratePaisePerLitre: number; amountPaise?: number } {
    const validation = this.validateQuality(fatX100, snfX100, params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const ratePaisePerLitre = calculateRatePaisePerLitre(
      fatX100,
      snfX100,
      params.fatRatePaisePerPoint,
      params.snfRatePaisePerPoint
    );

    let amountPaise: number | undefined;
    if (quantityMl !== undefined && quantityMl !== null) {
      amountPaise = calculateCollectionAmountPaise(quantityMl, ratePaisePerLitre);
    }

    return { ratePaisePerLitre, amountPaise };
  }

  /**
   * Safe calculation preview helper returning structured result with formatted rupee strings.
   */
  calculatePreview(
    fatX100: number,
    snfX100: number,
    params: RateFormulaParametersDto,
    quantityMl?: number
  ): CalculateRatePreviewResult {
    const validation = this.validateQuality(fatX100, snfX100, params);
    if (!validation.valid) {
      return {
        valid: false,
        ratePaisePerLitre: 0,
        rateRupeesFormatted: '₹0.00',
        error: validation.error,
        errorMr: validation.errorMr,
      };
    }

    const { ratePaisePerLitre, amountPaise } = this.calculate(
      fatX100,
      snfX100,
      params,
      quantityMl
    );

    return {
      valid: true,
      ratePaisePerLitre,
      amountPaise,
      rateRupeesFormatted: `₹${formatPaiseAsRupees(ratePaisePerLitre)}/L`,
      amountRupeesFormatted:
        amountPaise !== undefined ? `₹${formatPaiseAsRupees(amountPaise)}` : undefined,
    };
  }
}

export const calculationEngine = new CalculationEngine();
