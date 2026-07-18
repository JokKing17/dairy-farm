"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  return <form action={action} className="login-box">
    <h2 className="login-title">Welcome back</h2>
    <p className="subtitle login-intro">Sign in to your private business workspace.</p>
    {state.error ? <div className="form-error" role="alert">{state.error}</div> : null}
    <div className="field login-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" required/></div>
    <div className="field login-field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required/></div>
    <button className="button login-submit" disabled={pending}>{pending ? "Signing in…" : "Sign in securely"}</button>
    <p className="subtitle login-help">Forgot your password? Contact the administrator.</p>
  </form>;
}
