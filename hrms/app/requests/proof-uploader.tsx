"use client";

import { Paperclip, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { proofAcceptAttribute } from "@/lib/work-request-proofs";
import { attachWorkRequestProof } from "./actions";

type Attachment = { id: string; file_name: string };

export function ProofUploader({ requestId, attachments }: {
  requestId: string;
  attachments: Attachment[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("請先選擇檔案。");
      return;
    }
    startTransition(async () => {
      const result = await attachWorkRequestProof(formData);
      setMessage(result.message);
      if (result.ok) formRef.current?.reset();
    });
  }

  return (
    <div className="proof-uploader">
      {attachments.length > 0 ? (
        <ul className="proof-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}><Paperclip size={13} /> {attachment.file_name}</li>
          ))}
        </ul>
      ) : null}
      <form action={submit} ref={formRef} className="proof-form">
        <input name="requestId" type="hidden" value={requestId} />
        <label className="proof-file">
          <Upload size={13} /> 選擇證明
          <input accept={proofAcceptAttribute} className="sr-only" disabled={pending} name="proof" type="file" />
        </label>
        <button className="text-button" disabled={pending} type="submit">{pending ? "上傳中…" : "上傳"}</button>
      </form>
      {message ? <small aria-live="polite" className="proof-message">{message}</small> : null}
    </div>
  );
}
