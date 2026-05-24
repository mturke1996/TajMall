import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md px-3 py-2 text-sm",
          "border border-border bg-card text-foreground",
          "placeholder:text-muted-foreground/60",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:bg-card",
          "hover:border-border/80",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-canvas-sunken",
          "dark:bg-card dark:border-border dark:text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
