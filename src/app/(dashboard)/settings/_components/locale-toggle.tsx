"use client";

/**
 * Display-language toggle.
 *
 * Scope note: this only switches the message-table keys `action-error.tsx`
 * resolves (validation/demo-mode/error copy) — the application UI itself stays
 * English by design (`src/lib/i18n/messages.ts`). Updates local state
 * immediately via `useSetLocale` and persists the choice with `setLocaleAction`
 * so it survives a reload.
 */

import * as React from "react";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale, useSetLocale } from "@/components/shared/locale-provider";
import { setLocaleAction } from "@/lib/actions/locale";
import type { Locale } from "@/lib/i18n/messages";

const OPTIONS: readonly { readonly value: Locale; readonly label: string }[] = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
];

export function LocaleToggle() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [pending, setPending] = React.useState(false);

  async function choose(next: Locale) {
    if (next === locale || pending) return;
    setPending(true);
    setLocale(next);
    try {
      await setLocaleAction(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid="locale-toggle">
      <Languages className="size-4 text-muted-foreground" />
      <div className="flex gap-1">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={option.value === locale ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
