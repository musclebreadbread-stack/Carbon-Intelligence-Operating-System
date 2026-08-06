"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/components/providers/locale-provider";
import type { DictionaryKey } from "@/lib/i18n/dictionaries/ko";
import {
  Building2,
  Database,
  Activity,
  Flame,
  BookOpen,
  Brain,
  Map,
  FlaskConical,
  Bot,
  Shield,
  FileCheck,
  FileText,
  Coins,
  LayoutDashboard,
  BarChart3,
  Globe,
  Lock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Leaf,
} from "lucide-react";

interface NavItem {
  titleKey: DictionaryKey;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  titleKey: DictionaryKey;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    titleKey: "nav.sectionOperations",
    items: [
      { titleKey: "nav.organization", href: "/organization", icon: Building2 },
      { titleKey: "nav.masterData", href: "/master-data", icon: Database },
      { titleKey: "nav.activityData", href: "/activity-data", icon: Activity },
      { titleKey: "nav.emissionEngine", href: "/emission-engine", icon: Flame },
      { titleKey: "nav.emissionFactors", href: "/emission-factors", icon: BookOpen },
    ],
  },
  {
    titleKey: "nav.sectionIntelligence",
    items: [
      { titleKey: "nav.aiEngine", href: "/ai-engine", icon: Brain },
      { titleKey: "nav.aiRoadmap", href: "/ai-roadmap", icon: Map },
      { titleKey: "nav.aiSimulator", href: "/ai-simulator", icon: FlaskConical },
      { titleKey: "nav.aiAgents", href: "/ai-agents", icon: Bot },
    ],
  },
  {
    titleKey: "nav.sectionCompliance",
    items: [
      { titleKey: "nav.digitalMrv", href: "/digital-mrv", icon: Shield },
      { titleKey: "nav.verification", href: "/verification", icon: FileCheck },
      { titleKey: "nav.esgDisclosure", href: "/esg-disclosure", icon: FileText },
      { titleKey: "nav.carbonFinance", href: "/carbon-finance", icon: Coins },
    ],
  },
  {
    titleKey: "nav.sectionSystem",
    items: [
      { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
      { titleKey: "nav.analytics", href: "/analytics", icon: BarChart3 },
      { titleKey: "nav.apiGateway", href: "/api-gateway", icon: Globe },
      { titleKey: "nav.security", href: "/security", icon: Lock },
      { titleKey: "nav.settings", href: "/settings", icon: Settings },
    ],
  },
];

function getInitialCollapsed() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("sidebar-collapsed") === "true";
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const [collapsed, setCollapsed] = React.useState(getInitialCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "relative flex h-full flex-col border-r bg-background transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo / Brand */}
        <div className="flex h-14 items-center border-b px-4">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <Leaf className="size-5 text-emerald-600" />
              <span className="text-sm font-semibold">CIOS</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard" className="mx-auto">
              <Leaf className="size-5 text-emerald-600" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-2">
            {navigationSections.map((section, sectionIndex) => (
              <div key={section.titleKey}>
                {sectionIndex > 0 && <Separator className="my-2" />}
                {!collapsed && (
                  <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t(section.titleKey)}
                  </p>
                )}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    const title = t(item.titleKey);

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger
                            render={
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                  isActive && "bg-muted text-foreground"
                                )}
                              />
                            }
                          >
                            <Icon className="size-4" />
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {title}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex h-9 items-center gap-3 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                          isActive && "bg-muted text-foreground font-medium"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span>{title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Collapse Toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            className="w-full"
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
