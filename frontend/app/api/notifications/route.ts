
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const userId = request.nextUrl.searchParams.get("user_id");

    const filter = userId
      ? { user_id: Number(userId) }
      : {};

    const notifications = await db
      .collection("notifications")
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      user_id,
      notification_type,
      message,
      reference_id,
    } = body;

    const validTypes = [
      "RESERVATION_REQUESTED",
      "RESERVATION_APPROVED",
      "RESERVATION_REJECTED",
      "TRANSFER_DISPATCHED",
      "TRANSFER_DELIVERED",
      "MATERIAL_INSPECTED",
    ];

    if (
      !Number.isInteger(user_id) ||
      !validTypes.includes(notification_type) ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid notification data" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const notification = {
      user_id,
      notification_type,
      message: message.trim(),
      ...(Number.isInteger(reference_id) ? { reference_id } : {}),
      is_read: false,
      created_at: new Date(),
    };

    const result = await db
      .collection("notifications")
      .insertOne(notification);

    return NextResponse.json(
      {
        success: true,
        message: "Notification created",
        insertedId: result.insertedId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Failed to create notification" },
      { status: 500 }
    );
  }
}
