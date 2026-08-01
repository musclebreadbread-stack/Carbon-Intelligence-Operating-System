/**
 * Evidence download/delete endpoint.
 *
 * GET /api/evidence/:id — download a specific evidence file.
 * DELETE /api/evidence/:id — delete an evidence file.
 */

import { NextRequest, NextResponse } from "next/server";

import { downloadEvidence, deleteEvidence } from "@/lib/storage/evidence";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await downloadEvidence(id);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 422 },
    );
  }

  return new NextResponse(result.data ? new Uint8Array(result.data) : null, {
    status: 200,
    headers: {
      "Content-Type": result.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${id.split("/").pop()}"`,
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await deleteEvidence(id);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({ deleted: true });
}
