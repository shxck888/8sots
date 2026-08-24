"use client";

import { Send } from "lucide-react";

export function PublishButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      className="admin-button secondary"
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm("發布後這個版本將鎖定，確定要發布班表嗎？")) event.preventDefault();
      }}
      type="submit"
    >
      <Send size={16} /> 發布班表
    </button>
  );
}
