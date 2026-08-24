"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import type { LoginFormState } from "@/lib/auth";
import { login } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="login-form">
      <input name="next" type="hidden" value={nextPath} />

      <label htmlFor="username">帳號</label>
      <div className="login-input">
        <UserRound aria-hidden="true" size={19} />
        <input
          autoCapitalize="none"
          autoComplete="username"
          autoFocus
          id="username"
          maxLength={32}
          minLength={3}
          name="username"
          pattern="[A-Za-z0-9_]{3,32}"
          placeholder="請輸入帳號"
          required
          type="text"
        />
      </div>
      {state.fieldErrors?.username?.map((error) => (
        <p className="field-error" key={error}>{error}</p>
      ))}

      <label htmlFor="password">密碼</label>
      <div className="login-input">
        <LockKeyhole aria-hidden="true" size={19} />
        <input
          autoComplete="current-password"
          id="password"
          maxLength={64}
          minLength={6}
          name="password"
          pattern="(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{6,64}"
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
