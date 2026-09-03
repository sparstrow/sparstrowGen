import * as React from "react";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Separator } from "@sparstrow/ui/components/ui/separator";
import { Switch } from "@sparstrow/ui/components/ui/switch";
import { Label } from "@sparstrow/ui/components/ui/label";
import { AlertTriangle, Check, Download, Loader2, RefreshCw } from "lucide-react";
import { updateStatusLine } from "./update-copy";
import { useUpdates } from "./use-updates";
import { ServerSettings } from "./server-settings";

/**
 * Settings.
 *
 * Two sections, both of which existed as working main-process machinery with no
 * way to reach them: the updater has run on a 30-minute timer since 0004 Phase
 * 2 and pushed its status into a renderer that never listened, and the daemon
 * preferences have had an IPC bridge and no control. This screen is the missing
 * half of both, not new capability.
 *
 * AGENTS.md §3.14 is the rule that says a feature ships with its settings; this
 * is that rule applied retroactively to the two features that already broke it.
 */
export function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-sm font-medium">Settings</h1>
      {/* Server first: nothing else in this app works until it is running, so
          it is the first thing to look at when something is wrong. */}
      <ServerSettings />
      <Separator />
      <UpdatesSection />
      <Separator />
      <DaemonSection />
    </div>
  );
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

function UpdatesSection() {
  const { status, supported, check, download, install, cancel } = useUpdates();
  const version = window.sparstrowDesktop?.version ?? "dev";

  return (
    <section>
      <h2 className="text-sm font-medium">Updates</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sparstrowgen never updates itself behind your back. It tells you a new version
        exists; downloading and installing are both your click.
      </p>

      <div className="mt-3 rounded-lg border">
        <div className="px-4">
          <Row
            title={`You are on version ${version}`}
            description={updateStatusLine(status, supported)}
          >
            <UpdateAction
              status={status}
              supported={supported}
              onCheck={check}
              onDownload={download}
              onInstall={() => install(false)}
            />
          </Row>
        </div>

        {status.state === "waiting" ? (
          <div className="border-t bg-muted/40 px-4 py-3">
            <p className="text-sm">
              {status.busy === 1
                ? "One agent run has to finish first."
                : `${status.busy} agent runs have to finish first.`}{" "}
              The install starts on its own the moment they do.
            </p>
            {status.runs.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {status.runs.map((run) => (
                  <li key={run.id} className="text-sm text-muted-foreground">
                    {run.agentName ?? run.agentId}
                    {run.startedAt ? ` · started ${new Date(run.startedAt).toLocaleTimeString()}` : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex gap-2">
              {/*
                Destructive: this cancels work that is currently running. Named
                for what it does to the runs, not for what it does to the
                update — "Install now" would hide the cost in the quiet part.
              */}
              <Button size="sm" variant="destructive" onClick={() => install(true)}>
                Stop the runs and install
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Keep working
              </Button>
            </div>
          </div>
        ) : null}

        {status.state === "error" ? (
          <div className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" strokeWidth={2} />
            <p className="text-sm text-muted-foreground">{status.message}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function UpdateAction({
  status,
  supported,
  onCheck,
  onDownload,
  onInstall,
}: {
  status: DesktopUpdateStatus;
  supported: boolean | null;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}) {
  // No button at all rather than a disabled one: a control that can never work
  // in this build is not a thing to grey out, it is a thing to not draw.
  if (!supported) return null;

  switch (status.state) {
    case "available":
      return (
        <Button size="sm" onClick={onDownload}>
          <Download className="size-3.5" strokeWidth={2} />
          Download
        </Button>
      );
    case "downloaded":
      return (
        <Button size="sm" onClick={onInstall}>
          Install and restart
        </Button>
      );
    case "downloading":
    case "installing":
    case "checking":
      return (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          {status.state === "checking" ? "Checking" : "Working"}
        </Button>
      );
    case "waiting":
      return null;
    default:
      return (
        <Button size="sm" variant="outline" onClick={onCheck}>
          <RefreshCw className="size-3.5" strokeWidth={2} />
          Check for updates
        </Button>
      );
  }
}

/**
 * Whether the local agent runtime starts with the app and stops with it.
 *
 * Reads through the same IPC the main process has exposed since the daemon
 * supervisor was written. Optimistic on toggle and reconciled from the reply,
 * so the switch never sits still under a finger while a round trip completes.
 */
function DaemonSection() {
  const bridge = window.sparstrowDesktop?.daemon;
  const [prefs, setPrefs] = React.useState<{
    autoStartOnLaunch: boolean;
    autoStopOnQuit: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (!bridge) return;
    void bridge.getPrefs().then(setPrefs);
  }, [bridge]);

  const update = (patch: Partial<{ autoStartOnLaunch: boolean; autoStopOnQuit: boolean }>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    void bridge?.setPrefs(patch).then(() => bridge.getPrefs().then(setPrefs));
  };

  return (
    <section>
      <h2 className="text-sm font-medium">This computer</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sparstrowgen runs a small local service so agents can work on this machine.
        It only accepts work from workspaces you are signed in to.
      </p>

      <div className="mt-3 rounded-lg border px-4">
        {prefs ? (
          <>
            <Row
              title="Start when Sparstrowgen opens"
              description="Turn this off if you would rather start it yourself."
            >
              <Switch
                id="auto-start"
                checked={prefs.autoStartOnLaunch}
                onCheckedChange={(v) => update({ autoStartOnLaunch: v })}
              />
            </Row>
            <Separator />
            <Row
              title="Stop when Sparstrowgen closes"
              description="Leave this off to let agents keep working after you close the window."
            >
              <Switch
                id="auto-stop"
                checked={prefs.autoStopOnQuit}
                onCheckedChange={(v) => update({ autoStopOnQuit: v })}
              />
            </Row>
            {/* `Label` is imported for its `htmlFor` association only; the visible
                text lives in `Row` so both switches read the same way. */}
            <Label htmlFor="auto-start" className="sr-only">
              Start the local service when Sparstrowgen opens
            </Label>
            <Label htmlFor="auto-stop" className="sr-only">
              Stop the local service when Sparstrowgen closes
            </Label>
          </>
        ) : (
          <Row
            title="This computer"
            description={
              bridge ? "Loading…" : "Only available inside the desktop app."
            }
          >
            {bridge ? <Check className="size-3.5 text-muted-foreground opacity-0" /> : null}
          </Row>
        )}
      </div>
    </section>
  );
}
