export type HealthStatus = {
  status: "ok";
  service: "restaurant-ehr";
  timestamp: string;
};

export function createHealthStatus(now = new Date()): HealthStatus {
  return {
    status: "ok",
    service: "restaurant-ehr",
    timestamp: now.toISOString(),
  };
}
