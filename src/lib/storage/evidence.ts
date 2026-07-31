/**
 * Evidence file storage.
 *
 * Uses Supabase Storage when configured; gracefully returns an error result
 * when the storage bucket is unavailable (demo mode or unconfigured).
 */

import { isSupabaseConfigured } from "@/lib/auth/session";

export interface UploadResult {
  readonly success: boolean;
  readonly url?: string;
  readonly error?: string;
}

export interface DownloadResult {
  readonly success: boolean;
  readonly data?: Buffer;
  readonly contentType?: string;
  readonly error?: string;
}

const BUCKET_NAME = "evidence";

/**
 * Upload evidence file to Supabase Storage.
 * Returns a graceful error when Supabase is not configured.
 */
export async function uploadEvidence(
  organizationId: string,
  fileName: string,
  data: Buffer,
  contentType: string,
): Promise<UploadResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        "스토리지가 구성되지 않았습니다. Supabase를 설정한 후 다시 시도하세요.",
    };
  }

  try {
    // Dynamic import to avoid issues when supabase is not configured
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const path = `${organizationId}/${Date.now()}-${fileName}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, data, { contentType, upsert: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

    return { success: true, url: publicUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

/**
 * Download evidence file from Supabase Storage.
 * Returns a graceful error when Supabase is not configured.
 */
export async function downloadEvidence(
  path: string,
): Promise<DownloadResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        "스토리지가 구성되지 않았습니다. Supabase를 설정한 후 다시 시도하세요.",
    };
  }

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(path);

    if (error || !data) {
      return { success: false, error: error?.message ?? "File not found" };
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    return { success: true, data: buffer, contentType: data.type };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Download failed",
    };
  }
}

/**
 * Delete evidence file from Supabase Storage.
 */
export async function deleteEvidence(path: string): Promise<UploadResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        "스토리지가 구성되지 않았습니다. Supabase를 설정한 후 다시 시도하세요.",
    };
  }

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delete failed",
    };
  }
}
