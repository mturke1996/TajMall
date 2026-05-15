import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Editorial light buttons.
 * - Flat surface, hairline borders.
 * - Touch-safe: every interactive button is at least 40px tall (44px with size="lg").
 * - Press feedback via scale(0.985) per Emil's principles.
 * - Custom ease-out-quart for snappy responsiveness.
 */
const buttonVariants = cva(
  [
    "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "rounded-md text-sm font-medium",
    "transition-[transform,background-color,border-color,color,box-shadow] duration-100",
    "ease-out",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.98]",
    "[&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-sage-700 text-sand-50 hover:bg-sage-800 border border-sage-800/40",
        secondary:
          "bg-canvas border border-border text-foreground hover:bg-secondary",
        outline:
          "bg-card border border-border text-foreground hover:bg-secondary",
        ghost:
          "bg-transparent text-ink-mute hover:bg-secondary hover:text-foreground",
        destructive:
          "bg-pastel-red text-pastel-redInk border border-pastel-redInk/15 hover:bg-pastel-red/80",
        link: "text-sage-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 sm:h-9 sm:px-3.5",
        sm: "h-9 px-3 text-xs sm:h-8",
        lg: "h-11 px-5",
        icon: "h-10 w-10 sm:h-9 sm:w-9",
        "icon-sm": "h-9 w-9 sm:h-8 sm:w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
