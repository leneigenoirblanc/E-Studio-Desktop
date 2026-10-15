import { PriceTier, ProductRecord, CrossConditionalConfig } from '../types';

export interface TierTargetSpec {
  primary_index: number; // 0-based index
  fallback_indexes?: number[];
  fallback_to_base_price?: boolean;
  strict_required?: boolean;
  keyword_prefix?: string;
  unit_label?: string;
  pricing_strategy?: 'flat' | 'graduated';
  cross_conditional?: CrossConditionalConfig;
}

export interface ResolvedTierResult {
  unit_price: number;
  qty: number;
  text_qty: string;
  formatted_price: string;
  is_fallback: boolean;
  strategy?: 'flat' | 'graduated';
  cross_conditional_met?: boolean;
  average_unit_price?: number;
  error?: string;
}

export class TierEngine {
  static resolve(
    spec: TierTargetSpec,
    record: ProductRecord
  ): ResolvedTierResult | null {
    const prefix = spec.keyword_prefix || 'À partir de';
    const unit = spec.unit_label || 'FCFA';
    const fallbackToBase = spec.fallback_to_base_price !== false;
    const strict = !!spec.strict_required;
    const strategy = spec.pricing_strategy || 'flat';

    // 1. Cross-Conditional Evaluation (Volume global marque/panier)
    if (spec.cross_conditional && spec.cross_conditional.enabled) {
      const col = spec.cross_conditional.trigger_column;
      const minVal = spec.cross_conditional.min_threshold;
      
      let actualVal = 0;
      if (record[col] !== undefined) {
        actualVal = typeof record[col] === 'number' ? record[col] : parseFloat(String(record[col])) || 0;
      } else {
        // Look case-insensitively
        const colNorm = col.trim().toUpperCase().replace(/[\s\-_]+/g, '');
        for (const k of Object.keys(record)) {
          if (k.trim().toUpperCase().replace(/[\s\-_]+/g, '') === colNorm) {
            actualVal = typeof record[k] === 'number' ? record[k] : parseFloat(String(record[k])) || 0;
            break;
          }
        }
      }

      if (actualVal < minVal) {
        // Threshold not reached: tier is locked
        if (strict) {
          return {
            unit_price: 0,
            qty: 0,
            text_qty: `[Seuil ${col} non atteint : ${actualVal}/${minVal}]`,
            formatted_price: '—',
            is_fallback: false,
            strategy,
            cross_conditional_met: false,
            error: `Seuil ${col} (${minVal}) non atteint (actuel: ${actualVal})`,
          };
        }
        if (fallbackToBase && typeof record.SELLING_PRICE === 'number') {
          return {
            unit_price: record.SELLING_PRICE,
            qty: 1,
            text_qty: `Tarif standard (${col} < ${minVal})`,
            formatted_price: `${record.SELLING_PRICE.toLocaleString('fr-FR')} ${unit}`,
            is_fallback: true,
            strategy,
            cross_conditional_met: false,
          };
        }
      }
    }

    let tiers: PriceTier[] = [];
    if (Array.isArray(record.price_tiers) && record.price_tiers.length > 0) {
      tiers = record.price_tiers.map((t) => ({
        qty: t.min_qty,
        unit_price: t.unit_price,
        label: t.label || `${t.min_qty}+ Units`,
      }));
    } else if (Array.isArray(record.TIERS)) {
      tiers = record.TIERS;
    }

    // Helper to calculate graduated price
    const calculateGraduated = (targetIndex: number) => {
      const basePrice = typeof record.SELLING_PRICE === 'number' ? record.SELLING_PRICE : tiers[0]?.unit_price || 0;
      let totalCost = 0;
      let prevQty = 0;

      for (let i = 0; i <= targetIndex; i++) {
        const currentTier = tiers[i];
        if (!currentTier) continue;
        const segmentQty = currentTier.qty - prevQty;
        totalCost += segmentQty * currentTier.unit_price;
        prevQty = currentTier.qty;
      }

      const totalQty = tiers[targetIndex]?.qty || prevQty || 1;
      const avgPrice = totalQty > 0 ? totalCost / totalQty : tiers[targetIndex]?.unit_price || 0;
      return { totalCost, avgPrice };
    };

    // Check primary index
    if (tiers[spec.primary_index] && typeof tiers[spec.primary_index].unit_price === 'number') {
      const tier = tiers[spec.primary_index];

      if (strategy === 'graduated') {
        const { avgPrice } = calculateGraduated(spec.primary_index);
        return {
          unit_price: tier.unit_price,
          average_unit_price: avgPrice,
          qty: tier.qty,
          text_qty: `${prefix} ${tier.qty} ${record.SELLING_UNIT || 'unités'} [Cumulatif]`,
          formatted_price: `${tier.unit_price.toLocaleString('fr-FR')} ${unit} (Moy: ${Math.round(avgPrice).toLocaleString('fr-FR')} ${unit})`,
          is_fallback: false,
          strategy: 'graduated',
          cross_conditional_met: true,
        };
      }

      return {
        unit_price: tier.unit_price,
        qty: tier.qty,
        text_qty: `${prefix} ${tier.qty} ${record.SELLING_UNIT || 'unités'}`,
        formatted_price: `${tier.unit_price.toLocaleString('fr-FR')} ${unit}`,
        is_fallback: false,
        strategy: 'flat',
        cross_conditional_met: true,
      };
    }

    // Check fallback indexes if provided
    if (spec.fallback_indexes) {
      for (const idx of spec.fallback_indexes) {
        if (tiers[idx] && typeof tiers[idx].unit_price === 'number') {
          const tier = tiers[idx];
          return {
            unit_price: tier.unit_price,
            qty: tier.qty,
            text_qty: `${prefix} ${tier.qty} ${record.SELLING_UNIT || 'unités'}`,
            formatted_price: `${tier.unit_price.toLocaleString('fr-FR')} ${unit}`,
            is_fallback: true,
            strategy,
            cross_conditional_met: true,
          };
        }
      }
    }

    // Strict required: cannot fall back to base
    if (strict) {
      return {
        unit_price: 0,
        qty: 0,
        text_qty: '[Palier requis indisponible]',
        formatted_price: '—',
        is_fallback: false,
        strategy,
        error: `Palier #${spec.primary_index + 1} manquant (strict)`,
      };
    }

    // Fallback to selling price
    if (fallbackToBase && typeof record.SELLING_PRICE === 'number' && !isNaN(record.SELLING_PRICE)) {
      return {
        unit_price: record.SELLING_PRICE,
        qty: 1,
        text_qty: `Prix unitaire standard`,
        formatted_price: `${record.SELLING_PRICE.toLocaleString('fr-FR')} ${unit}`,
        is_fallback: true,
        strategy,
      };
    }

    return null;
  }
}
