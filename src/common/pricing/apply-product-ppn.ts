/**
 * Mirrors FE `computePriceIdrWithPpn` — list price × (1 + PPN%).
 */
export function applyProductPpnToBaseIdr(
  baseIdr: number,
  ppnRatePercent: number | string | null | undefined,
): number {
  const base = Number.isFinite(Number(baseIdr)) ? Math.max(0, Number(baseIdr)) : 0;
  const raw = Number(ppnRatePercent);
  const rate =
    Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.max(0, raw)) : 0;
  return Math.round(base * (1 + rate / 100));
}
