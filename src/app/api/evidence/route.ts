/**
 * Evidence upload endpoint.
 *
 * POST /api/evidence — upload a file as audit evidence (persists AuditEvidence
 *   metadata atomically with upload; cleans up orphan on failure).
 * GET /api/evidence — list uploaded evidence for the session user's organization.
 *
 * When Supabase Storage is not configured, the metadata is still persisted (without
 * a storageUrl) so the evidence list works in demo mode.
 */

import { createHash } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { prisma } from "@/lib/prisma";
import { uploadEvidence, deleteEvidence } from "@/lib/storage/evidence";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/zip",
  "application/octet-stream",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = await activeOrganizationId();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    const effectiveMimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(effectiveMimeType)) {
      return NextResponse.json(
        { error: "File type not allowed. Accepted: PDF, images, Office documents, CSV, ZIP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex");
    const fileName = file.name;
    const mimeType = file.type || "application/octet-stream";
    const fileSize = buffer.length;

    // Attempt upload to storage.
    const result = await uploadEvidence(
      organizationId,
      fileName,
      buffer,
      mimeType,
    );

    const storageUrl = result.success ? result.url ?? null : null;

    // Persist AuditEvidence metadata atomically.
    let evidence;
    try {
      evidence = await prisma.auditEvidence.create({
        data: {
          type: "document",
          title: fileName,
          fileName,
          mimeType,
          fileSize,
          hash,
          storageUrl,
          organizationId,
          userId: session.userId,
        },
      });
    } catch (dbError) {
      // If metadata persistence fails and a file was uploaded, clean up the orphan.
      if (storageUrl) {
        const path = `${organizationId}/${fileName}`;
        await deleteEvidence(path).catch(() => {});
      }
      throw dbError;
    }

    return NextResponse.json({
      id: evidence.id,
      url: storageUrl,
      fileName,
      size: fileSize,
      hash,
    });
  } catch (error) {
    console.error("Evidence upload error:", error);
    if (
      error instanceof Error &&
      (error.message.includes("Unauthorized") || error.message.includes("No session"))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to upload evidence" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    await requireSession();
    const organizationId = await activeOrganizationId();

    const evidence = await prisma.auditEvidence.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        hash: true,
        storageUrl: true,
        createdAt: true,
        userId: true,
      },
    });

    return NextResponse.json({ evidence });
  } catch (error) {
    console.error("Evidence list error:", error);
    if (
      error instanceof Error &&
      (error.message.includes("Unauthorized") || error.message.includes("No session"))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to list evidence" },
      { status: 500 },
    );
  }
}
