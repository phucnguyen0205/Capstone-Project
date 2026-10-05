import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { corsHeaders } from "@/lib/cors";

/**
 * POST /api/upload
 * Server-side proxy để upload file lên Cloudinary qua unsigned preset.
 *
 * Lý do: cloud name + preset nằm server-side → client không cần hardcode.
 * Trước đây ChatColumn hardcode "dibicwvqv" (sai), giờ lấy từ env
 * `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.
 *
 * Body: FormData với field "file" và optional "kind" = "image" | "video" | "raw"
 * Response: { url, secure_url, public_id, kind }
 */
export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    return NextResponse.json(
      { error: "Server chưa cấu hình Cloudinary (cloud_name / upload_preset)." },
      { status: 500, headers: corsHeaders }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Body không phải FormData hợp lệ." },
      { status: 400, headers: corsHeaders }
    );
  }

  const file = form.get("file");
  if (typeof file === "string" || file == null) {
    return NextResponse.json(
      { error: 'Thiếu field "file" (File/Blob).' },
      { status: 400, headers: corsHeaders }
    );
  }

  const kindRaw = (form.get("kind") as string | null) ?? "image";
  const resourceType: "image" | "video" | "raw" =
    kindRaw === "video" ? "video" : kindRaw === "raw" ? "raw" : "image";

  // Giới hạn 200 MB (giống MAX_ATTACHMENT_BYTES client-side)
  const MAX_BYTES = 200 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Tệp vượt quá 200MB." },
      { status: 413, headers: corsHeaders }
    );
  }

  // Build FormData gửi sang Cloudinary
  const forward = new FormData();
  const fileName = (file as File).name || `upload-${Date.now()}`;
  forward.append("file", file, fileName);
  forward.append("upload_preset", uploadPreset);

  const cloudUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
  let cloudRes: Response;
  try {
    cloudRes = await fetch(cloudUrl, { method: "POST", body: forward });
  } catch (e) {
    console.error("Cloudinary network error", e);
    return NextResponse.json(
      { error: "Không kết nối được Cloudinary. Vui lòng thử lại." },
      { status: 502, headers: corsHeaders }
    );
  }

  if (!cloudRes.ok) {
    const txt = await cloudRes.text();
    console.error("Cloudinary error", cloudRes.status, txt);
    return NextResponse.json(
      { error: `Cloudinary trả về lỗi ${cloudRes.status}.` },
      { status: 502, headers: corsHeaders }
    );
  }

  const data = await cloudRes.json();
  return NextResponse.json(
    {
      url: data.secure_url || data.url,
      secure_url: data.secure_url,
      public_id: data.public_id,
      kind: resourceType,
    },
    { headers: corsHeaders }
  );
}
