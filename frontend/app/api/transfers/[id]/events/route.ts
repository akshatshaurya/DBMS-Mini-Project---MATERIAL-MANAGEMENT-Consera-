
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid transfer ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const transfer = await db.collection("transfers").findOne({
      _id: new ObjectId(id),
    });

    if (!transfer) {
      return NextResponse.json(
        { success: false, message: "Transfer not found" },
        { status: 404 }
      );
    }

    const events = await db
      .collection("transfer_events")
      .find({
        transfer_id: transfer.transfer_id,
      })
      .sort({ timestamp: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      transfer_id: transfer.transfer_id,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Fetch transfer events error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch transfer events" },
      { status: 500 }
    );
  }
}
