
import { NextRequest, NextResponse } from "next/server";
import { Int32 } from "mongodb";
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
    const category = request.nextUrl.searchParams.get("category");

    const filter: Record<string, unknown> = {};

    if (category) {
      filter.category = category;
    }

    const inventory = await db
      .collection("inventory")
      .find(filter)
      .sort({ inventory_id: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      count: inventory.length,
      inventory,
    });
  } catch (error) {
    console.error("Fetch inventory error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      category,
      unit,
      total,
      available,
      reserved = 0,
      condition,
    } = body;

    if (
      typeof name !== "string" || !name.trim() ||
      typeof category !== "string" || !category.trim() ||
      typeof unit !== "string" || !unit.trim() ||
      !Number.isSafeInteger(total) ||
      !Number.isSafeInteger(available) ||
      !Number.isSafeInteger(reserved) ||
      !VALID_CONDITIONS.includes(condition)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing inventory fields" },
        { status: 400 }
      );
    }

    if (
      total < 0 ||
      available < 0 ||
      reserved < 0 ||
      available + reserved !== total
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Quantities must be non-negative and available + reserved must equal total",
        },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const collection = db.collection("inventory");

    const lastItem = await collection
      .find({})
      .sort({ inventory_id: -1 })
      .limit(1)
      .next();

    const nextId = (lastItem?.inventory_id ?? 0) + 1;

    const result = await collection.insertOne({
      inventory_id: new Int32(nextId),
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      total: new Int32(total),
      available: new Int32(available),
      reserved: new Int32(reserved),
      condition,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Inventory item created successfully",
        inventoryId: nextId,
        insertedId: result.insertedId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create inventory error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create inventory item" },
      { status: 500 }
    );
  }
}
