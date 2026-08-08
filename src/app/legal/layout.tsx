import { Leaf } from "lucide-react";

import { LinkButton } from "@/components/shared/link-button";
import { getDictionary } from "@/lib/i18n/server";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const dict = await getDictionary();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <Leaf className="size-5 text-emerald-600" />
          <span className="text-sm font-semibold">CIOS</span>
        </div>
        <LinkButton size="sm" variant="ghost" href="/">
          {dict["legal.backToHome"]}
        </LinkButton>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-12">{children}</main>
    </div>
  );
}
