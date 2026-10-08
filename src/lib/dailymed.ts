// Ported from rx-tracker-web's lib/dailymed-ndc.ts + lib/dailymed.ts. Expo has
// no server-side routes, so unlike the web app (which goes through
// /api/dailymed-proxy) this calls openFDA's NDC directory directly: it needs
// no key and sends `access-control-allow-origin: *`, so a plain fetch works
// from native and from Expo web alike.
//
// The NDC directory (https://api.fda.gov/drug/ndc.json) is the structured
// source for "every strength this drug comes in" and the SPL document
// (openfda.spl_set_id) each listing belongs to. Response shape (verified
// against the live endpoint):
//   results[]: { generic_name, brand_name, dosage_form,
//     active_ingredients?: [{ name, strength: ".25 mg/1" | "1 mg/mL" | ... }],
//     openfda?: { spl_set_id?: string[] } }
// active_ingredients and openfda.spl_set_id are each missing on some
// listings; zero matches come back as HTTP 404 { error: { code: NOT_FOUND } }.
import { parseStrength } from "@/lib/utils";

const OPENFDA_NDC_BASE = "https://api.fda.gov/drug/ndc.json";

export interface NdcProduct {
  name: string;
  doseAmount: number | null;
  doseUnit: string | null;
  // Display form of the strength, e.g. "2mg", "1mg/mL", "20/12.5mg".
  strengthLabel: string;
  setId: string | null;
}

export interface NdcSuggestion extends NdcProduct {
  label: string;
}

const LOWERCASE_WORDS = new Set(["and", "of", "in", "with", "for", "to", "the"]);

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z]+)/g, (_, sep: string, word: string, offset: number) =>
      offset > 0 && LOWERCASE_WORDS.has(word) ? sep + word : sep + word[0].toUpperCase() + word.slice(1),
    );
}

function cleanNumber(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

function strengthLabelFor(strengths: string[]): string {
  if (strengths.length === 0) return "";
  const parsed = strengths.map(parseStrength);
  if (parsed.every((p) => p)) {
    const units = new Set(parsed.map((p) => p!.unit));
    if (units.size === 1) {
      return `${parsed.map((p) => p!.amount).join("/")}${[...units][0]}`;
    }
  }
  return strengths
    .map((s) => s.replace(/(\d*\.?\d+)/g, (m) => cleanNumber(m)).replace(/\s+/g, ""))
    .join(" / ");
}

export function normalizeNdcProducts(data: unknown): NdcProduct[] {
  const results =
    data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
      ? ((data as { results: unknown[] }).results as Record<string, unknown>[])
      : [];

  const products: NdcProduct[] = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const brand = typeof result.brand_name === "string" ? result.brand_name.trim() : "";
    const generic = typeof result.generic_name === "string" ? result.generic_name.trim() : "";
    if (!brand && !generic) continue;
    // A generic's brand_name is just its generic name (in varying case);
    // title-case those, keep real brand names (RISPERDAL) as listed.
    const name =
      !brand || brand.toLowerCase() === generic.toLowerCase() ? titleCase(generic || brand) : brand;

    const strengths = Array.isArray(result.active_ingredients)
      ? (result.active_ingredients as { strength?: unknown }[])
          .map((ingredient) => (typeof ingredient?.strength === "string" ? ingredient.strength : ""))
          .filter(Boolean)
      : [];
    // Only a single-ingredient, per-dosage-unit strength is a usable dose.
    const parsed = strengths.length === 1 ? parseStrength(strengths[0]) : null;

    const openfda = result.openfda as { spl_set_id?: unknown } | undefined;
    const setIds = Array.isArray(openfda?.spl_set_id) ? openfda.spl_set_id : [];
    const setId = setIds.find((id): id is string => typeof id === "string" && id.length > 0) ?? null;

    products.push({
      name,
      doseAmount: parsed?.amount ?? null,
      doseUnit: parsed?.unit ?? null,
      strengthLabel: strengthLabelFor(strengths),
      setId,
    });
  }
  return products;
}

const MAX_SUGGESTIONS = 30;

// One suggestion per distinct name + strength (the directory lists the same
// product once per labeler/package), carrying the first SPL set id seen.
export function toSuggestions(products: NdcProduct[], strengthFilter?: number | null): NdcSuggestion[] {
  const byKey = new Map<string, NdcSuggestion>();
  for (const product of products) {
    if (
      strengthFilter != null &&
      !(product.doseAmount != null && String(product.doseAmount).startsWith(String(strengthFilter)))
    ) {
      continue;
    }
    const key = `${product.name.toLowerCase()}|${product.strengthLabel}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.setId && product.setId) existing.setId = product.setId;
      continue;
    }
    byKey.set(key, {
      ...product,
      label: product.strengthLabel ? `${product.name} ${product.strengthLabel}` : product.name,
    });
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
        (a.doseAmount ?? Infinity) - (b.doseAmount ?? Infinity) ||
        a.strengthLabel.localeCompare(b.strengthLabel),
    )
    .slice(0, MAX_SUGGESTIONS);
}

// "risperidone 3", "rispe 0.5mg", "lisinopril hydro" → name words plus an
// optional leading strength number the user has started typing.
export function parseSearchTerm(term: string): { words: string[]; strength: number | null } {
  let text = term.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").trim();
  let strength: number | null = null;
  const tail = text.match(/\s(\d+(?:\.\d+)?|\.\d+)\s*(?:mg|mcg|ug|g|ml|iu|units?)?$/);
  if (tail && text.slice(0, tail.index).trim()) {
    strength = Number(tail[1]);
    text = text.slice(0, tail.index).trim();
  }
  const words = text.split(/\s+/).map((w) => w.replace(/\./g, "")).filter(Boolean);
  return { words, strength };
}

export function ndcSearchUrl(words: string[]): string {
  const expr = words.map((w, i) => (i === words.length - 1 ? `${w}*` : w)).join(" AND ");
  const search = `(brand_name:(${expr}) OR generic_name:(${expr})) AND finished:true`;
  return `${OPENFDA_NDC_BASE}?search=${encodeURIComponent(search)}&limit=100`;
}

export interface DrugSuggestion {
  label: string;
  name: string;
  doseAmount: number | null;
  doseUnit: string | null;
  setId: string | null;
}

// Name + strength suggestions ("Risperidone 3mg"). Resolves to [] on any
// failure or no match, so the name field simply stays free-text.
export async function searchDrugSuggestions(term: string, signal?: AbortSignal): Promise<DrugSuggestion[]> {
  const { words, strength } = parseSearchTerm(term);
  if (words.length === 0) return [];

  const response = await fetch(ndcSearchUrl(words), { signal });
  if (!response.ok) return [];
  const data: unknown = await response.json();
  return toSuggestions(normalizeNdcProducts(data), strength);
}
