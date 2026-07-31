"use client";

/**
 * Application header: tenant switcher, configuration badges, language switcher
 * and the user menu.
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
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useSession } from "@/components/providers/session-provider";
import { useT } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export type HeaderProps = {
  readonly signOut: () => void | Promise<void>;
  readonly setLocale: (locale: string) => Promise<void>;
  readonly llmLabel: string;
  readonly llmConfigured: boolean;
  readonly openFindings: number;
  readonly unreadNotifications?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Header({
  signOut,
  setLocale,
  llmLabel,
  llmConfigured,
  openFindings,
  unreadNotifications = 0,
}: HeaderProps) {
  const { session, dataMode } = useSession();
  const t = useT();
  const outstanding = openFindings + unreadNotifications;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <OrganizationSwitcher />
        <Badge
          variant={dataMode === "demo" ? "outline" : "secondary"}
          title={dataMode === "demo" ? t("shell.demoBadgeTitle") : t("shell.liveBadgeTitle")}
        >
          {dataMode === "demo" ? t("shell.demoData") : t("shell.liveDatabase")}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="hidden items-center gap-1 lg:inline-flex"
          title={llmLabel}
        >
          <Sparkles className="size-3" />
          {llmConfigured ? t("shell.llmOpenAI") : t("shell.llmDeterministic")}
        </Badge>

        <LanguageSwitcher setLocale={setLocale} />

        <Link
          href="/notifications"
          aria-label={`${t("shell.notifications")} (${unreadNotifications})`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "relative",
          )}
        >
          <Bell className="size-4" />
          {outstanding > 0 && (
            <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-semibold text-white">
              {outstanding > 9 ? "9+" : outstanding}
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
                    {initials(session?.name ?? t("shell.guest"))}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm sm:inline">
                  {session?.name ?? t("shell.guest")}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="space-y-1">
              <span className="block text-sm font-medium">
                {session?.name ?? t("shell.guest")}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {session?.email ?? t("shell.notSignedIn")}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {session?.roles.length ? session.roles.join(", ") : t("shell.noRoles")}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {session?.source === "demo" && (
              <>
                <div className="flex items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t("shell.demoSession")}</span>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Settings className="size-3.5" />
              {t("shell.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/security" />}>
              <User className="size-3.5" />
              {t("shell.usersAndRoles")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted"
              >
                <LogOut className="size-3.5" />
                {t("shell.signOut")}
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
