
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid notification ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const notification = await db
      .collection("notifications")
      .findOne({ _id: new ObjectId(id) });

    if (!notification) {
      return NextResponse.json(
        { success: false, message: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("Fetch notification error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch notification" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid notification ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (typeof body.is_read !== "boolean") {
      return NextResponse.json(
        { success: false, message: "is_read must be a boolean" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const result = await db
      .collection("notifications")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { is_read: body.is_read } }
      );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Notification not found" },
        { status: 404 }
      );
    }

    const notification = await db
      .collection("notifications")
      .findOne({ _id: new ObjectId(id) });

    return NextResponse.json({
      success: true,
      message: "Notification updated successfully",
      notification,
    });
  } catch (error) {
    console.error("Update notification error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update notification" },
      { status: 500 }
    );
  }
}
