import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Separator } from "./separator";
import { cn } from "../../lib/utils";

/**
 * The list-row primitive `DESIGN.md` §8 names as the default reach for a row,
 * and which this package was missing — every list surface in the app had
 * hand-rolled its own flex row instead.
 *
 * Composed as Item > (ItemMedia, ItemContent > (ItemTitle, ItemDescription),
 * ItemActions), with ItemFooter for a control that belongs to the row but
 * needs the full width. `flex-wrap` plus the footer's `basis-full` is what
 * makes that second line work without a nested grid.
 */
const itemVariants = cva(
  "group/item flex flex-wrap items-center rounded-md border border-transparent text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border",
        muted: "bg-muted/50",
      },
      size: {
        default: "gap-4 p-4",
        sm: "gap-2.5 px-4 py-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof itemVariants> {
  asChild?: boolean;
}

const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        data-slot="item"
        className={cn(itemVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Item.displayName = "Item";

const ItemGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="list"
      data-slot="item-group"
      className={cn("group/item-group flex flex-col", className)}
      {...props}
    />
  ),
);
ItemGroup.displayName = "ItemGroup";

const ItemSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentPropsWithoutRef<typeof Separator>
>(({ className, ...props }, ref) => (
  <Separator
    ref={ref}
    data-slot="item-separator"
    orientation="horizontal"
    className={cn("my-0", className)}
    {...props}
  />
));
ItemSeparator.displayName = "ItemSeparator";

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 rounded-md border bg-accent text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ItemMediaProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof itemMediaVariants> {}

const ItemMedia = React.forwardRef<HTMLDivElement, ItemMediaProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="item-media"
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  ),
);
ItemMedia.displayName = "ItemMedia";

const ItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="item-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  ),
);
ItemContent.displayName = "ItemContent";

const ItemTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="item-title"
      className={cn("flex w-fit items-center gap-2 text-sm font-medium leading-snug", className)}
      {...props}
    />
  ),
);
ItemTitle.displayName = "ItemTitle";

const ItemDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      data-slot="item-description"
      className={cn("text-xs font-normal leading-normal text-muted-foreground", className)}
      {...props}
    />
  ),
);
ItemDescription.displayName = "ItemDescription";

const ItemActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="item-actions"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  ),
);
ItemActions.displayName = "ItemActions";

const ItemFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="item-footer"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  ),
);
ItemFooter.displayName = "ItemFooter";

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  itemVariants,
};
