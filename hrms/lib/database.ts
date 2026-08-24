import type { Database as GeneratedDatabase } from "@/lib/database.types";

type PublicSchema = GeneratedDatabase["public"];
type GeneratedFunctions = PublicSchema["Functions"];
type NullableEmployeeMasterKeys =
  | "p_national_id_ciphertext"
  | "p_national_id_hash"
  | "p_national_id_last4"
  | "p_supervisor_employee_id"
  | "p_termination_date"
  | "p_probation_end_date";

type WithNullableFields<
  Value,
  Keys extends keyof Value,
> = Omit<Value, Keys> & { [Key in Keys]: Value[Key] | null };

type EmployeeMasterFunctions = {
  create_employee_master: Omit<GeneratedFunctions["create_employee_master"], "Args"> & {
    Args: WithNullableFields<
      GeneratedFunctions["create_employee_master"]["Args"],
      NullableEmployeeMasterKeys
    >;
  };
  update_employee_master: Omit<GeneratedFunctions["update_employee_master"], "Args"> & {
    Args: WithNullableFields<
      GeneratedFunctions["update_employee_master"]["Args"],
      NullableEmployeeMasterKeys
    >;
  };
};

/**
 * Application database contract.
 *
 * Supabase's generated function types cannot infer nullable PostgreSQL function
 * arguments. The Employee Master RPC intentionally accepts null for unchanged
 * encrypted identity fields and optional employment relationships, so those
 * arguments are overlaid here while the generated file stays reproducible.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: Omit<
      GeneratedFunctions,
      keyof EmployeeMasterFunctions
    > & EmployeeMasterFunctions;
  };
};
