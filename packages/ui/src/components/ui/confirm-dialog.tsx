import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Controlled confirmation dialog for destructive/irreversible actions.
 * Wraps the shared Dialog primitives so every "are you sure?" gate in the app
 * reads the same way (Cancel + a destructive confirm button that shows a
 * pending label while the mutation runs).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  pendingLabel,
  confirmVariant = "destructive",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  confirmVariant?: "destructive" | "default";
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={confirmVariant} disabled={pending} onClick={onConfirm}>
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
