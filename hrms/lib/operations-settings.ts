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

const percentage = finiteNumber(0, 100);
const overtimeMultiplier = finiteNumber(1, 5);

export const payrollStatutorySettingsSchema = z.object({
  effectiveFrom: z.iso.date(),
  laborInsuranceRate: percentage,
  laborEmployeeShare: percentage,
  employmentInsuranceRate: percentage,
  employmentEmployeeShare: percentage,
  healthInsuranceRate: percentage,
  healthEmployeeShare: percentage,
  pensionEmployerRate: percentage,
  monthlyHourDivisor: integer(1, 744),
  overtimeTier1Minutes: integer(0, 480),
  overtimeTier1Multiplier: overtimeMultiplier,
  overtimeTier2Minutes: integer(0, 480),
  overtimeTier2Multiplier: overtimeMultiplier,
  overtimeTier3Minutes: integer(0, 480),
  overtimeTier3Multiplier: overtimeMultiplier,
  sourceNote: z.string().trim().min(5).max(500),
});

export const annualLeavePolicySchema = z.object({
  effectiveFrom: z.iso.date(),
  standardDayMinutes: integer(60, 720),
  sourceNote: z.string().trim().min(5).max(500),
});

export function percentageToPpm(value: number) {
  return Math.round(value * 10_000);
}

export function multiplierToPpm(value: number) {
  return Math.round(value * 1_000_000);
}

export function ppmToPercentage(value: number | null | undefined) {
  return Number(value ?? 0) / 10_000;
}

export function ppmToMultiplier(value: number | null | undefined) {
  return Number(value ?? 1_000_000) / 1_000_000;
}

export const workplaceModeLabels = {
  evidence: "只記錄定位，不阻擋打卡",
  enforced: "必須在門市範圍內才能打卡",
} as const;

export const payBasisLabels = { monthly: "月薪", hourly: "時薪" } as const;
