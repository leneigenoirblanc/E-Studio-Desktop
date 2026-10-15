import { ExtendedDomainField, DOMAIN_FIELDS as BASE_DOMAIN_FIELDS } from '../domainFields';
import { api } from '../services/api';

export interface FieldAliasDefinition {
  key: string;
  label: string;
  value_type: 'text' | 'currency' | 'barcode' | 'number' | 'date' | 'promo';
  category: 'identity' | 'pricing' | 'classification' | 'logistics' | 'lifecycle' | 'custom';
  is_volatile?: boolean;
  numeric?: boolean;
  description?: string;
  default_aliases: string[];
  custom_aliases: string[];
  keywords: string[];
  is_custom_field?: boolean;
}

export interface MatchResult {
  canonical_key: string;
  field_label: string;
  confidence: number; // 0 to 100
  match_type: 'exact' | 'user_alias' | 'default_alias' | 'keyword_fuzzy' | 'pattern_heuristic' | 'manual';
  matched_token?: string;
  explanation?: string;
}

// Clean text for agnostic matching (removes accents, spaces, special chars, uppercase)
export function normalizeToken(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Built-in keyword associations for deep automated detection
const DEFAULT_FIELD_KEYWORDS: Record<string, string[]> = {
  PRODUCT_SCAN: ['EAN', 'GTIN', 'BARRE', 'BARCODE', 'SCAN', 'CB', 'GENCOD', 'CODE_BARRE', 'UPC', 'CAB', '13', 'GENC'],
  PARTNO: ['REF', 'REFERENCE', 'SKU', 'PART', 'CODE_ARTICLE', 'ARTICLE_NO', 'NUMERO_ARTICLE', 'CODART', 'ID_PROD', 'ITEM_CODE'],
  ITEMNAME: ['DESIGNATION', 'LIBELLE', 'NOM', 'ARTICLE', 'PRODUIT', 'NAME', 'ITEM', 'TITLE', 'DESCRIPTION_COURTE', 'TITRE'],
  ITEMDESCRIPTION: ['DETAIL', 'SOUS_TITRE', 'DESCRIPTION', 'DESC', 'COMPLEMENT', 'INFO_PRODUIT', 'DETAILS'],
  BRAND_INFO: ['MARQUE', 'BRAND', 'FABRICANT', 'CONSTRUCTEUR', 'LABEL_MARQUE', 'PRODUCTEUR'],
  STORE_NAME: ['MAGASIN', 'STORE', 'ENSEIGNE', 'POINT_VENTE', 'BOUTIQUE', 'ETABLISSEMENT'],
  HSCOD: ['DOUANE', 'TARIC', 'HS_CODE', 'SH_CODE', 'DOUANIER'],
  DIV_NAME: ['DIVISION', 'SECTEUR', 'POLE', 'BRANCH'],
  DEPT_NAME: ['DEPARTEMENT', 'DEP', 'DEPT', 'RAYON_PRINCIPAL'],
  CATEGORY_NAME: ['CATEGORIE', 'CATEGORY', 'FAMILLE', 'RAYON', 'CAT'],
  SUB_CATEGORY_NAME: ['SOUS_CATEGORIE', 'SOUS_FAMILLE', 'SUBCAT', 'SOUS_RAYON', 'SOUS_CAT'],
  SELLING_PRICE: ['PRIX_VENTE', 'PRIX', 'PV', 'PRIX_UNITAIRE', 'PRICE', 'PRIX_STD', 'TARIF', 'PRIX_TTC', 'TTC', 'UNIT_PRICE', 'PU_TTC'],
  PROMOPRICE: ['PRIX_PROMO', 'PROMO', 'PV_PROMO', 'PROMO_PRICE', 'SOLDE', 'PRIX_SOLDE', 'NOUVEAU_PRIX', 'PRIX_CHOC', 'SPECIAL_PRICE', 'PRIX_REDUIT'],
  PROMO_END_DATE: ['FIN_PROMO', 'PROMO_END', 'DATE_FIN', 'EXPIRATION_PROMO', 'DATE_PROMO_FIN', 'FIN_VALIDITE', 'DATE_FIN_PROMO'],
  LAST_SELLING_PRICE: ['ANCIEN_PRIX', 'PRIX_AVANT', 'PREVIOUS_PRICE', 'PRIX_BARRE', 'OLD_PRICE', 'PRIX_ORIGINE', 'PRIX_INITIAL'],
  DISCOUNT_PCT: ['REMISE', 'POURCENTAGE', 'DISCOUNT', 'REDUC', 'PROMO_PCT', 'TAUX_REMISE', 'PCT_REMISE', 'RABAIS'],
  PROMO_LABEL: ['BADGE_PROMO', 'MESSAGE_PROMO', 'OFFRE', 'PROMOTION', 'LABEL_PROMO', 'FLASH', 'TYPE_PROMO', 'LIBELLE_PROMO', 'BOGO'],
  UNIT_PRICE_TEXT: ['PRIX_KILO', 'PRIX_LITRE', 'PRIX_KG', 'PRIX_POIDS', 'PRIX_MESURE', 'UNIT_PRICE_TEXT', 'PU_KG', 'PU_L'],
  ECO_TAX: ['ECO_PART', 'ECO_TAXE', 'DEEE', 'TAXE_ECO', 'ECO_PARTICIPATION', 'ECOTAX'],
  PACK_UNIT: ['CONDITIONNEMENT', 'PACK', 'FORMAT', 'CONTENANCE', 'VOLUME', 'POIDS_NET', 'PACKAGING', 'UVC'],
  VENDOR_NAME: ['FOURNISSEUR', 'VENDOR', 'FOURN', 'TIERS', 'FOURNISSEUR_NOM'],
  SUPPLIER: ['GROSSISTE', 'DISTRIBUTEUR', 'CENTRALE', 'SUPPLIER', 'ACHETEUR'],
  ITEM_TYPE: ['TYPE_ARTICLE', 'NATURE', 'ITEM_TYPE', 'GENRE_PRODUIT'],
  CASE_SIZE: ['COLISAGE', 'PCB', 'CARTON_QTY', 'CASE_QTY', 'PAR_CARTON', 'CASE_SIZE', 'CONDITIONNEMENT_COLIS'],
  CASE_UNIT: ['UNITE_COLIS', 'CARTON_UNIT', 'TYPE_COLIS'],
  ORIGIN_COUNTRY: ['ORIGINE', 'PAYS', 'PROVENANCE', 'COUNTRY', 'FABRIQUE_EN'],
  TAX: ['TVA', 'REGIME_TVA', 'TAX_SCHEME', 'CODE_TVA'],
  TAX_RATE: ['TAUX_TVA', 'VAT_RATE', 'TAUX_TAXE', 'VAT_PCT', 'POURCENT_TVA'],
  TAX_TYPE: ['TYPE_TAXE', 'NATURE_TVA'],
  ITEM_CREATED_DATE: ['DATE_CREATION', 'CREATED_AT', 'DATE_SAISIE', 'DATE_AJOUT'],
  ITEM_CREATED_BY: ['AUTEUR', 'USER_CREATE', 'CREE_PAR', 'OPERATEUR'],
  ITEM_UPDATED_BY: ['MODIFIE_PAR', 'USER_UPDATE', 'DERNIER_MODIFICATEUR'],
  AGING_STATUS: ['ROTATION', 'AGING', 'OBSOLESCENCE', 'ANCIENNETE', 'CYCLE_VIE'],
  ITEM_LOC_STATUS: ['STATUT_RAYON', 'LOC_STATUS', 'STATUS_MAGASIN', 'ACTIF', 'PRESENCE_RAYON'],
  ITEM_SOURCE: ['SOURCE', 'ERP_SOURCE', 'FEED_ORIGIN', 'ORIGINE_FICHIER'],
  IMAGE_PATH: ['IMAGE', 'PHOTO', 'PICTURE', 'LOGO_URL', 'VISUEL', 'URL_IMAGE'],
};

// Initializes initial field entries from base domain fields
function createInitialDictionary(): FieldAliasDefinition[] {
  const baseFields = Array.isArray(BASE_DOMAIN_FIELDS) ? BASE_DOMAIN_FIELDS : [];
  return baseFields.map((f: ExtendedDomainField) => {
    const keywords = DEFAULT_FIELD_KEYWORDS[f.key] || [];
    return {
      key: f.key,
      label: f.label,
      value_type: f.value_type,
      category: f.category || 'identity',
      is_volatile: f.is_volatile,
      numeric: f.numeric,
      default_aliases: [...(f.aliases || [])],
      custom_aliases: [],
      keywords: Array.from(new Set([...keywords, ...(f.aliases || []).map(a => normalizeToken(a))])),
      is_custom_field: false,
    };
  });
}

class MappingDictionaryManager {
  private dictionary: FieldAliasDefinition[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load() {
    this.dictionary = createInitialDictionary();
    api.prefsGet('mapping_dictionary').then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const initial = createInitialDictionary();
            const savedMap = new Map<string, any>(parsed.map(p => [p.key, p]));

            const merged: FieldAliasDefinition[] = initial.map(initDef => {
              const userSaved = savedMap.get(initDef.key);
              if (userSaved) {
                return {
                  ...initDef,
                  custom_aliases: Array.isArray(userSaved.custom_aliases) ? userSaved.custom_aliases : [],
                  keywords: Array.from(new Set([...initDef.keywords, ...(userSaved.keywords || [])])),
                };
              }
              return initDef;
            });

            for (const item of parsed) {
              if (item.is_custom_field && !merged.some(m => m.key === item.key)) {
                merged.push(item);
              }
            }

            this.dictionary = merged;
            this.notify();
          }
        } catch (e) {
          console.error('Failed to parse mapping dictionary from SQLite kv', e);
        }
      }
    }).catch(() => {});
  }

  private save() {
    api.prefsSet('mapping_dictionary', JSON.stringify(this.dictionary)).catch((e) => {
      console.error('Failed to persist mapping dictionary to SQLite kv', e);
    });
    this.notify();
  }

  private notify() {
    this.listeners.forEach(cb => {
      try {
        cb();
      } catch (err) {
        console.error('Error notifying listener in MappingDictionaryManager', err);
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getDictionary(): FieldAliasDefinition[] {
    return [...this.dictionary];
  }

  public getFieldByKey(key: string): FieldAliasDefinition | undefined {
    return this.dictionary.find(f => f.key === key);
  }

  /**
   * Adds a user alias to a specific domain field with duplicate detection and persistence
   */
  public addCustomAlias(key: string, rawAlias: string): { success: boolean; message?: string } {
    if (!key || !rawAlias) return { success: false, message: 'Clé ou alias vide' };
    const cleaned = rawAlias.trim();
    if (!cleaned) return { success: false, message: 'Alias vide' };

    const norm = normalizeToken(cleaned);

    // Check if alias is already used by another field
    for (const field of this.dictionary) {
      const allAliases = [...field.default_aliases, ...field.custom_aliases].map(a => normalizeToken(a));
      if (allAliases.includes(norm) || normalizeToken(field.key) === norm) {
        if (field.key === key) {
          return { success: false, message: `L'alias "${cleaned}" existe déjà pour ce champ.` };
        } else {
          return {
            success: false,
            message: `L'alias "${cleaned}" est déjà affecté au champ "${field.label}" [${field.key}].`,
          };
        }
      }
    }

    const target = this.dictionary.find(f => f.key === key);
    if (!target) return { success: false, message: `Champ canonique "${key}" introuvable.` };

    target.custom_aliases.push(cleaned);
    // Add to keyword index for automated detection
    if (!target.keywords.includes(norm)) {
      target.keywords.push(norm);
    }

    this.save();
    return { success: true };
  }

  /**
   * Removes a user custom alias
   */
  public removeCustomAlias(key: string, aliasToRemove: string): boolean {
    const target = this.dictionary.find(f => f.key === key);
    if (!target) return false;

    const initialLen = target.custom_aliases.length;
    target.custom_aliases = target.custom_aliases.filter(
      a => a.trim().toLowerCase() !== aliasToRemove.trim().toLowerCase()
    );

    if (target.custom_aliases.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Creates a new user custom domain field
   */
  public addCustomField(fieldDef: {
    key: string;
    label: string;
    value_type: 'text' | 'currency' | 'barcode' | 'number' | 'date' | 'promo';
    category?: 'identity' | 'pricing' | 'classification' | 'logistics' | 'lifecycle' | 'custom';
    initial_aliases?: string[];
  }): { success: boolean; message?: string } {
    const cleanKey = normalizeToken(fieldDef.key);
    if (!cleanKey) return { success: false, message: 'Clé de champ invalide.' };

    if (this.dictionary.some(f => f.key === cleanKey)) {
      return { success: false, message: `Un champ avec la clé "${cleanKey}" existe déjà.` };
    }

    const newField: FieldAliasDefinition = {
      key: cleanKey,
      label: fieldDef.label.trim() || cleanKey,
      value_type: fieldDef.value_type || 'text',
      category: fieldDef.category || 'custom',
      default_aliases: [],
      custom_aliases: fieldDef.initial_aliases ? fieldDef.initial_aliases.map(a => a.trim()).filter(Boolean) : [],
      keywords: [cleanKey, ...(fieldDef.initial_aliases || []).map(a => normalizeToken(a))],
      is_custom_field: true,
    };

    this.dictionary.push(newField);
    this.save();
    return { success: true };
  }

  public setFullDictionary(newDictionary: FieldAliasDefinition[]) {
    this.dictionary = [...newDictionary];
    this.save();
  }

  /**
   * Updates any field definition (predefined or custom)
   */
  public updateField(
    key: string,
    updatedData: {
      newKey?: string;
      label?: string;
      description?: string;
      value_type?: 'text' | 'currency' | 'barcode' | 'number' | 'date' | 'promo';
      category?: 'identity' | 'pricing' | 'classification' | 'logistics' | 'lifecycle' | 'custom';
      default_aliases?: string[];
      custom_aliases?: string[];
      keywords?: string[];
      is_volatile?: boolean;
      numeric?: boolean;
    }
  ): { success: boolean; message?: string } {
    const targetIdx = this.dictionary.findIndex((f) => f.key === key);
    if (targetIdx === -1) return { success: false, message: `Champ "${key}" introuvable.` };

    const target = this.dictionary[targetIdx];
    let finalKey = target.key;

    if (updatedData.newKey && updatedData.newKey !== key) {
      const cleanNewKey = normalizeToken(updatedData.newKey);
      if (!cleanNewKey) return { success: false, message: 'La nouvelle clé est invalide.' };
      if (this.dictionary.some((f, idx) => idx !== targetIdx && f.key === cleanNewKey)) {
        return { success: false, message: `La clé "${cleanNewKey}" existe déjà.` };
      }
      finalKey = cleanNewKey;
    }

    const default_aliases = updatedData.default_aliases !== undefined ? updatedData.default_aliases : target.default_aliases;
    const custom_aliases = updatedData.custom_aliases !== undefined ? updatedData.custom_aliases : target.custom_aliases;

    const allAliasesTokens = [...default_aliases, ...custom_aliases].map((a) => normalizeToken(a));
    const finalKeywords = updatedData.keywords
      ? Array.from(new Set([...updatedData.keywords, finalKey, ...allAliasesTokens]))
      : Array.from(new Set([...target.keywords, finalKey, ...allAliasesTokens]));

    this.dictionary[targetIdx] = {
      ...target,
      key: finalKey,
      label: updatedData.label !== undefined ? updatedData.label : target.label,
      description: updatedData.description !== undefined ? updatedData.description : target.description,
      value_type: updatedData.value_type !== undefined ? updatedData.value_type : target.value_type,
      category: updatedData.category !== undefined ? updatedData.category : target.category,
      default_aliases,
      custom_aliases,
      keywords: finalKeywords,
      is_volatile: updatedData.is_volatile !== undefined ? updatedData.is_volatile : target.is_volatile,
      numeric: updatedData.numeric !== undefined ? updatedData.numeric : target.numeric,
    };

    this.save();
    return { success: true };
  }

  /**
   * Duplicates an existing field definition
   */
  public duplicateField(
    sourceKey: string,
    newKey: string,
    newLabel?: string
  ): { success: boolean; message?: string } {
    const source = this.dictionary.find((f) => f.key === sourceKey);
    if (!source) return { success: false, message: `Champ source "${sourceKey}" introuvable.` };

    const cleanKey = normalizeToken(newKey);
    if (!cleanKey) return { success: false, message: 'La nouvelle clé est invalide.' };
    if (this.dictionary.some((f) => f.key === cleanKey)) {
      return { success: false, message: `La clé "${cleanKey}" existe déjà.` };
    }

    const duplicated: FieldAliasDefinition = {
      ...source,
      key: cleanKey,
      label: newLabel ? newLabel.trim() : `${source.label} (Copie)`,
      is_custom_field: true,
      default_aliases: [],
      custom_aliases: [...source.default_aliases, ...source.custom_aliases],
      keywords: Array.from(
        new Set([cleanKey, ...source.keywords, ...source.default_aliases.map((a) => normalizeToken(a))])
      ),
    };

    this.dictionary.push(duplicated);
    this.save();
    return { success: true };
  }

  /**
   * Deletes ANY domain field (predefined or custom)
   */
  public deleteField(key: string): boolean {
    const initialLen = this.dictionary.length;
    this.dictionary = this.dictionary.filter((f) => f.key !== key);
    if (this.dictionary.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Deletes a user custom domain field
   */
  public deleteCustomField(key: string): boolean {
    return this.deleteField(key);
  }

  /**
   * Resets dictionary to system factory defaults
   */
  public resetToDefaults() {
    this.dictionary = createInitialDictionary();
    this.save();
  }

  /**
   * Exports full dictionary as JSON
   */
  public exportDictionaryJson(): string {
    return JSON.stringify(this.dictionary, null, 2);
  }

  /**
   * Imports dictionary configuration from JSON backup
   */
  public importDictionaryJson(jsonStr: string): { success: boolean; message?: string } {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return { success: false, message: 'Format JSON invalide (tableau attendu).' };
      }
      // Validate schema
      for (const item of parsed) {
        if (!item.key || !item.label || !item.value_type) {
          return { success: false, message: `Élément invalide dans le dictionnaire: clé "${item.key || 'inconnue'}"` };
        }
      }
      this.dictionary = parsed;
      this.save();
      return { success: true };
    } catch (err) {
      return { success: false, message: `Erreur lors du parsing JSON: ${String(err)}` };
    }
  }

  /**
   * Multi-Level Automated Keyword & Pattern Detection Engine
   * Aligns any raw data source header to canonical application schema with confidence scoring.
   */
  public detectField(rawHeader: string, sampleValues?: any[]): MatchResult | null {
    if (!rawHeader || !rawHeader.trim()) return null;

    const raw = rawHeader.trim();
    const norm = normalizeToken(raw);
    const tokens = norm.split('_').filter(t => t.length > 1);

    // LEVEL 1: Exact Key Match (100% confidence)
    for (const field of this.dictionary) {
      if (normalizeToken(field.key) === norm) {
        return {
          canonical_key: field.key,
          field_label: field.label,
          confidence: 100,
          match_type: 'exact',
          matched_token: field.key,
          explanation: `Correspondance exacte avec la clé système [${field.key}]`,
        };
      }
    }

    // LEVEL 2: User Custom Alias Match (99% confidence)
    for (const field of this.dictionary) {
      for (const alias of field.custom_aliases) {
        if (normalizeToken(alias) === norm) {
          return {
            canonical_key: field.key,
            field_label: field.label,
            confidence: 99,
            match_type: 'user_alias',
            matched_token: alias,
            explanation: `Correspondance avec l'alias utilisateur personnalisé "${alias}"`,
          };
        }
      }
    }

    // LEVEL 3: Default Built-In Alias Match (95% confidence)
    for (const field of this.dictionary) {
      for (const alias of field.default_aliases) {
        if (normalizeToken(alias) === norm) {
          return {
            canonical_key: field.key,
            field_label: field.label,
            confidence: 95,
            match_type: 'default_alias',
            matched_token: alias,
            explanation: `Correspondance avec l'alias standard du commerce "${alias}"`,
          };
        }
      }
    }

    // LEVEL 4: High-Priority Regex Specializations (Pricing / Promo disambiguation)
    if (
      /^(PRIX_?PROMO|PROMO_?PRIX|PROMO_?PRICE|PV_?PROMO|NOUVEAU_?PRIX|PRIX_?SOLDE|SOLDE|SPECIAL_?PRICE|PRIX_?SPECIAL|DISCOUNT_?PRICE|PRIX_?REMISE|REMISE_?PRIX|PRIX_?CHOC|BARRE_?PRIX|PRIX_?PROMOTIONNEL)$/i.test(
        norm
      ) ||
      (norm.includes('PROMO') &&
        (norm.includes('PRIX') || norm.includes('PRICE') || norm.includes('PV') || norm.includes('TARIF')) &&
        !norm.includes('TEXT') &&
        !norm.includes('LABEL') &&
        !norm.includes('DATE') &&
        !norm.includes('FIN') &&
        !norm.includes('%') &&
        !norm.includes('PCT'))
    ) {
      const field = this.getFieldByKey('PROMOPRICE');
      if (field) {
        return {
          canonical_key: 'PROMOPRICE',
          field_label: field.label,
          confidence: 92,
          match_type: 'keyword_fuzzy',
          matched_token: 'PRIX_PROMO',
          explanation: 'Détection syntaxique avancée du Prix Promotionnel',
        };
      }
    }

    if (
      /^(PRIX|PRICE|PRIX_?VENTE|PV|PRIX_?STD|PRIX_?UNITAIRE|PRIX_?STANDARD|STANDARD_?PRICE|SELLING_?PRICE|TARIF_?PUBLIC|PRIX_?TTC|PU_?TTC)$/i.test(
        norm
      )
    ) {
      const field = this.getFieldByKey('SELLING_PRICE');
      if (field) {
        return {
          canonical_key: 'SELLING_PRICE',
          field_label: field.label,
          confidence: 90,
          match_type: 'keyword_fuzzy',
          matched_token: 'PRIX_VENTE',
          explanation: 'Détection syntaxique avancée du Prix de Vente Standard',
        };
      }
    }

    // LEVEL 5: Multi-Keyword & Token Overlap Fuzzy Detection (70% - 88% confidence)
    let bestMatch: { field: FieldAliasDefinition; score: number; matchedWord: string } | null = null;

    for (const field of this.dictionary) {
      const allAliasesAndKeywords = Array.from(
        new Set([
          ...field.keywords,
          ...field.default_aliases.map(a => normalizeToken(a)),
          ...field.custom_aliases.map(a => normalizeToken(a)),
        ])
      );

      let fieldScore = 0;
      let winningWord = '';

      for (const kw of allAliasesAndKeywords) {
        const kwNorm = normalizeToken(kw);
        if (!kwNorm) continue;

        // Exact substring token match (e.g. header is "CODE_BARRE_ARTICLE", kw is "CODE_BARRE")
        if (norm === kwNorm) {
          fieldScore = Math.max(fieldScore, 90);
          winningWord = kw;
        } else if (norm.startsWith(`${kwNorm}_`) || norm.endsWith(`_${kwNorm}`) || norm.includes(`_${kwNorm}_`)) {
          fieldScore = Math.max(fieldScore, 82);
          winningWord = kw;
        } else if (norm.includes(kwNorm) && kwNorm.length >= 4) {
          fieldScore = Math.max(fieldScore, 75);
          winningWord = kw;
        } else {
          // Token intersections
          for (const t of tokens) {
            if (t === kwNorm && t.length >= 3) {
              fieldScore = Math.max(fieldScore, 70);
              winningWord = t;
            }
          }
        }
      }

      if (fieldScore > (bestMatch?.score || 0)) {
        bestMatch = { field, score: fieldScore, matchedWord: winningWord };
      }
    }

    if (bestMatch && bestMatch.score >= 70) {
      return {
        canonical_key: bestMatch.field.key,
        field_label: bestMatch.field.label,
        confidence: bestMatch.score,
        match_type: 'keyword_fuzzy',
        matched_token: bestMatch.matchedWord,
        explanation: `Détecté par mot-clé contextuel : "${bestMatch.matchedWord}"`,
      };
    }

    // LEVEL 6: Data Value Pattern Heuristics (if sample data is provided)
    if (sampleValues && sampleValues.length > 0) {
      const nonNullSamples = sampleValues.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
      if (nonNullSamples.length > 0) {
        const firstVal = String(nonNullSamples[0]).trim();

        // 13 or 8-14 digit numeric string -> Barcode EAN/GTIN
        if (/^\d{8,14}$/.test(firstVal)) {
          const field = this.getFieldByKey('PRODUCT_SCAN');
          if (field) {
            return {
              canonical_key: 'PRODUCT_SCAN',
              field_label: field.label,
              confidence: 68,
              match_type: 'pattern_heuristic',
              matched_token: 'Format EAN/GTIN',
              explanation: 'Détecté par structure de données (Code numérique 8-14 chiffres)',
            };
          }
        }

        // Currency / Price format: "12,99 €" or "12.99"
        if (/^[\d\s.,]+(€|\$|EUR)?$/i.test(firstVal) && /\d/.test(firstVal)) {
          const num = parseFloat(firstVal.replace(/[^0-9.-]+/g, ''));
          if (!isNaN(num) && num > 0) {
            const field = this.getFieldByKey('SELLING_PRICE');
            if (field) {
              return {
                canonical_key: 'SELLING_PRICE',
                field_label: field.label,
                confidence: 65,
                match_type: 'pattern_heuristic',
                matched_token: 'Format Monétaire',
                explanation: 'Détecté par structure de données (Montant monétaire positif)',
              };
            }
          }
        }

        // URL format -> Image or QR Code URL
        if (/^https?:\/\//i.test(firstVal)) {
          const isImg = /\.(jpg|jpeg|png|webp|svg|gif)($|\?)/i.test(firstVal);
          const field = this.getFieldByKey(isImg ? 'IMAGE_PATH' : 'ITEM_SOURCE');
          if (field) {
            return {
              canonical_key: field.key,
              field_label: field.label,
              confidence: 65,
              match_type: 'pattern_heuristic',
              matched_token: isImg ? 'URL Image' : 'Lien Web',
              explanation: 'Détecté par structure de données (Lien HTTP/HTTPS)',
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Quick canonical key resolver for direct backward compatibility
   */
  public resolveCanonicalKey(inputHeader: string, sampleValues?: any[]): string | null {
    const res = this.detectField(inputHeader, sampleValues);
    return res ? res.canonical_key : null;
  }
}

// Export singleton instance
export const mappingDictionaryManager = new MappingDictionaryManager();

// Backward compatibility helper
export function resolveCanonicalKey(inputHeader: string, sampleValues?: any[]): string | null {
  return mappingDictionaryManager.resolveCanonicalKey(inputHeader, sampleValues);
}
