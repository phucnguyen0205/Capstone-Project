import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/upload/confirm
 *
 * Client-side đã upload trực tiếp lên Cloudinary (unsigned).
 * Sau khi nhận result từ Cloudinary, gọi endpoint này để:
 *   1. Validate payload
 *   2. Lưu public_id vào database (để sau delete được)
 *
 * Body: JSON
 *   - publicId: string
 *   - url: string
 *   - type: "avatar" | "image" | "video" | "cover"
 *   - userId?: string
 */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { publicId, url, type, userId } = body;

    const validTypes = ["avatar", "image", "video", "cover"];

    if (!publicId || typeof publicId !== "string") {
      return NextResponse.json({ error: "Thiếu hoặc sai publicId." }, { status: 400 }, { headers: corsHeaders });
    }
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Thiếu hoặc sai url." }, { status: 400 }, { headers: corsHeaders });
    }
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `type không hợp lệ. Chọn: ${validTypes.join(" | ", { headers: corsHeaders })}` }, { status: 400 });
    }

    // TODO: Lưu vào database
    // await db.asset.create({ data: { publicId, url, type, userId, createdAt: new Date() } });

    return NextResponse.json({
      success: true,
      publicId,
      url,
      type,
      userId: userId ?? "anonymous",
      savedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

/**
 * DELETE /api/upload/confirm
 *
 * Xóa asset khỏi Cloudinary (cần signed request).
 * Cần CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET trong env.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { publicId, resourceType = "image" } = await request.json();

    if (!publicId) {
      return NextResponse.json({ error: "Thiếu publicId." }, { status: 400 }, { headers: corsHeaders });
    }

    // Nếu chưa có server-side credentials → trả lời client tự xử lý
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      return NextResponse.json(
        { error: "Server chưa có CLOUDINARY_API_SECRET — không thể xóa signed." },
        { status: 501 }
      , { headers: corsHeaders });
    }

    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ secure: true });

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType as "image" | "video" | "raw",
      invalidate: true,
    });

    // TODO: Xóa khỏi database
    // await db.asset.delete({ where: { publicId } });

    return NextResponse.json({ success: result.result === "ok", publicId, result: result.result }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
