import { z } from "zod";

const uuid = z.string().uuid();
const date = z.iso.date();
const money = z.union([z.string(), z.number().finite()])
  .transform((value) => String(value).trim())
  .pipe(z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/))
  .refine((value) => Number(value) <= 10_000_000);

export const compensationSchema = z.object({
  employeeId: uuid, effectiveFrom: date,
  payBasis: z.enum(["monthly", "hourly"]),
  rate: money,
  note: z.string().max(200).default(""),
});
export const payrollPeriodSchema = z.object({
  periodMonth: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  payDate: z.union([z.literal(""), date]).optional().transform((value) => value || null),
});
export const payrollIdSchema = z.object({ periodId: uuid });
export const payrollStatusSchema = z.object({ periodId: uuid, status: z.enum(["draft", "reviewed", "locked"]) });
export const payrollAdjustmentSchema = z.object({
  entryId: uuid, kind: z.enum(["earning", "deduction"]), name: z.string().trim().min(1).max(40),
  amount: money.refine((value) => Number(value) > 0), note: z.string().max(200).default(""),
  idempotencyKey: uuid,
});
export const payrollReviewSchema = z.object({ periodId: uuid, reviewNote: z.string().trim().min(10).max(1000) });
export const payrollItemSchema = z.object({ itemId: uuid });

export function toCents(amount: string | number) {
  const value = String(amount).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error("invalid money");
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("money exceeds safe range");
  return Number(cents);
}
export function formatMoney(cents: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(cents / 100);
}

export const payrollStatusLabels = { draft: "草稿", reviewed: "已核對", locked: "已鎖定" } as const;
export const payBasisLabels = { monthly: "月薪", hourly: "時薪" } as const;
