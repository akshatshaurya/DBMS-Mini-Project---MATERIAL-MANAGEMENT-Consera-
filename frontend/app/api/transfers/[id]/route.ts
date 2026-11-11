
import { NextRequest, NextResponse } from "next/server";
import { Int32, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ALLOWED_STATUSES = [
  "PENDING",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
] as const;

type TransferStatus = (typeof ALLOWED_STATUSES)[number];

const VALID_TRANSITIONS: Record<string, TransferStatus[]> = {
  PENDING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
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

    return NextResponse.json({
      success: true,
      transfer,
    });
  } catch (error) {
    console.error("Fetch transfer error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch transfer" },
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
        { success: false, message: "Invalid transfer ID" },
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

    const { status, performed_by, description } =
      body as Record<string, unknown>;

    if (
      typeof status !== "string" ||
      !ALLOWED_STATUSES.includes(status as TransferStatus) ||
      !Number.isSafeInteger(performed_by) ||
      (performed_by as number) <= 0 ||
      (performed_by as number) > 2_147_483_647 ||
      (description !== undefined && typeof description !== "string")
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid status or performed_by" },
        { status: 400 }
      );
    }

    const newStatus = status as TransferStatus;
    const performedBy = performed_by as number;

    const db = await getDatabase();

    const transfers = db.collection("transfers");
    const events = db.collection("transfer_events");
    const inventory = db.collection("inventory");
    const reservations = db.collection("reservations");

    const inventoryAllocations = db.collection<{
      _id: number;
      inventory_id: number;
      committed_quantity: number;
    }>("transfer_inventory_allocations");

    const objectId = new ObjectId(id);

    const existing = await transfers.findOne({
      _id: objectId,
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Transfer not found" },
        { status: 404 }
      );
    }

    const currentStatus = existing.status as string;

    if (!VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid transfer transition: ${currentStatus} → ${newStatus}`,
        },
        { status: 409 }
      );
    }

    if (
      !Number.isSafeInteger(existing.inventory_id) ||
      existing.inventory_id <= 0 ||
      !Number.isSafeInteger(existing.quantity) ||
      existing.quantity <= 0 ||
      existing.quantity > 2_147_483_647 ||
      !Number.isSafeInteger(existing.transfer_id) ||
      !Number.isSafeInteger(existing.reservation_id)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Transfer contains invalid inventory or quantity data",
        },
        { status: 409 }
      );
    }

    const inventoryId = existing.inventory_id as number;
    const transferQuantity = existing.quantity as number;
    const reservationId = existing.reservation_id as number;

    const isDelivered = newStatus === "DELIVERED";
    const isCancelled = newStatus === "CANCELLED";
    const changesStock = isDelivered || isCancelled;

    // Check reservation lifecycle fields before claiming the transfer.
    // Historical reservations without these fields are deliberately blocked.
    let reservation: {
      reservation_id: number;
      quantity: number;
      allocated_quantity: number;
      delivered_quantity: number;
      reserved_quantity: number;
      status: string;
    } | null = null;

    if (changesStock) {
      const foundReservation = await reservations.findOne({
        reservation_id: reservationId,
      });

      if (!foundReservation) {
        return NextResponse.json(
          {
            success: false,
            message: "Associated reservation was not found",
          },
          { status: 409 }
        );
      }

      const validLifecycle =
        foundReservation.status === "APPROVED" &&
        Number.isSafeInteger(foundReservation.quantity) &&
        Number.isSafeInteger(foundReservation.allocated_quantity) &&
        Number.isSafeInteger(foundReservation.delivered_quantity) &&
        Number.isSafeInteger(foundReservation.reserved_quantity) &&
        foundReservation.allocated_quantity >= transferQuantity &&
        foundReservation.reserved_quantity >= transferQuantity &&
        foundReservation.delivered_quantity >= 0;

      if (!validLifecycle) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Reservation lifecycle fields are missing or inconsistent. Reconcile this reservation before completing or cancelling the transfer.",
          },
          { status: 409 }
        );
      }

      reservation = {
        reservation_id: foundReservation.reservation_id,
        quantity: foundReservation.quantity,
        allocated_quantity: foundReservation.allocated_quantity,
        delivered_quantity: foundReservation.delivered_quantity,
        reserved_quantity: foundReservation.reserved_quantity,
        status: foundReservation.status,
      };
    }

    const now = new Date();

    // Claim the transition to prevent duplicate processing.
    const transferResult = await transfers.updateOne(
      {
        _id: objectId,
        status: currentStatus,
      },
      {
        $set: {
          status: newStatus,
          updated_at: now,
        },
      }
    );

    if (transferResult.matchedCount !== 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Transfer was modified by another request. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    let stockUpdated = false;
    let allocationUpdated = false;
    let reservationUpdated = false;
    let eventInserted = false;

    const eventId = new ObjectId();

    const rollback = async () => {
      // Reverse reservation quantity changes.
      if (reservationUpdated) {
        const result = isDelivered
          ? await reservations.updateOne(
              { reservation_id: reservationId },
              {
                $inc: {
                  delivered_quantity: new Int32(-transferQuantity),
                  reserved_quantity: new Int32(transferQuantity),
                },
              }
            )
          : await reservations.updateOne(
              { reservation_id: reservationId },
              {
                $inc: {
                  allocated_quantity: new Int32(transferQuantity),
                  reserved_quantity: new Int32(transferQuantity),
                },
              }
            );

        if (result.matchedCount !== 1) {
          console.error("Reservation quantity rollback failed.");
        }
      }

      // Restore the active inventory commitment.
      if (allocationUpdated) {
        const result = await inventoryAllocations.updateOne(
          {
            _id: inventoryId,
          },
          {
            $inc: {
              committed_quantity: new Int32(transferQuantity),
            },
          }
        );

        if (result.matchedCount !== 1) {
          console.error("Inventory allocation rollback failed.");
        }
      }

      // Restore inventory stock.
      if (stockUpdated) {
        const result = isDelivered
          ? await inventory.updateOne(
              { inventory_id: inventoryId },
              {
                $inc: {
                  reserved: new Int32(transferQuantity),
                },
              }
            )
          : await inventory.updateOne(
              { inventory_id: inventoryId },
              {
                $inc: {
                  reserved: new Int32(transferQuantity),
                  available: new Int32(-transferQuantity),
                },
              }
            );

        if (result.matchedCount !== 1) {
          console.error("Inventory stock rollback failed.");
        }
      }

      // Remove the event if it was inserted.
      if (eventInserted) {
        await events.deleteOne({ _id: eventId });
      }

      // Restore the previous transfer status.
      const statusRollback = await transfers.updateOne(
        {
          _id: objectId,
          status: newStatus,
        },
        {
          $set: {
            status: currentStatus,
            updated_at: existing.updated_at ?? now,
          },
        }
      );

      if (statusRollback.matchedCount !== 1) {
        console.error("Transfer status rollback failed.");
      }
    };

    try {
      if (changesStock) {
        // 1. Update inventory stock.
        const stockResult = isDelivered
          ? await inventory.updateOne(
              {
                inventory_id: inventoryId,
                reserved: { $gte: transferQuantity },
              },
              {
                $inc: {
                  reserved: new Int32(-transferQuantity),
                },
              }
            )
          : await inventory.updateOne(
              {
                inventory_id: inventoryId,
                reserved: { $gte: transferQuantity },
              },
              {
                $inc: {
                  reserved: new Int32(-transferQuantity),
                  available: new Int32(transferQuantity),
                },
              }
            );

        if (stockResult.matchedCount !== 1) {
          throw new Error("Insufficient reserved inventory");
        }

        stockUpdated = true;

        // 2. Release active transfer commitment.
        const allocationResult = await inventoryAllocations.updateOne(
          {
            _id: inventoryId,
            committed_quantity: { $gte: transferQuantity },
          },
          {
            $inc: {
              committed_quantity: new Int32(-transferQuantity),
            },
          }
        );

        if (allocationResult.matchedCount !== 1) {
          throw new Error(
            "Inventory commitment allocation is missing or insufficient"
          );
        }

        allocationUpdated = true;

        // 3. Update reservation lifecycle quantities.
        const reservationResult = isDelivered
          ? await reservations.updateOne(
              {
                reservation_id: reservationId,
                status: "APPROVED",
                allocated_quantity: { $gte: transferQuantity },
                reserved_quantity: { $gte: transferQuantity },
              },
              {
                $inc: {
                  delivered_quantity: new Int32(transferQuantity),
                  reserved_quantity: new Int32(-transferQuantity),
                },
                $set: {
                  updated_at: now,
                },
              }
            )
          : await reservations.updateOne(
              {
                reservation_id: reservationId,
                status: "APPROVED",
                allocated_quantity: { $gte: transferQuantity },
                reserved_quantity: { $gte: transferQuantity },
              },
              {
                $inc: {
                  allocated_quantity: new Int32(-transferQuantity),
                  reserved_quantity: new Int32(-transferQuantity),
                },
                $set: {
                  updated_at: now,
                },
              }
            );

        if (reservationResult.matchedCount !== 1) {
          throw new Error(
            "Reservation quantity update failed. Reconcile the reservation before proceeding."
          );
        }

        reservationUpdated = true;
      }

      // 4. Record the status change.
      await events.insertOne({
        _id: eventId,
        transfer_id: new Int32(existing.transfer_id),
        event_type: newStatus,
        performed_by: new Int32(performedBy),
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : `Transfer status changed to ${newStatus}`,
        timestamp: now,
      });

      eventInserted = true;
    } catch (operationError) {
      console.error(
        "Transfer status operation failed; attempting rollback:",
        operationError
      );

      try {
        await rollback();
      } catch (rollbackError) {
        console.error("Transfer rollback encountered an error:", rollbackError);
      }

      return NextResponse.json(
        {
          success: false,
          message:
            operationError instanceof Error
              ? operationError.message
              : "Transfer update failed",
        },
        { status: 409 }
      );
    }

    // 5. Fulfil the reservation only after the entire quantity is delivered.
    if (isDelivered && reservation) {
      const updatedDeliveredQuantity =
        reservation.delivered_quantity + transferQuantity;

      if (updatedDeliveredQuantity >= reservation.quantity) {
        const fulfilResult = await reservations.updateOne(
          {
            reservation_id: reservationId,
            status: "APPROVED",
            delivered_quantity: { $gte: reservation.quantity },
          },
          {
            $set: {
              status: "FULFILLED",
              updated_at: new Date(),
            },
          }
        );

        if (fulfilResult.matchedCount !== 1) {
          console.error(
            "Reservation delivery was recorded, but fulfilment status could not be updated."
          );
        }
      }
    }

    const updated = await transfers.findOne({
      _id: objectId,
    });

    const updatedReservation = changesStock
      ? await reservations.findOne({
          reservation_id: reservationId,
        })
      : null;

    return NextResponse.json({
      success: true,
      message: "Transfer updated successfully",
      transfer: updated,
      ...(updatedReservation && { reservation: updatedReservation }),
    });
  } catch (error) {
    console.error("Update transfer error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update transfer" },
      { status: 500 }
    );
  }
}
