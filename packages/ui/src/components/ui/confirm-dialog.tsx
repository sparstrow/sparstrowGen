import * as React from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

/**
 * Controlled confirmation dialog for destructive/irreversible actions.
 * Wraps the shared Dialog primitives so every "are you sure?" gate in the app
 * reads the same way (Cancel + a destructive confirm button that shows a
 * pending label while the mutation runs).
 *
 * `children` is for gates that need more than prose — a "type the name to
 * confirm" field, say. It renders between the description and the buttons
 * rather than inside the description, so the interactive control is not part
 * of the dialog's accessible description.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Delete",
  pendingLabel,
  confirmVariant = "destructive",
  pending = false,
  confirmDisabled = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  confirmVariant?: "destructive" | "default";
  pending?: boolean;
  /**
   * Blocks confirmation without claiming the action is underway. Separate from
   * `pending` on purpose: overloading that one greys the button out but also
   * swaps in the pending label, so an unmet precondition reads as "Deleting…"
   * before anything has been deleted.
   */
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
