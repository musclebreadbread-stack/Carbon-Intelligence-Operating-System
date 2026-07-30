"use client";

/**
 * Application header: tenant switcher, configuration badges and the user menu.
 *
 * Everything it renders comes from the session context the server layout
 * populated, so the header performs no data access of its own. Sign-out is a real
 * server action passed in as a prop — a client component must not import a
 * `'use server'` module that calls `redirect()` and then invoke it outside a form,
 * so it is submitted through a `<form>`.
 */

import Link from "next/link";
import { Bell, LogOut, Settings, ShieldAlert, Sparkles, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { useSession } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";

export type HeaderProps = {
  /** `signOutAction` from `src/lib/actions/auth.ts`. */
  readonly signOut: () => void | Promise<void>;
  readonly llmLabel: string;
  readonly llmConfigured: boolean;
  readonly openFindings: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Header({ signOut, llmLabel, llmConfigured, openFindings }: HeaderProps) {
  const { session, dataMode } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <OrganizationSwitcher />
        <Badge
          variant={dataMode === "demo" ? "outline" : "secondary"}
          title={
            dataMode === "demo"
              ? "No database configured — figures are computed from the bundled sample data"
              : "Reading from the configured PostgreSQL database"
          }
        >
          {dataMode === "demo" ? "Demo data" : "Live database"}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="hidden items-center gap-1 lg:inline-flex"
          title={llmLabel}
        >
          <Sparkles className="size-3" />
          {llmConfigured ? "LLM: OpenAI" : "LLM: deterministic"}
        </Badge>

        <Link
          href="/verification"
          aria-label={`Notifications (${openFindings} open findings)`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "relative",
          )}
        >
          <Bell className="size-4" />
          {openFindings > 0 && (
            <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-semibold text-white">
              {openFindings > 9 ? "9+" : openFindings}
            </span>
          )}
        </Link>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="text-xs">
                    {initials(session?.name ?? "Guest")}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm sm:inline">{session?.name ?? "Guest"}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="space-y-1">
              <span className="block text-sm font-medium">{session?.name ?? "Guest"}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {session?.email ?? "not signed in"}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {session?.roles.length ? session.roles.join(", ") : "no roles assigned"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {session?.source === "demo" && (
              <>
                <div className="flex items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Demo session — Supabase is not configured, so this is the bundled
                    administrator account.
                  </span>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings className="size-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/security" />}>
              <User className="size-3.5" />
              Users and roles
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
