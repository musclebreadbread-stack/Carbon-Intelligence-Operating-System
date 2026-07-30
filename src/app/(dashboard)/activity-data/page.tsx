import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const recentEntries = [
  { source: "Electricity Meter - Plant A", type: "Scope 2", quantity: "145,200 kWh", date: "2024-03-15", status: "validated" },
  { source: "Fleet Fuel - Diesel", type: "Scope 1", quantity: "12,500 L", date: "2024-03-14", status: "validated" },
  { source: "Business Travel - Air", type: "Scope 3", quantity: "85 flights", date: "2024-03-13", status: "pending" },
  { source: "Natural Gas - Boiler", type: "Scope 1", quantity: "8,300 m3", date: "2024-03-12", status: "validated" },
  { source: "Waste - Landfill", type: "Scope 3", quantity: "24 tonnes", date: "2024-03-11", status: "flagged" },
  { source: "Refrigerant Top-up", type: "Scope 1", quantity: "15 kg R-410A", date: "2024-03-10", status: "validated" },
];

export default function ActivityDataPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity Data</h1>
          <p className="text-sm text-muted-foreground">
            Import, validate, and manage activity data for emission calculations.
          </p>
        </div>
        <Button size="sm">
          <Upload className="size-4" />
          Import Data
        </Button>
      </div>

      {/* Data Import Area */}
      <Card>
        <CardHeader>
          <CardTitle>Data Import</CardTitle>
          <CardDescription>
            Upload activity data from spreadsheets, APIs, or IoT integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center">
            <FileSpreadsheet className="mb-3 size-10 text-muted-foreground" />
            <p className="text-sm font-medium">Drop files here or click to upload</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supports CSV, XLSX, JSON. Max 50MB per file.
            </p>
            <Button variant="outline" size="sm" className="mt-4">
              Browse Files
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Validation Status */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" />
              Validated
            </CardDescription>
            <CardTitle className="text-2xl">1,847</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={78} className="h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">78% of total records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="size-3 text-amber-500" />
              Pending
            </CardDescription>
            <CardTitle className="text-2xl">312</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={13} className="h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">13% awaiting review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <XCircle className="size-3 text-red-500" />
              Flagged
            </CardDescription>
            <CardTitle className="text-2xl">45</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={2} className="h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">2% require attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completeness</CardDescription>
            <CardTitle className="text-2xl">94%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={94} className="h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">Q1 2024 data coverage</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
          <CardDescription>Latest activity data submissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-5 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span>Source</span>
              <span>Type</span>
              <span>Quantity</span>
              <span>Date</span>
              <span>Status</span>
            </div>
            {recentEntries.map((entry, index) => (
              <div
                key={index}
                className="grid grid-cols-5 gap-4 border-b p-3 text-sm last:border-0"
              >
                <span className="font-medium">{entry.source}</span>
                <Badge variant="outline" className="w-fit">{entry.type}</Badge>
                <span className="text-muted-foreground">{entry.quantity}</span>
                <span className="text-muted-foreground">{entry.date}</span>
                <Badge
                  variant={
                    entry.status === "validated"
                      ? "secondary"
                      : entry.status === "flagged"
                        ? "destructive"
                        : "outline"
                  }
                  className="w-fit"
                >
                  {entry.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
