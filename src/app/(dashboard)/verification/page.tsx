import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileCheck, Package, Clock, CheckCircle2, Plus } from "lucide-react";

const auditTrail = [
  { id: "VER-001", scope: "Scope 1 & 2 - FY2023", auditor: "Bureau Veritas", date: "2024-02-15", level: "Limited Assurance", status: "completed" },
  { id: "VER-002", scope: "Scope 3 - FY2023", auditor: "ERM CVS", date: "2024-03-01", level: "Limited Assurance", status: "in_progress" },
  { id: "VER-003", scope: "Carbon Neutrality", auditor: "SGS", date: "2024-04-01", level: "Reasonable Assurance", status: "scheduled" },
  { id: "VER-004", scope: "CDP Response 2024", auditor: "Internal", date: "2024-06-15", level: "Internal Review", status: "pending" },
  { id: "VER-005", scope: "SBTi Target Validation", auditor: "SBTi", date: "2024-07-01", level: "Target Validation", status: "pending" },
];

const evidencePackages = [
  { name: "Energy Consumption Data", documents: 24, size: "12.4 MB", status: "complete" },
  { name: "Fleet Fuel Records", documents: 18, size: "8.2 MB", status: "complete" },
  { name: "Process Emission Calculations", documents: 12, size: "5.6 MB", status: "complete" },
  { name: "Scope 3 Supporting Evidence", documents: 45, size: "28.1 MB", status: "partial" },
  { name: "Emission Factor Sources", documents: 8, size: "3.2 MB", status: "complete" },
  { name: "Methodology Documentation", documents: 6, size: "4.8 MB", status: "complete" },
];

export default function VerificationPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verification</h1>
          <p className="text-sm text-muted-foreground">
            Manage verification engagements, audit trails, and evidence packages.
          </p>
        </div>
        <Button size="sm">
          <Plus className="size-4" />
          New Verification
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />
              Completed
            </CardDescription>
            <CardTitle className="text-2xl">1</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Verification engagements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="size-3 text-blue-500" />
              In Progress
            </CardDescription>
            <CardTitle className="text-2xl">1</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Currently being verified</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <FileCheck className="size-3" />
              Scheduled
            </CardDescription>
            <CardTitle className="text-2xl">3</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Upcoming engagements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Package className="size-3" />
              Evidence Packages
            </CardDescription>
            <CardTitle className="text-2xl">6</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Supporting documents prepared</p>
          </CardContent>
        </Card>
      </div>

      {/* Audit Trail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Verification engagement history and status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-6 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span>ID</span>
              <span className="col-span-2">Scope</span>
              <span>Auditor</span>
              <span>Date</span>
              <span>Status</span>
            </div>
            {auditTrail.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-6 gap-4 border-b p-3 text-sm last:border-0"
              >
                <span className="font-mono text-xs">{item.id}</span>
                <span className="col-span-2 font-medium">{item.scope}</span>
                <span className="text-muted-foreground">{item.auditor}</span>
                <span className="text-muted-foreground">{item.date}</span>
                <Badge
                  variant={
                    item.status === "completed"
                      ? "secondary"
                      : item.status === "in_progress"
                        ? "outline"
                        : "outline"
                  }
                  className="w-fit text-xs"
                >
                  {item.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Evidence Packages */}
      <Card>
        <CardHeader>
          <CardTitle>Evidence Packages</CardTitle>
          <CardDescription>Document collections prepared for verification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {evidencePackages.map((pkg) => (
              <div key={pkg.name} className="flex items-center gap-3 rounded-md border p-3">
                <Package className="size-8 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pkg.documents} documents - {pkg.size}
                  </p>
                </div>
                <Badge
                  variant={pkg.status === "complete" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {pkg.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
