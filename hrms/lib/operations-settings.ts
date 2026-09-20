import { z } from "zod";

const finiteNumber = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);
const integer = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const workplaceSettingsSchema = z.object({
  effectiveFrom: z.iso.date(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  latitude: finiteNumber(-90, 90),
  longitude: finiteNumber(-180, 180),
  radiusM: integer(10, 5000),
  maxAccuracyM: integer(1, 1000),
  mode: z.enum(["evidence", "enforced"]),
});

export const payrollSettingsSchema = z.object({
  effectiveFrom: z.iso.date(),
  closingDay: integer(1, 31),
  payDay: integer(1, 31),
  payMonthOffset: integer(0, 2),
  defaultBasis: z.enum(["monthly", "hourly"]),
  note: z.string().trim().max(500).default(""),
});

export const workplaceModeLabels = {
  evidence: "只記錄定位，不阻擋打卡",
  enforced: "必須在門市範圍內才能打卡",
} as const;

export const payBasisLabels = { monthly: "月薪", hourly: "時薪" } as const;
