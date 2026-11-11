
import { NextRequest, NextResponse } from "next/server";
import { Int32 } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

const MAX_INT32 = 2_147_483_647;

function isValidId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_INT32
  );
}

function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_INT32
  );
}

// GET: Fetch all reservations.
export async function GET(request: NextRequest) {
  try {
    const db = await getDatabase();

    const status = request.nextUrl.searchParams.get("status");

    const filter: Record<string, unknown> = {};

    if (status) {
      const validStatuses = [
        "REQUESTED",
        "APPROVED",
        "REJECTED",
        "FULFILLED",
      ];

      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { success: false, message: "Invalid reservation status" },
          { status: 400 }
        );
      }

      filter.status = status;
    }

    const reservations = await db
      .collection("reservations")
      .find(filter)
      .sort({ reservation_id: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      count: reservations.length,
      reservations,
    });
  } catch (error) {
    console.error("Fetch reservations error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}

// POST: Create a new reservation.
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const fields = body as Record<string, unknown>;

    const {
      inventory_id,
      project,
      supplier,
      quantity,
    } = fields;

    if (
      !isValidId(inventory_id) ||
      !isValidQuantity(quantity) ||
      typeof project !== "string" ||
      !project.trim() ||
      typeof supplier !== "string" ||
      !supplier.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid reservation details" },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const inventoryCollection = db.collection("inventory");
    const reservationsCollection = db.collection("reservations");

    // Verify that the requested material exists.
    const inventory = await inventoryCollection.findOne({
      inventory_id,
    });

    if (!inventory) {
      return NextResponse.json(
        { success: false, message: "Inventory item not found" },
        { status: 404 }
      );
    }

    // Verify that sufficient stock is currently available.
    if (quantity > Number(inventory.available)) {
      return NextResponse.json(
        {
          success: false,
          message: "Requested quantity exceeds available stock",
          available_quantity: Number(inventory.available),
        },
        { status: 409 }
      );
    }

    // Generate the next reservation ID.
    const lastReservation = await reservationsCollection.findOne(
      {},
      { sort: { reservation_id: -1 } }
    );

    const nextId = (lastReservation?.reservation_id ?? 0) + 1;

    if (!isValidId(nextId)) {
      return NextResponse.json(
        { success: false, message: "Reservation ID limit reached" },
        { status: 500 }
      );
    }

    const now = new Date();

    const reservation = {
      reservation_id: new Int32(nextId),
      inventory_id: new Int32(inventory_id),
      material: inventory.name,
      project: project.trim(),
      supplier: supplier.trim(),
      quantity: new Int32(quantity),
      unit: inventory.unit,
      status: "REQUESTED",
      created_at: now,
      updated_at: now,
    };

    const result = await reservationsCollection.insertOne(reservation);

    return NextResponse.json(
      {
        success: true,
        message: "Reservation created successfully",
        reservation: {
          ...reservation,
          _id: result.insertedId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create reservation error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
