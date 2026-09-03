import * as React from "react";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Label } from "@sparstrow/ui/components/ui/label";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

/**
 * Where this copy of Sparstrowgen keeps its data.
 *
 * ## Why anyone has to fill this in
 *
 * Sparstrowgen runs its own server on this computer, and that server needs to
 * reach a database. The credentials for one cannot ship inside the installer:
 * an installer is a public file, and a Supabase service role key is unlimited
 * access to every row. So this is configured the way any self-hosted
 * application is — once, on the machine that will use it.
 *
 * The values are stored through the operating system's own credential store,
 * and this form is write-only: it can tell you a key is present, and it can
 * replace it, but it can never read one back. A service role key retrieved into
 * the window would be a service role key inside the process that renders
 * everything else.
 */

const SUPABASE_HELP = "Supabase → Project Settings → API";

export function ServerSettings() {
  const bridge = window.sparstrowDesktop?.server;
  const [config, setConfig] = React.useState<DesktopServerConfig | null>(null);
  const [state, setState] = React.useState<DesktopServerState>({ state: "stopped" });
  const [fields, setFields] = React.useState<DesktopServerFields>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!bridge) return;
    const off = bridge.onState(setState);
    void bridge.getConfig().then(setConfig);
    void bridge.getState().then(setState);
    return off;
  }, [bridge]);

  if (!bridge) {
    return (
      <Row title="Server" description="Only available inside the desktop app." />
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await bridge.setConfig(fields);
    setSaving(false);
    if (result.ok) {
      setConfig(result.status);
      // Cleared so the next render shows "stored" rather than the typed value,
      // and so a secret does not sit in React state longer than the call.
      setFields({});
    } else {
      setError(result.error);
    }
  };

  const dirty = Object.values(fields).some((v) => (v ?? "").trim().length > 0);

  return (
    <section>
      <h2 className="text-sm font-medium">Server</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sparstrowgen runs its own server on this computer and needs to know which
        Supabase project to use. These are stored in your operating system&rsquo;s
        credential store, never in the app&rsquo;s files and never in the installer.
      </p>

      <div className="mt-3 rounded-lg border">
        <div className="px-4">
          <Row title="Status" description={stateLine(state, config)}>
            <StateBadge state={state} />
          </Row>
        </div>

        {state.state === "failed" ? (
          <div className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" strokeWidth={2} />
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        ) : null}

        {config && !config.encryptionAvailable ? (
          <div className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" strokeWidth={2} />
            <p className="text-sm text-muted-foreground">
              This system has no secure credential storage, so these cannot be saved.
              Sparstrowgen will not write a service role key in plain text.
            </p>
          </div>
        ) : null}

        <div className="space-y-4 border-t px-4 py-4">
          <Field
            id="supabase-url"
            label="Supabase URL"
            hint={config?.supabaseUrl ? `Currently ${config.supabaseUrl}` : SUPABASE_HELP}
            placeholder="https://your-project.supabase.co"
            value={fields.supabaseUrl ?? ""}
            onChange={(v) => setFields((f) => ({ ...f, supabaseUrl: v }))}
          />
          <Field
            id="supabase-anon"
            label="Anon key"
            hint={`Public by design — it appears in every web page. ${SUPABASE_HELP}`}
            placeholder={config?.configured ? "Stored — type to replace" : "eyJ…"}
            value={fields.supabaseAnonKey ?? ""}
            onChange={(v) => setFields((f) => ({ ...f, supabaseAnonKey: v }))}
          />
          <Field
            id="supabase-service"
            label="Service role key"
            secret
            hint={
              config?.hasServiceRoleKey
                ? "Stored. Type a new one to replace it."
                : `Needed before this computer can pair. ${SUPABASE_HELP}`
            }
            placeholder={config?.hasServiceRoleKey ? "Stored — type to replace" : "eyJ…"}
            value={fields.supabaseServiceRoleKey ?? ""}
            onChange={(v) => setFields((f) => ({ ...f, supabaseServiceRoleKey: v }))}
          />
          <Field
            id="supabase-jwt"
            label="JWT secret"
            secret
            hint={
              config?.hasJwtSecret
                ? "Stored. Type a new one to replace it."
                : "Needed to sign in on this computer. Supabase → Project Settings → API → JWT Settings"
            }
            placeholder={config?.hasJwtSecret ? "Stored — type to replace" : "your-jwt-secret"}
            value={fields.supabaseJwtSecret ?? ""}
            onChange={(v) => setFields((f) => ({ ...f, supabaseJwtSecret: v }))}
          />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} /> : null}
              {saving ? "Saving and restarting" : "Save and restart the server"}
            </Button>
            {config?.configured ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void bridge.clearConfig().then(setConfig)}
              >
                Forget these
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function stateLine(state: DesktopServerState, config: DesktopServerConfig | null): string {
  switch (state.state) {
    case "running":
      return "The server is running on this computer.";
    case "external":
      // Worth naming rather than reporting as plain "running": someone with a
      // dev checkout open is talking to THAT server, and the settings below are
      // not what it is using.
      return "Using a server that was already running on this computer — a development checkout, most likely. These settings are not what it is using.";
    case "starting":
      return "Starting…";
    case "unconfigured":
      return config?.configured
        ? "Configured, but not started yet."
        : "Not configured yet. Fill these in and this computer can pair.";
    case "failed":
      return "The server could not start.";
    case "stopped":
      return "Stopped.";
  }
}

function StateBadge({ state }: { state: DesktopServerState }) {
  if (state.state === "running" || state.state === "external") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-success">
        <Check className="size-3.5" strokeWidth={2} />
        {state.state === "external" ? "Adopted" : "Running"}
      </span>
    );
  }
  if (state.state === "starting") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
        Starting
      </span>
    );
  }
  if (state.state === "failed") {
    return <span className="text-sm text-destructive">Failed</span>;
  }
  return <span className="text-sm text-muted-foreground">Not running</span>;
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="shrink-0 pt-0.5">{children}</div> : null}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  placeholder,
  value,
  secret,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  secret?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id={id}
        // `password` for the two that are secrets, so they are not readable
        // over a shoulder or in a screen recording of a support session.
        type={secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
