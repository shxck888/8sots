import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const compensationSchema = z.object({
  employeeId: uuid, effectiveFrom: date,
  monthlyBase: z.coerce.number().min(0).max(10_000_000),
  note: z.string().max(200).default(""),
});
export const payrollPeriodSchema = z.object({ periodMonth: z.string().regex(/^\d{4}-\d{2}$/), payDate: date });
export const payrollIdSchema = z.object({ periodId: uuid });
export const payrollStatusSchema = z.object({ periodId: uuid, status: z.enum(["draft", "reviewed", "locked"]) });
export const payrollAdjustmentSchema = z.object({
  entryId: uuid, kind: z.enum(["earning", "deduction"]), name: z.string().trim().min(1).max(40),
  amount: z.coerce.number().positive().max(10_000_000), note: z.string().max(200).default(""),
});

export function toCents(amount: number) { return Math.round(amount * 100); }
export function formatMoney(cents: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(cents / 100);
}

export const payrollStatusLabels = { draft: "草稿", reviewed: "已核對", locked: "已鎖定" } as const;
