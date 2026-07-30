import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, FolderTree, MapPin } from "lucide-react";

const orgTree = [
  {
    name: "Acme Corporation",
    type: "Corporate",
    children: [
      {
        name: "North America Division",
        type: "Division",
        children: [
          { name: "Chicago Manufacturing Plant", type: "Facility", children: [] },
          { name: "Dallas Distribution Center", type: "Facility", children: [] },
        ],
      },
      {
        name: "Europe Division",
        type: "Division",
        children: [
          { name: "London Office", type: "Facility", children: [] },
          { name: "Berlin Factory", type: "Facility", children: [] },
        ],
      },
      {
        name: "APAC Division",
        type: "Division",
        children: [
          { name: "Tokyo Office", type: "Site", children: [] },
          { name: "Shanghai Manufacturing", type: "Facility", children: [] },
        ],
      },
    ],
  },
];

function TreeNode({ node, depth = 0 }: { node: typeof orgTree[0]; depth?: number }) {
  return (
    <div className={depth > 0 ? "ml-6 border-l pl-4" : ""}>
      <div className="flex items-center gap-2 rounded-md p-2 hover:bg-muted">
        {node.type === "Corporate" && <Building2 className="size-4 text-blue-600" />}
        {node.type === "Division" && <FolderTree className="size-4 text-purple-600" />}
        {node.type === "Facility" && <MapPin className="size-4 text-emerald-600" />}
        {node.type === "Site" && <MapPin className="size-4 text-orange-500" />}
        <span className="text-sm font-medium">{node.name}</span>
        <Badge variant="secondary" className="text-xs">
          {node.type}
        </Badge>
      </div>
      {node.children?.map((child) => (
        <TreeNode key={child.name} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function OrganizationPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
          <p className="text-sm text-muted-foreground">
            Manage your organizational hierarchy, facilities, and reporting boundaries.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            Add Facility
          </Button>
          <Button size="sm">
            <Plus className="size-4" />
            Add Organization
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Entities</CardDescription>
            <CardTitle className="text-2xl">8</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">1 corporate, 3 divisions, 4 facilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Reporting</CardDescription>
            <CardTitle className="text-2xl">6</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Entities with active data collection</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Regions Covered</CardDescription>
            <CardTitle className="text-2xl">3</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">North America, Europe, APAC</p>
          </CardContent>
        </Card>
      </div>

      {/* Organization Tree */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Hierarchy</CardTitle>
          <CardDescription>
            Corporate structure and reporting boundaries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgTree.map((node) => (
            <TreeNode key={node.name} node={node} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
