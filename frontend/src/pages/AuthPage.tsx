import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { TileFrame } from "../components/Tiles/TileFrame";
import { useLogin, useMe } from "../hooks/useAuth";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { user } = useMe();
  const submitCredentials = useLogin(mode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // What is wrong before anything is sent, said in the same place as the server's answers (not the browser's bubbles).
  const [problem, setProblem] = useState<string | null>(null);
  const isSignup = mode === "signup";

  if (user) return <Navigate to="/" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    // The words are the server's own where it has them (schemas/account.ts); the empty ones are my drafts.
    const wrong = !username.trim() ? "Write a username first" : !password ? "Write a password too" : isSignup && password.length < 8 ? "Password must be at least 8 characters" : null;
    setProblem(wrong);
    if (!wrong) submitCredentials.mutate({ username, password });
  }

  /** Typing again takes back what was said about the last try. */
  function edited() {
    setProblem(null);
    submitCredentials.reset();
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="logo mx-auto mb-6 h-[42px]" aria-label="Donegeon" />
      <TileFrame title={isSignup ? "Create an account" : "Log in"}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block space-y-1 text-sm">
          <span>Username</span>
          <input
            className="nes-input input"
            value={username}
            onChange={(e) => (setUsername(e.target.value), edited())}
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
            onChange={(e) => (setPassword(e.target.value), edited())}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
          />
          {isSignup && <span className="text-xs text-stone-500">At least 8 characters.</span>}
        </label>
        {(problem ?? submitCredentials.error) && <p className="text-sm text-red-600">{problem ?? submitCredentials.error?.message}</p>}
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
