import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LinkButtonProps = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  readonly size?: "default" | "xs" | "sm" | "lg";
  readonly className?: string;
  readonly title?: string;
  readonly "aria-label"?: string;
};

/**
 * A navigation control that *looks* like a button and *is* a link.
 *
 * Base UI's `Button` accepts a `render` prop, but rendering an anchor through it
 * puts `role="button"` on the element, which is a lie: assistive technology
 * announces it as a button, and the usual link affordances (middle-click, copy
 * address, prefetch) stop being discoverable. Applying `buttonVariants` to a real
 * `next/link` keeps the semantics honest and the styling identical.
 */
export function LinkButton({
  href,
  children,
  variant = "default",
  size = "sm",
  className,
  title,
  "aria-label": ariaLabel,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={ariaLabel}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children}
    </Link>
  );
}
