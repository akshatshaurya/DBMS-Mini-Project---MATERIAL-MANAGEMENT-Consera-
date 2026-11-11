
import { NextRequest, NextResponse } from "next/server";
import { Int32, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_STATUSES = ["APPROVED", "REJECTED"];

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  let inventoryRollback:
    | { inventoryId: number; quantity: number }
    | null = null;

  let reservationRollback:
    | { objectId: ObjectId }
    | null = null;

  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid reservation ID" },
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

    const status = (body as Record<string, unknown>).status;

    if (
      typeof status !== "string" ||
      !VALID_STATUSES.includes(status)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Status must be APPROVED or REJECTED",
        },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const reservations = db.collection("reservations");
    const inventory = db.collection("inventory");

    const objectId = new ObjectId(id);

    const reservation = await reservations.findOne({
      _id: objectId,
    });

    if (!reservation) {
      return NextResponse.json(
        { success: false, message: "Reservation not found" },
        { status: 404 }
      );
    }

    if (reservation.status !== "REQUESTED") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only REQUESTED reservations can be approved or rejected",
        },
        { status: 409 }
      );
    }

    const now = new Date();

    if (status === "REJECTED") {
      const result = await reservations.updateOne(
        {
          _id: objectId,
          status: "REQUESTED",
        },
        {
          $set: {
            status: "REJECTED",
            updated_at: now,
          },
        }
      );

      if (result.modifiedCount !== 1) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Reservation status changed. Refresh and try again.",
          },
          { status: 409 }
        );
      }

      const updatedReservation = await reservations.findOne({
        _id: objectId,
      });

      return NextResponse.json({
        success: true,
        message: "Reservation rejected successfully",
        reservation: updatedReservation,
      });
    }

    const quantity = Number(reservation.quantity);
    const inventoryId = Number(reservation.inventory_id);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 2_147_483_647 ||
      !Number.isSafeInteger(inventoryId) ||
      inventoryId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid reservation quantities",
        },
        { status: 400 }
      );
    }

    // Claim the reservation before changing inventory.
    // This prevents simultaneous approval requests.
    const claimResult = await reservations.updateOne(
      {
        _id: objectId,
        status: "REQUESTED",
      },
      {
        $set: {
          status: "APPROVED",
          allocated_quantity: 0,
          delivered_quantity: 0,
          reserved_quantity: quantity,
          updated_at: now,
        },
      }
    );

    if (claimResult.modifiedCount !== 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Reservation status changed. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    reservationRollback = { objectId };

    // Move stock from available to reserved.
    const stockResult = await inventory.updateOne(
      {
        inventory_id: inventoryId,
        available: { $gte: quantity },
      },
      {
        $inc: {
          available: new Int32(-quantity),
          reserved: new Int32(quantity),
        },
      }
    );

    if (stockResult.modifiedCount !== 1) {
      await reservations.updateOne(
        {
          _id: objectId,
          status: "APPROVED",
        },
        {
          $set: {
            status: "REQUESTED",
          },
          $unset: {
            allocated_quantity: "",
            delivered_quantity: "",
            reserved_quantity: "",
          },
        }
      );

      reservationRollback = null;

      return NextResponse.json(
        {
          success: false,
          message:
            "Insufficient available stock to approve this reservation",
        },
        { status: 409 }
      );
    }

    inventoryRollback = { inventoryId, quantity };

    const updatedReservation = await reservations.findOne({
      _id: objectId,
    });

    inventoryRollback = null;
    reservationRollback = null;

    return NextResponse.json({
      success: true,
      message:
        "Reservation approved and inventory stock updated successfully",
      reservation: updatedReservation,
    });
  } catch (error) {
    console.error("Update reservation error:", error);

    try {
      const db = await getDatabase();

      if (inventoryRollback) {
        await db.collection("inventory").updateOne(
          {
            inventory_id: inventoryRollback.inventoryId,
            reserved: { $gte: inventoryRollback.quantity },
          },
          {
            $inc: {
              available: new Int32(inventoryRollback.quantity),
              reserved: new Int32(-inventoryRollback.quantity),
            },
          }
        );
      }

      if (reservationRollback) {
        await db.collection("reservations").updateOne(
          {
            _id: reservationRollback.objectId,
            status: "APPROVED",
          },
          {
            $set: {
              status: "REQUESTED",
            },
            $unset: {
              allocated_quantity: "",
              delivered_quantity: "",
              reserved_quantity: "",
            },
          }
        );
      }
    } catch (rollbackError) {
      console.error(
        "Reservation rollback error:",
        rollbackError
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update reservation",
      },
      { status: 500 }
    );
  }
}
