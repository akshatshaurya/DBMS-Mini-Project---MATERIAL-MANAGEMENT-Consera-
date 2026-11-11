
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("user_id");

    if (!userId || !Number.isInteger(Number(userId))) {
      return NextResponse.json(
        { success: false, message: "Valid user_id is required" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const count = await db
      .collection("notifications")
      .countDocuments({
        user_id: Number(userId),
        is_read: false,
      });

    return NextResponse.json({
      success: true,
      unread_count: count,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}
