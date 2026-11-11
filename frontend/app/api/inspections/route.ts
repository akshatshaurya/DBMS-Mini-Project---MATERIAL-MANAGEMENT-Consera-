import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";


const VALID_CONDITIONS = [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "UNUSABLE",
];

export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();
    const inventoryId = request.nextUrl.searchParams.get("inventory_id");

    const filter: Record<string, unknown> = {};

    if (inventoryId !== null) {
      const id = Number(inventoryId);

      if (!Number.isInteger(id)) {
        return NextResponse.json(
          { success: false, message: "Invalid inventory_id" },
          { status: 400 }
        );
      }

      filter.inventory_id = id;
    }

    const inspections = await db
      .collection("material_inspections")
      .find(filter)
      .sort({ inspection_date: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      count: inspections.length,
      inspections,
    });
  } catch (error) {
    console.error("Fetch inspections error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch inspections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      inventory_id,
      inspector_id,
      condition,
      defects = [],
      notes = "",
      photographs = [],
      inspection_date,
    } = body;

    if (
      !Number.isInteger(inventory_id) ||
      !Number.isInteger(inspector_id) ||
      !VALID_CONDITIONS.includes(condition) ||
      !inspection_date
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing required fields" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(defects) ||
      !defects.every((item) => typeof item === "string") ||
      !Array.isArray(photographs) ||
      !photographs.every((item) => typeof item === "string") ||
      typeof notes !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid inspection details" },
        { status: 400 }
      );
    }

    const date = new Date(inspection_date);

    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        { success: false, message: "Invalid inspection date" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const result = await db.collection("material_inspections").insertOne({
      inventory_id,
      inspector_id,
      condition,
      defects,
      notes,
      photographs,
      inspection_date: date,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Inspection created successfully",
        inspectionId: result.insertedId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create inspection error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create inspection" },
      { status: 500 }
    );
  }
}