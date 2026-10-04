import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { TileFrame } from "../components/Tiles/TileFrame";
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
      <h1 className="mb-6 font-pixel text-xl text-emerald-800 dark:text-emerald-400">Donegeon</h1>
      <TileFrame title={isSignup ? "Create an account" : "Log in"}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Username</span>
          <input
            className="nes-input input"
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
            className="nes-input input"
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
        <button className="nes-btn is-primary btn w-full" disabled={submitCredentials.isPending}>
          {isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      </TileFrame>
      <p className="mt-4 text-center text-sm text-stone-500">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link className="text-emerald-700 underline dark:text-emerald-400" to={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}
