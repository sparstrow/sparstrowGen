import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

/**
 * T-M10-02 — the per-field save behaviour both setup forms share: a single
 * line and a long field, each owning its own draft, its own save, and its own
 * error, so saving one field can never blank another (M9's "sending the whole
 * object on every save blanks fields" trap). Extracted here rather than
 * duplicated across `profile-form.tsx` and `workspace-form.tsx` — five fields
 * across two forms is exactly the amount of repetition that drifts.
 *
 * **Resync only when there is nothing unsaved to lose.** `lastKnownRef` tracks
 * what the field last agreed with the server. The effect below only pulls in
 * a new `value` prop when the current draft still equals that last-known
 * value — otherwise an in-flight edit or a value retained after a failed save
 * would be silently overwritten by a stale refetch.
 */
function useFieldDraft(value: string, onSave: (next: string) => Promise<unknown>) {
  const [draft, setDraft] = React.useState(value);
  const [status, setStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const lastKnownRef = React.useRef(value);

  React.useEffect(() => {
    if (draft === lastKnownRef.current) {
      setDraft(value);
      lastKnownRef.current = value;
    }
    // Only re-run when the server value itself changes — re-running on every
    // keystroke would fight the draft state this hook exists to own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function commit() {
    const next = draft.trim();
    if (next === lastKnownRef.current) return; // nothing changed
    setStatus("saving");
    setError(null);
    try {
      await onSave(next);
      lastKnownRef.current = next;
      setStatus("idle");
    } catch (err) {
      // The typed value is never cleared on error — retyping a name someone
      // already got right is the single most common form bug.
      setError(err instanceof Error ? err.message : "Could not save.");
      setStatus("error");
    }
  }

  function revert() {
    setDraft(value);
    setError(null);
    setStatus("idle");
  }

  return { draft, setDraft, status, error, commit, revert };
}

function Counter({ length, max }: { length: number; max: number }) {
  // Near the limit, not always — a counter on every field is noise (T-M10-02).
  if (length < max * 0.8) return null;
  return (
    <span
      className={cn(
        "shrink-0 text-xs tabular-nums text-muted-foreground",
        length >= max && "text-destructive",
      )}
    >
      {length}/{max}
    </span>
  );
}

export interface SingleLineFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  onSave: (next: string) => Promise<unknown>;
  disabled?: boolean;
}

/** Enter commits and blurs; Escape reverts to the last known server value without saving. */
export function SingleLineField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  onSave,
  disabled,
}: SingleLineFieldProps) {
  const { draft, setDraft, status, error, commit, revert } = useFieldDraft(value, onSave);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled || status === "saving"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur(); // triggers the onBlur commit above
            }
            if (e.key === "Escape") revert();
          }}
        />
        {status === "saving" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export interface LongTextFieldProps {
  id: string;
  label: string;
  helper?: string;
  value: string;
  placeholder: string;
  maxLength: number;
  rows?: number;
  onSave: (next: string) => Promise<unknown>;
  disabled?: boolean;
}

/**
 * Enter inserts a newline — never trapped into a save, since this is a
 * multi-line field. Saves on blur, and an explicit button for anyone who
 * never leaves the field (e.g. clicking straight to another action).
 */
export function LongTextField({
  id,
  label,
  helper,
  value,
  placeholder,
  maxLength,
  rows = 4,
  onSave,
  disabled,
}: LongTextFieldProps) {
  const { draft, setDraft, status, error, commit } = useFieldDraft(value, onSave);
  const dirty = draft.trim() !== value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Counter length={draft.length} max={maxLength} />
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <Textarea
        id={id}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled || status === "saving"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
      />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <span className="text-xs text-muted-foreground">
            {status === "saving" ? "Saving…" : dirty ? "Unsaved" : ""}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || status === "saving" || !dirty}
          onClick={() => void commit()}
        >
          {status === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
