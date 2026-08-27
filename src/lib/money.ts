export type DecimalValue = number | string | { toString(): string };

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "GH₵",
  KES: "KSh",
  ZAR: "R",
  CAD: "CA$",
};

/**
 * Formats a monetary amount into a clean currency string.
 * e.g., formatMoney(25000, "NGN") => "₦25,000.00"
 */
export function formatMoney(
  amount: DecimalValue | null | undefined,
  currency = "NGN"
): string {
  if (amount === null || amount === undefined) {
    return `${CURRENCY_SYMBOLS[currency] || currency} 0.00`;
  }

  const num = typeof amount === "number"
    ? amount
    : typeof amount === "string"
    ? parseFloat(amount) || 0
    : Number(amount.toString()) || 0;

  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  return `${symbol}${formatted}`;
}

/**
 * Safely parses a string or number into a 2-decimal string for Prisma Decimal.
 */
export function toDecimalString(val: DecimalValue): string {
  if (typeof val === "number") {
    return val.toFixed(2);
  }
  if (typeof val === "string") {
    const parsed = parseFloat(val.replace(/,/g, ""));
    return isNaN(parsed) ? "0.00" : parsed.toFixed(2);
  }
  return Number(val.toString()).toFixed(2);
}
