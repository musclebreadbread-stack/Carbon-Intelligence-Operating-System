"use client";

/**
 * Language toggle button.
 *
 * Switches between Korean (default) and English by calling a server action that
 * sets the `cios-locale` cookie and revalidates the layout.
 */

import { Globe } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";

export type LanguageSwitcherProps = {
  /** Server action that sets the locale cookie. */
  readonly setLocale: (locale: string) => Promise<void>;
};

export function LanguageSwitcher({ setLocale }: LanguageSwitcherProps) {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const nextLocale = locale === "ko" ? "en" : "ko";
  const label = locale === "ko" ? "English" : "\uD55C\uAD6D\uC5B4";

  function handleSwitch() {
    startTransition(async () => {
      await setLocale(nextLocale);
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={handleSwitch}
      disabled={isPending}
      aria-label={locale === "ko" ? "\uC5B8\uC5B4 \uBCC0\uACBD" : "Change language"}
    >
      <Globe className="size-3.5" />
      <span className="text-xs">{label}</span>
    </Button>
  );
}
