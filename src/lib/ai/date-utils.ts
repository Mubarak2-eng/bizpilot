/**
 * Server-side date range resolver for natural language date phrases.
 * Enforces bounded UTC/business date ranges.
 */

export interface DateRange {
  startDate?: Date;
  endDate?: Date;
  description: string;
}

export function resolveDateRange(
  datePhrase?: string | null,
  customStart?: string | null,
  customEnd?: string | null,
  referenceDate: Date = new Date()
): DateRange {
  // If custom ISO start/end are provided and valid
  if (customStart || customEnd) {
    const start = customStart ? new Date(customStart) : undefined;
    const end = customEnd ? new Date(customEnd) : undefined;

    const validStart = start && !isNaN(start.getTime()) ? start : undefined;
    const validEnd = end && !isNaN(end.getTime()) ? end : undefined;

    return {
      startDate: validStart,
      endDate: validEnd,
      description: `Custom date range: ${validStart?.toISOString().split("T")[0] || "any"} to ${validEnd?.toISOString().split("T")[0] || "any"}`,
    };
  }

  if (!datePhrase) {
    return {
      startDate: undefined,
      endDate: undefined,
      description: "All-time",
    };
  }

  const normalized = datePhrase.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed
  const date = referenceDate.getDate();

  switch (normalized) {
    case "today": {
      const start = new Date(year, month, date, 0, 0, 0, 0);
      const end = new Date(year, month, date, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: `Today (${start.toISOString().split("T")[0]})`,
      };
    }

    case "yesterday": {
      const start = new Date(year, month, date - 1, 0, 0, 0, 0);
      const end = new Date(year, month, date - 1, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: `Yesterday (${start.toISOString().split("T")[0]})`,
      };
    }

    case "this_week":
    case "week": {
      // Day of week: 0 is Sunday, 1 is Monday
      const day = referenceDate.getDay();
      const diff = referenceDate.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const start = new Date(year, month, diff, 0, 0, 0, 0);
      const end = new Date(year, month, diff + 6, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: `This week (${start.toISOString().split("T")[0]} to ${end.toISOString().split("T")[0]})`,
      };
    }

    case "this_month":
    case "month": {
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: `This month (${start.toLocaleString("default", { month: "long", year: "numeric" })})`,
      };
    }

    case "last_month": {
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: `Last month (${start.toLocaleString("default", { month: "long", year: "numeric" })})`,
      };
    }

    case "last_7_days":
    case "7_days": {
      const start = new Date(year, month, date - 7, 0, 0, 0, 0);
      const end = new Date(year, month, date, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: "Past 7 days",
      };
    }

    case "last_30_days":
    case "30_days": {
      const start = new Date(year, month, date - 30, 0, 0, 0, 0);
      const end = new Date(year, month, date, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: "Past 30 days",
      };
    }

    case "this_year":
    case "year": {
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      return {
        startDate: start,
        endDate: end,
        description: `This year (${year})`,
      };
    }

    default:
      return {
        startDate: undefined,
        endDate: undefined,
        description: `All-time (unrecognized phrase "${datePhrase}")`,
      };
  }
}
