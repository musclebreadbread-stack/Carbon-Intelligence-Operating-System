import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Download, Calendar } from "lucide-react";

const categories = [
  { name: "Energy", count: 245, icon: "⚡" },
  { name: "Transport", count: 189, icon: "🚛" },
  { name: "Industrial Processes", count: 156, icon: "🏭" },
  { name: "Waste", count: 78, icon: "♻️" },
  { name: "Agriculture", count: 92, icon: "🌾" },
  { name: "Refrigerants", count: 34, icon: "❄️" },
];

const factors = [
  { name: "Grid Electricity - US Average", value: "0.417", unit: "kgCO2e/kWh", source: "EPA eGRID 2023", region: "United States", updated: "2024-01" },
  { name: "Natural Gas - Combustion", value: "2.02", unit: "kgCO2e/m3", source: "IPCC AR6", region: "Global", updated: "2023-12" },
  { name: "Diesel - Mobile Combustion", value: "2.68", unit: "kgCO2e/L", source: "DEFRA 2024", region: "United Kingdom", updated: "2024-03" },
  { name: "Grid Electricity - EU Average", value: "0.256", unit: "kgCO2e/kWh", source: "EEA 2023", region: "Europe", updated: "2024-01" },
  { name: "Air Travel - Short Haul", value: "0.255", unit: "kgCO2e/pkm", source: "DEFRA 2024", region: "Global", updated: "2024-03" },
  { name: "R-410A Refrigerant", value: "2088", unit: "kgCO2e/kg", source: "IPCC AR6", region: "Global", updated: "2023-06" },
];

export default function EmissionFactorsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Emission Factors</h1>
          <p className="text-sm text-muted-foreground">
            Browse and manage emission factor libraries from global databases.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="size-4" />
          Export Library
        </Button>
      </div>

      {/* Search and Version Info */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search emission factors by name, category, or source..." className="pl-10" />
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <Calendar className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">v2024.1</span>
        </div>
      </div>

      {/* Categories */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map((cat) => (
          <Card key={cat.name} className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-col items-center p-4 text-center">
              <span className="text-2xl">{cat.icon}</span>
              <span className="mt-1 text-xs font-medium">{cat.name}</span>
              <span className="text-xs text-muted-foreground">{cat.count} factors</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Version Info */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <BookOpen className="size-3" />
              Total Factors
            </CardDescription>
            <CardTitle className="text-2xl">794</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across 6 categories and 12 sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Updated</CardDescription>
            <CardTitle className="text-2xl">March 2024</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">DEFRA, EPA, IPCC databases refreshed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data Sources</CardDescription>
            <CardTitle className="text-2xl">12</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">EPA, DEFRA, IPCC, EEA, GHG Protocol</p>
          </CardContent>
        </Card>
      </div>

      {/* Factor Library Table */}
      <Card>
        <CardHeader>
          <CardTitle>Factor Library</CardTitle>
          <CardDescription>
            Emission factors with source attribution and regional applicability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-6 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span className="col-span-2">Factor Name</span>
              <span>Value</span>
              <span>Source</span>
              <span>Region</span>
              <span>Updated</span>
            </div>
            {factors.map((factor, index) => (
              <div
                key={index}
                className="grid grid-cols-6 gap-4 border-b p-3 text-sm last:border-0"
              >
                <span className="col-span-2 font-medium">{factor.name}</span>
                <span className="font-mono">
                  {factor.value} <span className="text-xs text-muted-foreground">{factor.unit}</span>
                </span>
                <Badge variant="outline" className="w-fit text-xs">{factor.source}</Badge>
                <span className="text-muted-foreground">{factor.region}</span>
                <span className="text-muted-foreground">{factor.updated}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
