/**
 * Evidence upload endpoint.
 *
 * POST /api/evidence — upload a file as audit evidence.
 * GET /api/evidence — list uploaded evidence for the organization.
 *
 * When Supabase Storage is not configured, returns a descriptive error.
 */

import { NextRequest, NextResponse } from "next/server";

import { activeOrganizationId } from "@/lib/auth/active-organization";
import { uploadEvidence } from "@/lib/storage/evidence";

export async function POST(request: NextRequest) {
  try {
    const organizationId = await activeOrganizationId();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadEvidence(
      organizationId,
      file.name,
      buffer,
      file.type || "application/octet-stream",
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 422 },
      );
    }

    return NextResponse.json({
      url: result.url,
      fileName: file.name,
      size: buffer.length,
    });
  } catch (error) {
    console.error("Evidence upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload evidence" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    // In demo mode, return an empty list with a helpful message
    return NextResponse.json({
      evidence: [],
      message: "증거 파일 목록은 Supabase Storage 구성 후 사용할 수 있습니다.",
    });
  } catch (error) {
    console.error("Evidence list error:", error);
    return NextResponse.json(
      { error: "Failed to list evidence" },
      { status: 500 },
    );
  }
}
