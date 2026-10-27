"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ActionResult, Workspace, Bom, Proposal } from "@/shared/contracts";
import {
  Dashboard,
  InboxPage,
  ProposalList,
  ProposalWorkspace,
  QuotesPage,
  RfqPage,
  SuppliersPage,
  TeamPage,
} from "./workspace-pages";
import { WorkspaceDialogs, type DialogState } from "./workspace-dialogs";
import { Badge, Icon } from "./ui";

export type View = "dashboard" | "proposals" | "rfqs" | "quotes" | "suppliers" | "inbox" | "team";
export type Act = (action: string, payload: Record<string, unknown>) => Promise<ActionResult>;
export type PageProps = {
  data: Workspace;
  act: Act;
  open: (dialog: DialogState) => void;
  openProposal: (id: string, bomId?: string) => void;
};

const navigation: { id: View; label: string; icon: string; tone?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "proposals", label: "Proposals & BOMs", icon: "layers", tone: "blue" },
  { id: "rfqs", label: "RFQ by parts", icon: "send", tone: "teal" },
  { id: "quotes", label: "Quotes & agreements", icon: "quote", tone: "teal" },
  { id: "suppliers", label: "Suppliers", icon: "supplier" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "team", label: "Team overview", icon: "chart" },
];

export function Workbench() {
  const router = useRouter();
  const [data, setData] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [bomId, setBomId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [message, setMessage] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch("/api/workspace", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || "The workspace could not be loaded.");
      }
      setData(await response.json());
      setLoadError("");
    },
    [router],
  );
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch((cause) => {
      if (cause.name !== "AbortError")
        setLoadError(cause instanceof Error ? cause.message : "Unable to load your workspace.");
    });
    return () => controller.abort();
  }, [reload]);
  const act: Act = async (action, payload) => {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, payload }),
    });
    const result: ActionResult = await response.json().catch(() => ({
      ok: false,
      message: "The server returned an unexpected response. Refresh before trying again.",
    }));
    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Your session has expired. Sign in again.");
    }
    if (!response.ok || !result.ok) {
      if (response.status === 409) await reload();
      throw new Error(result.message || "The change could not be saved.");
    }
    // Success is shown only after the durable action AND the refreshed shared state.
    try {
      await reload();
    } catch {
      throw new Error(
        "Your change was saved, but the updated workspace could not be loaded. Refresh before retrying.",
      );
    }
    setMessage(result.message);
    return result;
  };
  async function refresh() {
    setRefreshing(true);
    try {
      await reload();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setProposalId(null);
    setBomId(null);
    setMessage("");
    setMobileMenu(false);
  }
  function openProposal(id: string, selectedBom?: string) {
    setProposalId(id);
    setBomId(selectedBom || null);
    setView("proposals");
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Sign out failed.");
    }
  }
  if (!data)
    return (
      <main className="loading-page">
        <span className="brand-mark">
          <Icon name="layers" size={26} />
        </span>
        <h1>Proposal Workbench</h1>
        {loadError ? (
          <>
            <div className="notice error" role="alert">
              {loadError}
            </div>
            <button className="button primary" onClick={() => void refresh()} type="button">
              Try again
            </button>
          </>
        ) : (
          <p role="status">Opening your shared workspace…</p>
        )}
      </main>
    );
  const props: PageProps = { data, act, open: setDialog, openProposal };
  const proposal: Proposal | undefined = data.proposals.find((row) => row.id === proposalId);
  const bom: Bom | undefined = data.boms.find((row) => row.id === bomId);
  const unread = data.notifications.filter((row) => !row.read).length;
  const activeTitle = proposal
    ? proposal.name
    : navigation.find((row) => row.id === view)?.label || "Workspace";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`sidebar${mobileMenu ? " is-open" : ""}`} aria-label="Workspace navigation">
        <Link
          className="brand"
          href="/"
          prefetch={false}
          onClick={(event) => {
            event.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-mark">
            <Icon name="layers" size={25} />
          </span>
          <span>
            Proposal
            <br />
            <strong>Workbench</strong>
          </span>
        </Link>
        <div className="sidebar-caption">YOUR WORKSPACE</div>
        <nav>
          {navigation
            .filter((item) => item.id !== "team" || data.user.role === "MANAGER")
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${view === item.id ? " active" : ""} ${item.tone || ""}`}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.id === "inbox" && unread ? (
                  <span className="unread-count" aria-label={`${unread} unread messages`}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-boundary">
            <Icon name="shield" size={17} />
            <span>
              Shared team workspace
              <br />
              <small>No external sending enabled</small>
            </span>
          </div>
          <div className="user-summary">
            <span className="avatar">
              {data.user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{data.user.name}</strong>
              <small>{data.user.role === "MANAGER" ? "B&P Manager" : "B&P Analyst"}</small>
            </span>
            <button
              className="icon-button"
              onClick={() => void logout()}
              type="button"
              aria-label="Sign out"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      {mobileMenu ? (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu((value) => !value)}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-context">
            <span>BIDS &amp; PROPOSALS</span>
            <strong>{activeTitle}</strong>
          </div>
          <div className="topbar-actions">
            <Badge tone="teal">Shared workspace</Badge>
            <button
              className="button secondary compact"
              onClick={() => void refresh()}
              disabled={refreshing}
              type="button"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              className="topbar-inbox icon-button"
              type="button"
              aria-label={`Open inbox, ${unread} unread messages`}
              onClick={() => navigate("inbox")}
            >
              <Icon name="inbox" />
              {unread ? <span className="notification-dot" /> : null}
            </button>
          </div>
        </header>
        <main id="main-content" className={`main-content view-${view}`} tabIndex={-1}>
          {loadError ? (
            <div className="notice error" role="alert">
              {loadError}
            </div>
          ) : null}
          {message ? (
            <div className="save-message" role="status">
              <Icon name="check" size={18} />
              {message}
              <button
                className="icon-button"
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : null}
          {view === "dashboard" ? <Dashboard {...props} /> : null}
          {view === "proposals" ? (
            proposal ? (
              <ProposalWorkspace
                {...props}
                proposal={proposal}
                selectedBom={bom}
                onSelectBom={setBomId}
                onBack={() => {
                  setProposalId(null);
                  setBomId(null);
                }}
              />
            ) : (
              <ProposalList {...props} />
            )
          ) : null}
          {view === "rfqs" ? <RfqPage {...props} /> : null}
          {view === "quotes" ? <QuotesPage {...props} /> : null}
          {view === "suppliers" ? <SuppliersPage {...props} /> : null}
          {view === "inbox" ? <InboxPage {...props} /> : null}
          {view === "team" && data.user.role === "MANAGER" ? <TeamPage {...props} /> : null}
          <footer className="workspace-footer">
            <span>Proposal Workbench</span>
            <span>Clear ownership. Shared sourcing. Traceable decisions.</span>
          </footer>
        </main>
      </div>
      {dialog ? (
        <WorkspaceDialogs data={data} dialog={dialog} act={act} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
