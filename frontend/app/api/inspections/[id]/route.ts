
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_CONDITIONS = [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "UNUSABLE",
];

// GET: Fetch inspection by ID
export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid inspection ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const inspection = await db
      .collection("material_inspections")
      .findOne({ _id: new ObjectId(id) });

    if (!inspection) {
      return NextResponse.json(
        { success: false, message: "Inspection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      inspection,
    });
  } catch (error) {
    console.error("Fetch inspection error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch inspection" },
      { status: 500 }
    );
  }
}

// PATCH: Update inspection
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid inspection ID" },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.condition !== undefined) {
      if (!VALID_CONDITIONS.includes(body.condition)) {
        return NextResponse.json(
          { success: false, message: "Invalid inspection condition" },
          { status: 400 }
        );
      }

      updates.condition = body.condition;
    }

    if (body.defects !== undefined) {
      if (
        !Array.isArray(body.defects) ||
        !body.defects.every((item: unknown) => typeof item === "string")
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid defects" },
          { status: 400 }
        );
      }

      updates.defects = body.defects;
    }

    if (body.notes !== undefined) {
      if (typeof body.notes !== "string") {
        return NextResponse.json(
          { success: false, message: "Invalid notes" },
          { status: 400 }
        );
      }

      updates.notes = body.notes;
    }

    if (body.photographs !== undefined) {
      if (
        !Array.isArray(body.photographs) ||
        !body.photographs.every((item: unknown) => typeof item === "string")
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid photographs" },
          { status: 400 }
        );
      }

      updates.photographs = body.photographs;
    }

    if (body.inspection_date !== undefined) {
      const date = new Date(body.inspection_date);

      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, message: "Invalid inspection date" },
          { status: 400 }
        );
      }

      updates.inspection_date = date;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid fields provided" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const collection = db.collection("material_inspections");

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Inspection not found" },
        { status: 404 }
      );
    }

    const inspection = await collection.findOne({
      _id: new ObjectId(id),
    });

    return NextResponse.json({
      success: true,
      message: "Inspection updated successfully",
      inspection,
    });
  } catch (error) {
    console.error("Update inspection error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update inspection" },
      { status: 500 }
    );
  }
}

// DELETE: Delete inspection
export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid inspection ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const result = await db
      .collection("material_inspections")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Inspection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Inspection deleted successfully",
    });
  } catch (error) {
    console.error("Delete inspection error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete inspection" },
      { status: 500 }
    );
  }
}
