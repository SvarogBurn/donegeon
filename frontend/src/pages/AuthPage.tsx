import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { useLogin, useMe } from "../hooks/useAuth";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { user } = useMe();
  const submitCredentials = useLogin(mode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const isSignup = mode === "signup";

  if (user) return <Navigate to="/" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    submitCredentials.mutate({ username, password });
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-emerald-800 dark:text-emerald-400">Donegeon</h1>
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="font-semibold">{isSignup ? "Create an account" : "Log in"}</h2>
        <label className="block space-y-1 text-sm">
          <span>Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            autoFocus
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
          />
          {isSignup && <span className="text-xs text-stone-500">At least 8 characters.</span>}
        </label>
        {submitCredentials.error && <p className="text-sm text-red-600">{submitCredentials.error.message}</p>}
        <button className="btn w-full" disabled={submitCredentials.isPending}>
          {isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-500">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link className="text-emerald-700 underline dark:text-emerald-400" to={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}
