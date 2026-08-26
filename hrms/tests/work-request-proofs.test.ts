import { describe, expect, it } from "vitest";
import {
  PROOF_MAX_BYTES,
  proofAcceptAttribute,
  proofObjectPath,
  validateProofFile,
} from "../lib/work-request-proofs";

describe("work request proof validation", () => {
  it("accepts the allowed content types and maps extensions", () => {
    expect(validateProofFile({ type: "application/pdf", size: 1000 })).toEqual({ ok: true, extension: "pdf" });
    expect(validateProofFile({ type: "image/jpeg", size: 1000 })).toEqual({ ok: true, extension: "jpg" });
    expect(validateProofFile({ type: "image/png", size: 1000 })).toEqual({ ok: true, extension: "png" });
    expect(validateProofFile({ type: "image/webp", size: 1000 })).toEqual({ ok: true, extension: "webp" });
  });

  it("rejects unsupported types, empty and oversized files", () => {
    expect(validateProofFile({ type: "text/plain", size: 100 }).ok).toBe(false);
    expect(validateProofFile({ type: "application/pdf", size: 0 }).ok).toBe(false);
    expect(validateProofFile({ type: "application/pdf", size: PROOF_MAX_BYTES + 1 }).ok).toBe(false);
    expect(validateProofFile({ type: "application/pdf", size: PROOF_MAX_BYTES }).ok).toBe(true);
  });

  it("builds a tenant/uploader/request scoped object path", () => {
    const path = proofObjectPath({
      tenantId: "t1", authUserId: "u1", requestId: "r1", fileId: "f1", extension: "pdf",
    });
    expect(path).toBe("t1/u1/r1/f1.pdf");
    // folder[1] is the tenant, folder[2] is the uploader — matching the storage policy.
    expect(path.split("/")[0]).toBe("t1");
    expect(path.split("/")[1]).toBe("u1");
  });

  it("exposes an accept attribute covering every allowed type", () => {
    expect(proofAcceptAttribute).toContain("application/pdf");
    expect(proofAcceptAttribute).toContain("image/jpeg");
  });
});
