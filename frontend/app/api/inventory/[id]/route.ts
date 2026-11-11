
import { NextRequest, NextResponse } from "next/server";
import { Int32, ObjectId } from "mongodb";
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

const MAX_INT32 = 2_147_483_647;

function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_INT32
  );
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid inventory ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const inventory = await db.collection("inventory").findOne({
      _id: new ObjectId(id),
    });

    if (!inventory) {
      return NextResponse.json(
        { success: false, message: "Inventory item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      inventory,
    });
  } catch (error) {
    console.error("Fetch inventory item error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch inventory item" },
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
        { success: false, message: "Invalid inventory ID" },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const fields = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    const quantityFields = ["total", "available", "reserved"] as const;
    const quantityUpdates: Partial<
      Record<(typeof quantityFields)[number], number>
    > = {};

    for (const field of ["name", "category", "unit"] as const) {
      if (fields[field] !== undefined) {
        if (typeof fields[field] !== "string" || !fields[field].trim()) {
          return NextResponse.json(
            { success: false, message: `Invalid ${field}` },
            { status: 400 }
          );
        }

        updates[field] = fields[field].trim();
      }
    }

    if (fields.condition !== undefined) {
      if (
        typeof fields.condition !== "string" ||
        !VALID_CONDITIONS.includes(fields.condition)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid inventory condition" },
          { status: 400 }
        );
      }

      updates.condition = fields.condition;
    }

    for (const field of quantityFields) {
      if (fields[field] !== undefined) {
        const quantity = fields[field];

        if (!isValidQuantity(quantity)) {
          return NextResponse.json(
            { success: false, message: `Invalid ${field}` },
            { status: 400 }
          );
        }

        quantityUpdates[field] = quantity;
        updates[field] = new Int32(quantity);
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid fields provided" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const collection = db.collection("inventory");
    const objectId = new ObjectId(id);
    const existing = await collection.findOne({ _id: objectId });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Inventory item not found" },
        { status: 404 }
      );
    }

    if (quantityFields.some((field) => fields[field] !== undefined)) {
      const total = quantityUpdates.total ?? existing.total;
      const available = quantityUpdates.available ?? existing.available;
      const reserved = quantityUpdates.reserved ?? existing.reserved;

      if (
        !isValidQuantity(total) ||
        !isValidQuantity(available) ||
        !isValidQuantity(reserved) ||
        available + reserved !== total
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Quantities must be non-negative and available + reserved must equal total",
          },
          { status: 400 }
        );
      }
    }

    await collection.updateOne({ _id: objectId }, { $set: updates });
    const inventory = await collection.findOne({ _id: objectId });

    return NextResponse.json({
      success: true,
      message: "Inventory item updated successfully",
      inventory,
    });
  } catch (error) {
    console.error("Update inventory item error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update inventory item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid inventory ID" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const inventoryCollection = db.collection("inventory");
    const objectId = new ObjectId(id);

    // Find the inventory item first.
    const inventory = await inventoryCollection.findOne({
      _id: objectId,
    });

    if (!inventory) {
      return NextResponse.json(
        { success: false, message: "Inventory item not found" },
        { status: 404 }
      );
    }

    // Check whether inspections reference this inventory item.
    const inspectionCount = await db
      .collection("material_inspections")
      .countDocuments({
        inventory_id: inventory.inventory_id,
      });

    // Check whether transfers reference this inventory item.
    const transferCount = await db
      .collection("transfers")
      .countDocuments({
        inventory_id: inventory.inventory_id,
      });

    // Prevent deletion if dependent records exist.
    if (inspectionCount > 0 || transferCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Cannot delete this material because it is referenced by existing inspections or transfers.",
          references: {
            inspections: inspectionCount,
            transfers: transferCount,
          },
        },
        { status: 409 }
      );
    }

    const result = await inventoryCollection.deleteOne({
      _id: objectId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Inventory item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Inventory item deleted successfully",
    });
  } catch (error) {
    console.error("Delete inventory item error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete inventory item" },
      { status: 500 }
    );
  }
}
