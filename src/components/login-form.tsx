"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, Icon, values } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const input = values(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: input.email, password: input.password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to sign in. Please try again.");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reach the workspace.");
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Link className="brand" href="/login" prefetch={false}>
          <span className="brand-mark">
            <Icon name="layers" size={24} />
          </span>
          <span>
            Proposal
            <br />
            <strong>Workbench</strong>
          </span>
        </Link>
        <div className="login-message">
          <span className="eyebrow">ONE TEAM. SHARED VISIBILITY.</span>
          <h1>
            Less chasing.
            <br />
            More progress.
          </h1>
          <p>
            Bring proposal requirements, sourcing evidence and review decisions into one clear
            workspace.
          </p>
          <div className="login-principles">
            <span>
              <Icon name="layers" /> Connected proposals &amp; BOMs
            </span>
            <span>
              <Icon name="send" /> Coordinated quoting effort
            </span>
            <span>
              <Icon name="shield" /> Independent, traceable review
            </span>
          </div>
        </div>
        <small>A self-hosted, open-source Bids &amp; Proposals workspace.</small>
      </section>
      <section className="login-panel">
        <form onSubmit={login} className="login-form">
          <BadgeText />
          <h2>Welcome back</h2>
          <p>Sign in with the account provisioned by your workspace administrator.</p>
          <Field label="Work email">
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error ? (
            <div className="notice error" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="button primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to your workspace"}
            <Icon name="arrow" size={18} />
          </button>
          <div className="login-help">
            <Icon name="shield" size={18} />
            <span>
              No public registration or default accounts. Ask your administrator if you need access.
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}

function BadgeText() {
  return <span className="login-tag">BIDS &amp; PROPOSALS</span>;
}
