"use client";

/**
 * Seven-level hierarchy tree.
 *
 * A client component only because the branches collapse; the tree itself is built
 * by `getHierarchyTree()` in the repository, so the shape is identical whether it
 * came from Prisma or from the fixtures.
 */

import * as React from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Factory,
  FolderTree,
  MapPin,
  Radio,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { HierarchyNode } from "@/lib/data/repositories/organization";
import { humaniseEnum } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIER_ICONS: Readonly<Record<string, React.ElementType>> = {
  ENTERPRISE: Building2,
  GROUP: FolderTree,
  BUSINESS_UNIT: FolderTree,
  DIVISION: FolderTree,
  FACILITY: MapPin,
  BUILDING: Factory,
  PRODUCTION_LINE: Workflow,
  EQUIPMENT: Cpu,
  SOURCE: Radio,
};

const TIER_TONES: Readonly<Record<string, string>> = {
  ENTERPRISE: "text-blue-600",
  GROUP: "text-purple-600",
  BUSINESS_UNIT: "text-purple-600",
  DIVISION: "text-purple-600",
  FACILITY: "text-emerald-600",
  BUILDING: "text-orange-500",
  PRODUCTION_LINE: "text-cyan-600",
  EQUIPMENT: "text-slate-600",
  SOURCE: "text-red-500",
};

function attributeSummary(node: HierarchyNode): string {
  const parts = Object.entries(node.attributes)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "boolean" ? (value ? "yes" : "no") : value}`);
  return parts.join(" · ");
}

function TreeNode({
  node,
  depth,
  defaultOpenDepth,
}: {
  readonly node: HierarchyNode;
  readonly depth: number;
  readonly defaultOpenDepth: number;
}) {
  const [open, setOpen] = React.useState(depth < defaultOpenDepth);
  const Icon = TIER_ICONS[node.tier] ?? Radio;
  const hasChildren = node.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-4 border-l pl-3" : ""}>
      <div className="flex items-center gap-1.5 rounded-md p-1.5 hover:bg-muted">
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={open}
            onClick={() => setOpen((previous) => !previous)}
            className="text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className={cn("size-4 shrink-0", TIER_TONES[node.tier] ?? "text-muted-foreground")} />
        <span className="text-sm font-medium">{node.name}</span>
        {node.code && (
          <span className="font-mono text-[11px] text-muted-foreground">{node.code}</span>
        )}
        <Badge variant="secondary" className="text-xs">
          {humaniseEnum(node.tier)}
        </Badge>
        {hasChildren && (
          <span className="text-[11px] text-muted-foreground">
            {node.children.length} child{node.children.length === 1 ? "" : "ren"}
          </span>
        )}
        <span className="ml-auto hidden truncate text-[11px] text-muted-foreground lg:inline">
          {attributeSummary(node)}
        </span>
      </div>
      {open &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            defaultOpenDepth={defaultOpenDepth}
          />
        ))}
    </div>
  );
}

export function HierarchyTree({
  root,
  defaultOpenDepth = 3,
}: {
  readonly root: HierarchyNode;
  readonly defaultOpenDepth?: number;
}) {
  return (
    <div data-testid="hierarchy-tree">
      <TreeNode node={root} depth={0} defaultOpenDepth={defaultOpenDepth} />
    </div>
  );
}
