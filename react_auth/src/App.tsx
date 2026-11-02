import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  Fingerprint,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  User,
  ChevronRight,
  Monitor,
  LogOut,
  Clock,
  Check,
  X,
  Copy,
  Activity,
  Smartphone,
  Command,
  Shield,
  Globe,
  CheckCheck,
} from "lucide-react";
import "./App.css";
type Account = {
  name: string;
  email: string;
  mfa: boolean;
  recovery_remaining: number;
  sessions: { id: string; agent: string; created: string; current: boolean }[];
  events: { action: string; created: string }[];
};
async function api<T = any>(url: string, data?: unknown): Promise<T> {
  const csrf =
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrftoken="))
      ?.split("=")[1] || "";
  const res = await fetch("/api" + url, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": decodeURIComponent(csrf),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    throw Error(
      res.status === 403
        ? "Your security token could not be verified. Refresh the page and try again."
        : "The service is unavailable. Please try again.",
    );
  }
  if (!res.ok)
    throw Error(
      body.error ||
        "Unable to complete this request. Refresh the page and try again.",
    );
  return body;
}
function App() {
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState(params.has("reset") ? "reset" : "login"),
    [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState("overview"),
    [dialog, setDialog] = useState<string | null>(null),
    [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [copied, setCopied] = useState(false);
  const buttonLock = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  async function refresh() {
    setAccount(await api<Account>("/user/"));
  }
  useEffect(() => {
    api("/bootstrap/")
      .then(async (d) => {
        if (d.authenticated) await refresh();
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!dialog) return;
    previousFocus.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && dialog !== "codes") {
        setDialog(null);
        setSecret("");
      }
      if (e.key === "Tab") {
        const nodes = modalRef.current?.querySelectorAll<HTMLElement>(
          "button,input,a,textarea",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previousFocus.current?.focus();
    };
  }, [dialog]);
  async function act(fn: () => Promise<unknown>) {
    if (buttonLock.current) return;
    buttonLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      buttonLock.current = false;
    }
  }
  function switchMode(next: string) {
    setMode(next);
    setPassword("");
    setError("");
    setNotice("");
    setVisible(false);
  }
  function open(next: string) {
    setDialog(next);
    setError("");
    setSecret("");
    setCopied(false);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    await act(async () => {
      if (mode === "register") {
        await api("/register/", values);
        setMode("login");
        setPassword("");
        setNotice("Account created. Sign in to secure your account.");
      } else if (mode === "forgot") {
        const result = await api("/password/forgot/", values);
        setNotice(result.message);
      } else if (mode === "reset") {
        await api("/password/reset/", {
          ...values,
          uid: params.get("reset"),
          token: params.get("token"),
        });
        history.replaceState({}, "", "/");
        setMode("login");
        setPassword("");
        setNotice(
          "Password updated. Sign in again; two-factor authentication remains enabled if configured.",
        );
      } else if (mode === "challenge") {
        await api("/mfa/challenge/", values);
        await refresh();
        setPassword("");
      } else {
        const result = await api("/login/", values);
        if (result.requires_mfa) {
          setMode("challenge");
          setPassword("");
        } else {
          await refresh();
          setPassword("");
        }
      }
    });
  }
  const mark = (
    <div className="brand">
      <span className="brand-symbol">
        <Command size={20} />
      </span>
      obsidian<span className="brand-sub">/ access</span>
    </div>
  );
  const feedback = (
    <>
      {error && (
        <div className="error" role="alert">
          <Shield size={15} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
    </>
  );
  if (loading)
    return (
      <div className="loading">
        {mark}
        <p>Establishing your session…</p>
      </div>
    );
  if (!account)
    return (
      <div className="auth-layout">
        <section className="visual-side">
          <header>
            {mark}
            <span className="build-label">IDENTITY SYSTEM / 01</span>
          </header>
          <div className="visual-content">
            <span className="eyebrow">
              <i />
              YOUR IDENTITY. UNDER YOUR CONTROL.
            </span>
            <h1>
              Access is earned.
              <br />
              <span>Trust is built.</span>
            </h1>
            <p>
              A considered approach to authentication.
              <br />
              Clear boundaries. Stronger verification.
              <br />A little more peace of mind.
            </p>
            <div
              className="identity-art"
              role="img"
              aria-label="An illuminated fingerprint surrounded by layers of identity verification"
            >
              <div className="art-grid" />
              <div className="orbit orbit-1" />
              <div className="orbit orbit-2" />
              <div className="orbit orbit-3" />
              <div className="fingerprint-core">
                <Fingerprint size={84} strokeWidth={1} />
              </div>
              <div className="art-tag tag-a">
                <LockKeyhole size={13} />
                <span>
                  SESSION PROTECTION<small>HttpOnly cookies</small>
                </span>
                <i />
              </div>
              <div className="art-tag tag-b">
                <ShieldCheck size={15} />
                <span>
                  SECOND FACTOR<small>Authenticator verification</small>
                </span>
                <i />
              </div>
              <div className="art-cross cross-one">+</div>
              <div className="art-cross cross-two">+</div>
              <div className="art-label">IDENTITY → VERIFY → ACCESS</div>
            </div>
          </div>
          <footer>
            <span>
              <ShieldCheck size={13} />
              BUILT WITH DJANGO + REACT
            </span>
            <a
              href="https://github.com/addo12kwame/django-react-auth"
              target="_blank"
              rel="noreferrer"
            >
              Explore the source <ArrowUpRight size={13} />
            </a>
          </footer>
        </section>
        <section className="form-side">
          <div className="form-top">
            <span>LOCAL DEVELOPMENT ENVIRONMENT</span>
            <span className="environment-dot" />
          </div>
          <div className="auth-form-wrap">
            <div className="form-icon">
              {mode === "challenge" ? (
                <Smartphone size={23} />
              ) : mode === "register" ? (
                <User size={23} />
              ) : mode === "forgot" || mode === "reset" ? (
                <KeyRound size={23} />
              ) : (
                <Fingerprint size={26} />
              )}
            </div>
            <span className="eyebrow form-eyebrow">
              {mode === "challenge"
                ? "ONE MORE LAYER"
                : mode === "register"
                  ? "YOUR SPACE STARTS HERE"
                  : mode === "forgot" || mode === "reset"
                    ? "ACCOUNT RECOVERY"
                    : "GOOD TO HAVE YOU BACK"}
            </span>
            <h2>
              {mode === "login"
                ? "Sign in to your space."
                : mode === "register"
                  ? "Make yourself at home."
                  : mode === "challenge"
                    ? "Verify it’s you."
                    : mode === "forgot"
                      ? "Let’s get you back in."
                      : "A fresh start."}
            </h2>
            <p className="form-description">
              {mode === "login"
                ? "Your account. Your sessions. Your security."
                : mode === "register"
                  ? "Create an account, then add another layer of protection."
                  : mode === "challenge"
                    ? "Enter an authenticator code or an unused recovery code."
                    : mode === "forgot"
                      ? "Request a one-hour password reset link. This local demo writes the link to the server console."
                      : "Choose a new password. Your existing sessions will be revoked."}
            </p>
            {feedback}
            <form onSubmit={submit}>
              {mode === "register" && (
                <label>
                  Full name
                  <div className="input-wrap">
                    <User size={16} />
                    <input
                      name="name"
                      placeholder="Your full name"
                      autoComplete="name"
                      maxLength={100}
                      required
                    />
                  </div>
                </label>
              )}
              {!["challenge", "reset"].includes(mode) && (
                <label>
                  Email address
                  <div className="input-wrap">
                    <Mail size={16} />
                    <input
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      maxLength={254}
                      required
                    />
                  </div>
                </label>
              )}
              {["login", "register", "reset"].includes(mode) && (
                <>
                  <label>
                    <span className="label-row">
                      {mode === "reset" ? "New password" : "Password"}
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </span>
                    <div className="input-wrap">
                      <LockKeyhole size={16} />
                      <input
                        aria-label={
                          mode === "reset" ? "New password" : "Password"
                        }
                        name="password"
                        type={visible ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          mode === "login"
                            ? "Enter your password"
                            : "At least 12 characters"
                        }
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        minLength={mode === "login" ? 1 : 12}
                        maxLength={128}
                        required
                      />
                      <button
                        type="button"
                        aria-label={visible ? "Hide password" : "Show password"}
                        onClick={() => setVisible(!visible)}
                      >
                        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                  {mode !== "login" && (
                    <div className="password-hint">
                      <span className={password.length >= 12 ? "met" : ""}>
                        <Check size={11} />
                        12 or more characters
                      </span>
                      <span>Mix words for a memorable passphrase</span>
                    </div>
                  )}
                </>
              )}
              {mode === "challenge" && (
                <label>
                  Authentication or recovery code
                  <div className="input-wrap code-input">
                    <KeyRound size={16} />
                    <input
                      name="code"
                      autoComplete="one-time-code"
                      placeholder="6-digit code or recovery code"
                      maxLength={32}
                      required
                    />
                  </div>
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in"
                    : mode === "register"
                      ? "Create account"
                      : mode === "challenge"
                        ? "Verify & continue"
                        : mode === "forgot"
                          ? "Send reset link"
                          : "Update password"}
                <ArrowRight size={16} />
              </button>
            </form>
            <div className="auth-switch">
              {mode === "login" ? (
                <>
                  New around here?{" "}
                  <button onClick={() => switchMode("register")}>
                    Create an account <ArrowUpRight size={12} />
                  </button>
                </>
              ) : (
                <button onClick={() => switchMode("login")}>
                  Back to sign in <ArrowRight size={12} />
                </button>
              )}
            </div>
            <div className="security-footnote">
              <ShieldCheck size={15} />
              <p>
                Server-side sessions. Password hashing.
                <br />
                An extra layer when you choose it.
              </p>
            </div>
          </div>
          <div className="form-bottom">
            <span>OBSIDIAN ACCESS</span>
            <span>ENGINEERED FOR INTENTIONAL ACCESS</span>
          </div>
        </section>
      </div>
    );
  return (
    <div className="dashboard">
      <aside>
        {mark}
        <div className="workspace">
          <span>{account.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>Personal workspace</strong>
            <small>{account.email}</small>
          </div>
        </div>
        <div className="nav-label">YOUR ACCOUNT</div>
        <nav>
          {[
            ["overview", "Security overview", ShieldCheck],
            ["sessions", "Active sessions", Monitor],
            ["activity", "Account activity", Activity],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(String(key))}
            >
              {React.createElement(Icon, { size: 17 })}
              {String(label)}
              <ChevronRight size={13} />
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <strong>A stronger perimeter.</strong>
          <p>
            Know what protects your account.
            <br />
            Decide what stays connected.
          </p>
        </div>
        <button
          className="sign-out"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await api("/logout/", {});
              setAccount(null);
              setMode("login");
            })
          }
        >
          <LogOut size={15} />
          Sign out
        </button>
      </aside>
      <div className="dashboard-main">
        <header>
          <span>
            Account <span>/</span>{" "}
            {tab === "overview"
              ? "Security overview"
              : tab === "sessions"
                ? "Active sessions"
                : "Activity"}
          </span>
          <span className="env-tag">
            <i />
            LOCAL DEMO
          </span>
        </header>
        <main>
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">YOUR ACCOUNT, AT A GLANCE</span>
              <h1>
                Welcome, {account.name.split(" ")[0]}
                <span>.</span>
              </h1>
              <p>A clear view of what keeps your account protected.</p>
            </div>
            <div className="identity-avatar">
              {account.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
          </div>
          {feedback}
          <div className="account-stats">
            <div>
              <span>AUTHENTICATION</span>
              <strong>{account.mfa ? "Two factors" : "Password"}</strong>
              <small>
                <i className={account.mfa ? "green" : ""} />
                {account.mfa
                  ? "Authenticator enabled"
                  : "Add another layer below"}
              </small>
            </div>
            <div>
              <span>ACTIVE SESSIONS</span>
              <strong>
                {String(account.sessions.length).padStart(2, "0")}
              </strong>
              <small>Manage connected browsers</small>
            </div>
            <div>
              <span>RECOVERY CODES</span>
              <strong>
                {account.mfa
                  ? String(account.recovery_remaining).padStart(2, "0")
                  : "—"}
              </strong>
              <small>
                {account.mfa
                  ? "Unused codes remaining"
                  : "Available after 2FA setup"}
              </small>
            </div>
          </div>
          {tab === "overview" && (
            <>
              <div className="security-grid">
                <section className="panel mfa-panel">
                  <div className="panel-heading">
                    <span className="panel-icon">
                      <Smartphone size={21} />
                    </span>
                    <span className={"badge " + (account.mfa ? "enabled" : "")}>
                      {account.mfa ? "Enabled" : "Recommended"}
                    </span>
                  </div>
                  <h2>
                    Make your password
                    <br />
                    only the first step.
                  </h2>
                  <p>
                    Require a rotating code from your authenticator app at
                    sign-in. Recovery codes give you a way back if you lose your
                    device.
                  </p>
                  <div className="feature-line">
                    <Check size={13} />
                    Authenticator app verification
                  </div>
                  <div className="feature-line">
                    <Check size={13} />
                    Eight one-use recovery codes
                  </div>
                  <button
                    className={account.mfa ? "secondary" : "primary"}
                    onClick={() => open(account.mfa ? "disable" : "enroll")}
                  >
                    {account.mfa
                      ? "Manage two-factor authentication"
                      : "Set up two-factor authentication"}
                    <ArrowRight size={15} />
                  </button>
                </section>
                <section className="panel identity-panel">
                  <div className="panel-heading">
                    <span className="panel-icon">
                      <Fingerprint size={22} />
                    </span>
                    <span className="eyebrow">IDENTITY PROFILE</span>
                  </div>
                  <div className="profile-avatar">
                    {account.name[0].toUpperCase()}
                  </div>
                  <h3>{account.name}</h3>
                  <p>{account.email}</p>
                  <div className="identity-detail">
                    <span>Account type</span>
                    <strong>Personal</strong>
                  </div>
                  <div className="identity-detail">
                    <span>Sign-in method</span>
                    <strong>
                      {account.mfa
                        ? "Password + authenticator"
                        : "Email & password"}
                    </strong>
                  </div>
                  <div className="identity-detail">
                    <span>Email verification</span>
                    <strong>Not implemented</strong>
                  </div>
                  <div className="profile-note">
                    <LockKeyhole size={14} />
                    Your password is hashed on the server.
                  </div>
                </section>
              </div>
              <section className="panel sessions-panel">
                <div className="section-heading">
                  <div>
                    <h2>Your connected sessions</h2>
                    <p>You control which browsers stay signed in.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTab("sessions")}
                  >
                    Manage sessions <ArrowUpRight size={14} />
                  </button>
                </div>
                {account.sessions.slice(0, 2).map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    busy={busy}
                    revoke={() =>
                      act(async () => {
                        await api("/sessions/revoke/", { id: s.id });
                        await refresh();
                        setNotice("Session revoked.");
                      })
                    }
                  />
                ))}
              </section>
            </>
          )}
          {tab === "sessions" && (
            <section className="panel sessions-panel">
              <div className="section-heading">
                <div>
                  <h2>Active sessions</h2>
                  <p>
                    Revoking a session signs that browser out on its next
                    request.
                  </p>
                </div>
              </div>
              {account.sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  busy={busy}
                  revoke={() =>
                    act(async () => {
                      await api("/sessions/revoke/", { id: s.id });
                      await refresh();
                      setNotice("Session revoked.");
                    })
                  }
                />
              ))}
            </section>
          )}
          {tab === "activity" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Recent account activity</h2>
                  <p>Latest 15 recorded security events.</p>
                </div>
              </div>
              {account.events.map((e, i) => (
                <div className="event-row" key={i}>
                  <Clock size={17} />
                  <strong>{e.action}</strong>
                  <time>{new Date(e.created).toLocaleString()}</time>
                </div>
              ))}
            </section>
          )}
          <footer>
            <span>
              <ShieldCheck size={12} />A little visibility. A lot more control.
            </span>
            <span>OBSIDIAN / ACCESS</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (dialog !== "codes") {
              setDialog(null);
              setSecret("");
            }
          }}
        >
          <section
            className="modal"
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog !== "codes" && (
              <button
                className="modal-close"
                aria-label="Close dialog"
                onClick={() => {
                  setDialog(null);
                  setSecret("");
                }}
              >
                <X size={20} />
              </button>
            )}
            <span className="eyebrow">ANOTHER LAYER OF TRUST</span>
            <h2 id="modal-title">
              {dialog === "codes"
                ? "Your way back in."
                : dialog === "disable"
                  ? "Manage your second factor."
                  : secret
                    ? "Connect your authenticator."
                    : "Protect your next sign-in."}
            </h2>
            {dialog === "codes" ? (
              <>
                <p>
                  Save these recovery codes somewhere safe. Each code works
                  once, alongside your password. They are shown only now.
                </p>
                <div className="recovery-codes">
                  {codes.map((c) => (
                    <code key={c}>{c}</code>
                  ))}
                </div>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(codes.join("\n"));
                      setCopied(true);
                    } catch {
                      setError("Select and copy the codes manually.");
                    }
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                  {copied ? "Copied" : "Copy recovery codes"}
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setCodes([]);
                    setDialog(null);
                  }}
                >
                  I’ve saved my codes <CheckCheck size={15} />
                </button>
              </>
            ) : (
              <>
                <p>
                  {dialog === "disable"
                    ? "Disabling two-factor authentication requires your password and an unused authenticator or recovery code."
                    : secret
                      ? "In your authenticator app, add a time-based account named Obsidian Access and enter this setup key. Then confirm with the current code."
                      : "Confirm your current password to begin. You’ll need an authenticator app that supports time-based codes."}
                </p>
                {secret && (
                  <div className="setup-key">
                    <span>MANUAL SETUP KEY</span>
                    <code>{secret}</code>
                  </div>
                )}
                {feedback}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const values = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    act(async () => {
                      if (dialog === "disable") {
                        await api("/mfa/disable/", values);
                        await refresh();
                        setDialog(null);
                        setNotice("Two-factor authentication disabled.");
                      } else if (!secret) {
                        const result = await api("/mfa/enroll/", values);
                        setSecret(result.secret);
                      } else {
                        const result = await api("/mfa/confirm/", values);
                        setCodes(result.codes);
                        setSecret("");
                        setDialog("codes");
                        await refresh();
                      }
                    });
                  }}
                >
                  {!secret && (
                    <label>
                      Current password
                      <div className="input-wrap">
                        <LockKeyhole size={16} />
                        <input
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          maxLength={128}
                        />
                      </div>
                    </label>
                  )}
                  {(secret || dialog === "disable") && (
                    <label>
                      {dialog === "disable"
                        ? "Authenticator or recovery code"
                        : "Six-digit authenticator code"}
                      <div className="input-wrap">
                        <KeyRound size={16} />
                        <input
                          name="code"
                          autoComplete="one-time-code"
                          required
                          maxLength={32}
                        />
                      </div>
                    </label>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Verifying…"
                      : dialog === "disable"
                        ? "Disable two-factor authentication"
                        : secret
                          ? "Verify & enable"
                          : "Continue"}
                    <ArrowRight size={15} />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function SessionRow({
  session: s,
  busy,
  revoke,
}: {
  session: Account["sessions"][0];
  busy: boolean;
  revoke: () => void;
}) {
  const browser = s.agent.includes("Firefox")
    ? "Firefox"
    : s.agent.includes("Edg")
      ? "Edge"
      : s.agent.includes("Chrome")
        ? "Chrome"
        : s.agent.includes("Safari")
          ? "Safari"
          : "Browser";
  const platform = s.agent.includes("Windows")
    ? "Windows"
    : s.agent.includes("Mac")
      ? "macOS"
      : s.agent.includes("Linux")
        ? "Linux"
        : "Unknown platform";
  return (
    <div className="session-row">
      <span className="device-icon">
        <Monitor size={20} />
      </span>
      <div>
        <strong>
          {browser} on {platform}
          {s.current && <span>THIS SESSION</span>}
        </strong>
        <p>Signed in {new Date(s.created).toLocaleString()}</p>
      </div>
      {s.current ? (
        <span className="current-indicator">
          <i />
          Active now
        </span>
      ) : (
        <button className="revoke" disabled={busy} onClick={revoke}>
          Revoke session <LogOut size={13} />
        </button>
      )}
    </div>
  );
}
export default App;
