"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import type { LoginFormState } from "@/lib/auth";
import { login } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="login-form">
      <input name="next" type="hidden" value={nextPath} />

      <label htmlFor="email">工作 Email</label>
      <div className="login-input">
        <Mail aria-hidden="true" size={19} />
        <input
          autoComplete="email"
          autoFocus
          id="email"
          name="email"
          placeholder="name@company.com"
          required
          type="email"
        />
      </div>
      {state.fieldErrors?.email?.map((error) => (
        <p className="field-error" key={error}>{error}</p>
      ))}

      <label htmlFor="password">密碼</label>
      <div className="login-input">
        <LockKeyhole aria-hidden="true" size={19} />
        <input
          autoComplete="current-password"
          id="password"
          minLength={8}
          name="password"
          placeholder="輸入密碼"
          required
          type="password"
        />
      </div>
      {state.fieldErrors?.password?.map((error) => (
        <p className="field-error" key={error}>{error}</p>
      ))}

      {state.message ? <p className="login-error" role="alert">{state.message}</p> : null}

      <button className="login-submit" disabled={pending} type="submit">
        {pending ? "登入中…" : "登入工作台"}
        {!pending ? <ArrowRight aria-hidden="true" size={19} /> : null}
      </button>
    </form>
  );
}
