export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export const proofContentTypes: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const proofAcceptAttribute = Object.keys(proofContentTypes).join(",");

export type ProofValidation =
  | { ok: true; extension: string }
  | { ok: false; error: string };

export function validateProofFile(file: { type: string; size: number }): ProofValidation {
  const extension = proofContentTypes[file.type];
  if (!extension) return { ok: false, error: "證明檔案只接受 PDF、JPG、PNG 或 WebP。" };
  if (file.size <= 0) return { ok: false, error: "證明檔案是空的。" };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: "證明檔案最大 5MB。" };
  return { ok: true, extension };
}

export function proofObjectPath(input: {
  tenantId: string;
  authUserId: string;
  requestId: string;
  fileId: string;
  extension: string;
}): string {
  return `${input.tenantId}/${input.authUserId}/${input.requestId}/${input.fileId}.${input.extension}`;
}
