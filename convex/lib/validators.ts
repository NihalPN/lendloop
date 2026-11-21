import { v, ConvexError } from "convex/values";

export const userRoleValidator = v.union(
  v.literal("admin"),
  v.literal("user")
);

export const toolCategoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other")
);

export const toolConditionValidator = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn")
);

export const toolStatusValidator = v.union(
  v.literal("listed"),
  v.literal("removed")
);

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned")
);

export const automationEventTypeValidator = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
  v.literal("overdue_reminder")
);

export const automationEventStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed")
);

/**
 * Validates tool name and description boundaries per SPEC section 3.
 * Trims name, asserts 1-80 chars for trimmed name, and max 500 chars for description.
 */
export function validateToolFields({
  name,
  description,
}: {
  name: string;
  description: string;
}): { name: string; description: string } {
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Tool name must be between 1 and 80 characters",
    });
  }

  if (description.length > 500) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Tool description must be at most 500 characters",
    });
  }

  return {
    name: trimmedName,
    description,
  };
}

/**
 * Checks whether a string matches YYYY-MM-DD and is a real calendar date.
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Validates loan dates per SPEC section 3:
 * - startDate and endDate must be valid calendar dates formatted YYYY-MM-DD
 * - startDate >= today (UTC)
 * - startDate <= endDate
 * - duration is at most 30 days inclusive: (endDate - startDate) + 1 <= 30
 */
export function validateLoanDates({
  startDate,
  endDate,
  todayStr,
}: {
  startDate: string;
  endDate: string;
  todayStr: string;
}): void {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Dates must be valid calendar dates formatted as YYYY-MM-DD",
    });
  }

  if (startDate < todayStr) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Start date cannot be in the past",
    });
  }

  if (startDate > endDate) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "End date must be on or after start date",
    });
  }

  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  const durationInclusive = diffDays + 1;

  if (durationInclusive > 30) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Loan duration cannot exceed 30 days",
    });
  }
}
