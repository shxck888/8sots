"use client";

import { Send, X } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

export function PublishButton({ disabled = false }: { disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { pending } = useFormStatus();

  if (confirming) {
    return (
      <div className="schedule-publish-confirm" role="group" aria-label="確認發布班表">
        <button
          className="admin-button secondary"
          disabled={pending}
          onClick={() => setConfirming(false)}
          type="button"
        >
          <X size={16} /> 取消
        </button>
        <button className="admin-button primary" disabled={pending} type="submit">
          <Send size={16} /> {pending ? "發布中…" : "確認發布"}
        </button>
      </div>
    );
  }

  return (
    <button
      className="admin-button secondary"
      disabled={disabled || pending}
      onClick={() => setConfirming(true)}
      type="button"
    >
      <Send size={16} /> 發布班表
    </button>
  );
}
