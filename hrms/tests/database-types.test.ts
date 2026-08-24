import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase/migrations");
const migrationSql = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
  .join("\n")
  .toLowerCase();

const generatedTypes = readFileSync(
  join(process.cwd(), "lib/database.types.ts"),
  "utf8",
).toLowerCase();

const serverClient = readFileSync(
  join(process.cwd(), "lib/supabase/server.ts"),
  "utf8",
);

const adminClient = readFileSync(
  join(process.cwd(), "lib/supabase/admin.ts"),
  "utf8",
);

function uniqueMatches(pattern: RegExp) {
  return [...new Set([...migrationSql.matchAll(pattern)].map((match) => match[1]))];
}

describe("generated database types", () => {
  it("covers every versioned public table, function and enum", () => {
    const entities = [
      ...uniqueMatches(/create table public\.(\w+)/g),
      ...uniqueMatches(/create(?: or replace)? function public\.(\w+)/g),
      ...uniqueMatches(/create type public\.(\w+)/g),
    ].filter(
      (entity) =>
        ![
          "guard_published_schedule_assignment",
          "guard_published_shift_segment",
        ].includes(entity),
    );

    for (const entity of entities) {
      expect(generatedTypes, `${entity} is missing from database.types.ts`).toContain(
        `${entity}:`,
      );
    }
  });

  it("contains the production Employee Master view and current PostgREST metadata", () => {
    expect(generatedTypes).toContain("employee_master_current:");
    expect(generatedTypes).toContain("postgrestversion:");
  });

  it("binds both Supabase server boundaries to the application Database contract", () => {
    expect(serverClient).toContain('import type { Database } from "@/lib/database"');
    expect(serverClient).toContain("createServerClient<Database>");
    expect(adminClient).toContain('import type { Database } from "@/lib/database"');
    expect(adminClient).toContain("createClient<Database>");
  });
});
