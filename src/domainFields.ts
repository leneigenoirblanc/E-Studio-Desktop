import { DomainField } from './types';

export interface ExtendedDomainField extends DomainField {
  is_volatile?: boolean;
  category?: 'identity' | 'pricing' | 'classification' | 'logistics' | 'lifecycle' | 'custom';
}

export const DOMAIN_FIELDS: ExtendedDomainField[] = [
  // 1. Core Identity & Item Master
  { key: 'STORE_NAME', label: 'Nom du magasin (STORE_NAME)', value_type: 'text', aliases: ['STORE', 'MAGASIN', 'ENSEIGNE', 'STORE_ID'], category: 'identity' },
  { key: 'PRODUCT_SCAN', label: 'Code-barres EAN/GTIN (PRODUCT_SCAN)', value_type: 'barcode', aliases: ['EAN', 'GTIN', 'BARCODE', 'CB', 'CODE_BARRE', 'GENCOD'], category: 'identity' },
  { key: 'PARTNO', label: 'Référence / SKU (PARTNO)', value_type: 'text', aliases: ['SKU', 'PART NUMBER', 'REF', 'REFERENCE', 'CODE_ARTICLE', 'ARTICLE_NO'], category: 'identity' },
  { key: 'ITEMNAME', label: 'Nom produit (ITEMNAME)', value_type: 'text', aliases: ['PRODUCT NAME', 'NAME', 'DESIGNATION', 'LIBELLE', 'ARTICLE', 'PRODUIT'], category: 'identity' },
  { key: 'ITEMDESCRIPTION', label: 'Description détaillée (ITEMDESCRIPTION)', value_type: 'text', aliases: ['DESCRIPTION', 'DETAIL', 'SOUS_TITRE', 'DESC'], category: 'identity' },
  { key: 'BRAND_INFO', label: 'Marque (BRAND_INFO)', value_type: 'text', aliases: ['BRAND', 'MARQUE', 'FABRICANT', 'BRAND_NAME'], category: 'identity' },
  { key: 'HSCOD', label: 'Code Douanier / SH (HSCOD)', value_type: 'text', aliases: ['HS_CODE', 'CODE_DOUANE', 'TARIC', 'SH_CODE'], category: 'identity' },

  // 2. Classification & Department
  { key: 'DIV_NAME', label: 'Division (DIV.NAME)', value_type: 'text', aliases: ['DIV.NAME', 'DIVISION', 'SECTEUR', 'DIV_NAME'], category: 'classification' },
  { key: 'DEPT_NAME', label: 'Département (DEPT NAME)', value_type: 'text', aliases: ['DEPARTMENT', 'DEP', 'DEPT_NAME', 'RAYON_PRINCIPAL'], category: 'classification' },
  { key: 'CATEGORY_NAME', label: 'Catégorie (CATEGORY NAME)', value_type: 'text', aliases: ['CATEGORY', 'FAMILLE', 'RAYON', 'CATEGORIE'], category: 'classification' },
  { key: 'SUB_CATEGORY_NAME', label: 'Sous-Catégorie (SUB CATEGORY NAME)', value_type: 'text', aliases: ['SUBCATEGORY', 'SOUS_FAMILLE', 'SOUS_CATEGORIE'], category: 'classification' },

  // 3. Volatile & Fast-Changing Pricing Fields (with is_volatile: true)
  { key: 'SELLING_UNIT', label: 'Unité de Vente (SELLING UNIT)', value_type: 'text', aliases: ['UNITE', 'UNIT', 'UVC', 'SELLING_UNIT'], is_volatile: true, category: 'pricing' },
  { key: 'SELLING_PRICE', label: 'Prix de Vente (SELLING PRICE)', value_type: 'currency', aliases: ['PRICE', 'PRIX', 'PRIX_VENTE', 'PV', 'PRIX_UNITAIRE', 'PRIX_STD'], numeric: true, is_volatile: true, category: 'pricing' },
  { key: 'PROMOPRICE', label: 'Prix Promo (PROMOPRICE)', value_type: 'currency', aliases: ['PROMO PRICE', 'PROMO', 'PRIX_PROMO', 'PV_PROMO', 'NOUVEAU_PRIX', 'PRIX_CHOC'], numeric: true, is_volatile: true, category: 'pricing' },
  { key: 'PROMO_START_DATE', label: 'Début de Promo (PROMO START DATE)', value_type: 'date', aliases: ['PROMO_START', 'DATE_DEBUT_PROMO', 'DEBUT_PROMO'], is_volatile: true, category: 'pricing' },
  { key: 'PROMO_END_DATE', label: 'Fin de Promo (PROMO END DATE)', value_type: 'date', aliases: ['PROMO_END', 'DATE_FIN_PROMO', 'PROMO_EXPIRATION', 'FIN_PROMO'], is_volatile: true, category: 'pricing' },
  { key: 'PROMO_PERIOD', label: 'Période Promo (PROMO PERIOD)', value_type: 'text', aliases: ['PERIODE_PROMO', 'PROMO_DATES'], is_volatile: true, category: 'pricing' },
  { key: 'LAST_SELLING_PRICE', label: 'Dernier Prix (LAST SELLING PRICE)', value_type: 'currency', aliases: ['ANCIEN_PRIX', 'PREVIOUS_PRICE', 'PRIX_AVANT', 'LAST_PRICE'], numeric: true, is_volatile: true, category: 'pricing' },
  { key: 'DISCOUNT_PCT', label: 'Taux de Remise (%)', value_type: 'number', aliases: ['REMISE', 'POURCENTAGE', 'DISCOUNT', 'REDUC', 'PROMO_%', 'TAUX_REMISE'], numeric: true, is_volatile: true, category: 'pricing' },
  { key: 'PROMO_LABEL', label: 'Libellé Promo (BOGO / Flash)', value_type: 'promo', aliases: ['OFFRE', 'PROMO_TEXT', 'PROMOTION', 'TYPE_PROMO', 'MESSAGE_PROMO', 'BADGE'], category: 'pricing' },
  { key: 'UNIT_PRICE_TEXT', label: 'Prix au Kg / Litre', value_type: 'text', aliases: ['PRIX_KILO', 'PRIX_LITRE', 'PRIX_POIDS', 'PRIX_MESURE', 'UNIT_PRICE'], category: 'pricing' },
  { key: 'ECO_TAX', label: 'Éco-participation (ECO_TAX)', value_type: 'text', aliases: ['ECO_PART', 'ECO_TAXE', 'DEEE', 'TAXE_ECO'], category: 'pricing' },

  // 4. Logistics, Packaging & Vendor
  { key: 'PACK_UNIT', label: 'Conditionnement (PACK UNIT)', value_type: 'text', aliases: ['PACK', 'CONDITIONNEMENT', 'FORMAT', 'CONTENANCE', 'PACK_SIZE'], category: 'logistics' },
  { key: 'VENDOR_NAME', label: 'Fournisseur (VENDOR NAME)', value_type: 'text', aliases: ['VENDOR', 'FOURNISSEUR', 'FOURN'], category: 'logistics' },
  { key: 'SUPPLIER', label: 'Grossiste / Distributeur (SUPPLIER)', value_type: 'text', aliases: ['GROSSISTE', 'DISTRIBUTEUR', 'CENTRALE'], category: 'logistics' },
  { key: 'ITEM_TYPE', label: 'Type Article (ITEM_TYPE)', value_type: 'text', aliases: ['TYPE', 'NATURE_ARTICLE'], category: 'logistics' },
  { key: 'CASE_SIZE', label: 'Colisage / PCB (CASE SIZE)', value_type: 'number', aliases: ['CASE QTY', 'COLISAGE', 'PCB', 'CARTON_QTY'], numeric: true, category: 'logistics' },
  { key: 'CASE_UNIT', label: 'Unité Carton (CASE UNIT)', value_type: 'text', aliases: ['UNITE_COLIS', 'CARTON_UNIT'], category: 'logistics' },
  { key: 'NET_WEIGHT_KG', label: 'Poids Net (kg)', value_type: 'number', aliases: ['POIDS_NET', 'NET_WEIGHT', 'POIDS_KG', 'WEIGHT'], numeric: true, category: 'logistics' },
  { key: 'VOLUME_L', label: 'Volume (L)', value_type: 'number', aliases: ['VOLUME', 'CONTENANCE_L', 'LITRES'], numeric: true, category: 'logistics' },
  { key: 'ORIGIN_COUNTRY', label: 'Pays d\'Origine', value_type: 'text', aliases: ['ORIGINE', 'PAYS', 'ORIGIN', 'PROVENANCE'], category: 'logistics' },

  // 5. Tax & Fiscal
  { key: 'TAX', label: 'Régime TVA / Taxe (TAX)', value_type: 'text', aliases: ['TVA', 'REGIME_TVA'], category: 'pricing' },
  { key: 'TAX_RATE', label: 'Taux TVA % (TAX RATE)', value_type: 'number', aliases: ['VAT RATE', 'TAUX_TVA', 'VAT_%'], numeric: true, category: 'pricing' },
  { key: 'TAX_TYPE', label: 'Type Taxe (TAX TYPE)', value_type: 'text', aliases: ['TYPE_TAXE', 'NATURE_TVA'], category: 'pricing' },

  // 6. Product Lifecycle & Status
  { key: 'ITEM_CREATED_DATE', label: 'Date Création (ITEM CREATED DATE)', value_type: 'date', aliases: ['CREATED_AT', 'DATE_CREATION'], category: 'lifecycle' },
  { key: 'ITEM_CREATED_BY', label: 'Créé Par (ITEM CREATED BY)', value_type: 'text', aliases: ['AUTEUR', 'USER_CREATE'], category: 'lifecycle' },
  { key: 'ITEM_UPDATED_BY', label: 'Modifié Par (ITEM UPDATED BY)', value_type: 'text', aliases: ['MODIFIE_PAR', 'USER_UPDATE'], category: 'lifecycle' },
  { key: 'AGING_STATUS', label: 'Statut Vieillissement (Aging Status)', value_type: 'text', aliases: ['AGING', 'ROTATION', 'ANCIENNETE', 'OBSOLESCENCE'], category: 'lifecycle' },
  { key: 'ITEM_LOC_STATUS', label: 'Statut Emplacement (Item/Loc Status)', value_type: 'text', aliases: ['LOC_STATUS', 'STATUT_RAYON', 'STATUS_MAGASIN', 'ACTIVE_STATUS'], category: 'lifecycle' },
  { key: 'ITEM_SOURCE', label: 'Source Données (ITEM SOURCE)', value_type: 'text', aliases: ['SOURCE', 'ERP_SOURCE', 'FEED_ORIGIN'], category: 'lifecycle' },
  { key: 'IMAGE_PATH', label: 'Image Produit (IMAGE_PATH)', value_type: 'text', aliases: ['IMAGE', 'PHOTO', 'PICTURE', 'LOGO_URL'], category: 'identity' },
];

export const DOMAIN_FIELD_MAP = new Map(DOMAIN_FIELDS.map(f => [f.key, f]));
