
import { NextRequest, NextResponse } from "next/server";
import { Int32 } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

const MAX_INT32 = 2_147_483_647;

export async function GET() {
  try {
    const db = await getDatabase();

    const transfers = await db
      .collection("transfers")
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      count: transfers.length,
      transfers,
    });
  } catch (error) {
    console.error("Fetch transfers error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch transfers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let reservationAllocationUpdated = false;
  let inventoryAllocationUpdated = false;

  let reservationId: number | null = null;
  let inventoryId: number | null = null;
  let transferQuantity: number | null = null;

  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const {
      reservation_id,
      inventory_id,
      quantity,
      source,
      destination,
      performed_by,
    } = body as Record<string, unknown>;

    if (
      !Number.isSafeInteger(reservation_id) ||
      (reservation_id as number) <= 0 ||
      (reservation_id as number) > MAX_INT32 ||
      !Number.isSafeInteger(inventory_id) ||
      (inventory_id as number) <= 0 ||
      (inventory_id as number) > MAX_INT32 ||
      !Number.isSafeInteger(quantity) ||
      (quantity as number) <= 0 ||
      (quantity as number) > MAX_INT32 ||
      typeof source !== "string" ||
      !source.trim() ||
      typeof destination !== "string" ||
      !destination.trim() ||
      !Number.isSafeInteger(performed_by) ||
      (performed_by as number) <= 0 ||
      (performed_by as number) > MAX_INT32
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid transfer details" },
        { status: 400 }
      );
    }

    reservationId = reservation_id as number;
    inventoryId = inventory_id as number;
    transferQuantity = quantity as number;
    const performedBy = performed_by as number;

    const db = await getDatabase();

    const transfers = db.collection("transfers");
    const events = db.collection("transfer_events");
    const reservations = db.collection("reservations");
    const inventory = db.collection("inventory");

    const inventoryAllocations = db.collection<{
      _id: number;
      inventory_id: number;
      committed_quantity: number;
    }>("transfer_inventory_allocations");

    // 1. Verify the reservation.
    const reservation = await reservations.findOne({
      reservation_id: reservationId,
    });

    if (!reservation) {
      return NextResponse.json(
        { success: false, message: "Reservation not found" },
        { status: 404 }
      );
    }

    if (reservation.status !== "APPROVED") {
      return NextResponse.json(
        {
          success: false,
          message: "Only approved reservations can create transfers",
        },
        { status: 409 }
      );
    }

    // 2. Require valid reservation lifecycle fields.
    const validReservation =
      Number.isSafeInteger(reservation.quantity) &&
      reservation.quantity > 0 &&
      Number.isSafeInteger(reservation.allocated_quantity) &&
      reservation.allocated_quantity >= 0 &&
      Number.isSafeInteger(reservation.delivered_quantity) &&
      reservation.delivered_quantity >= 0 &&
      Number.isSafeInteger(reservation.reserved_quantity) &&
      reservation.reserved_quantity >= 0 &&
      reservation.allocated_quantity <= reservation.quantity &&
      reservation.delivered_quantity <= reservation.allocated_quantity &&
      reservation.delivered_quantity + reservation.reserved_quantity <=
        reservation.quantity;

    if (!validReservation) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Reservation lifecycle fields are missing or inconsistent. Reconcile this reservation before creating transfers.",
        },
        { status: 409 }
      );
    }

    if (reservation.inventory_id !== inventoryId) {
      return NextResponse.json(
        {
          success: false,
          message: "Inventory item does not match the reservation",
        },
        { status: 400 }
      );
    }

    // A transfer must be covered by stock still reserved for this reservation.
    if (reservation.reserved_quantity < transferQuantity) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Transfer quantity exceeds the reservation's currently reserved quantity",
          reserved_quantity: reservation.reserved_quantity,
          requested_quantity: transferQuantity,
        },
        { status: 409 }
      );
    }

    // 3. Verify inventory stock.
    const inventoryItem = await inventory.findOne({
      inventory_id: inventoryId,
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { success: false, message: "Inventory item not found" },
        { status: 404 }
      );
    }

    if (
      !Number.isSafeInteger(inventoryItem.reserved) ||
      inventoryItem.reserved < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Inventory has an invalid reserved stock balance",
        },
        { status: 409 }
      );
    }

    // 4. Verify the active inventory commitment record.
    const allocationRecord = await inventoryAllocations.findOne({
      _id: inventoryId,
    });

    if (
      !allocationRecord ||
      !Number.isSafeInteger(allocationRecord.committed_quantity) ||
      allocationRecord.committed_quantity < 0 ||
      allocationRecord.committed_quantity > inventoryItem.reserved
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Inventory commitment allocation is missing or inconsistent. Reconcile it before creating transfers.",
        },
        { status: 409 }
      );
    }

    // 5. Atomically allocate quantity to the reservation.
    const reservationResult = await reservations.updateOne(
      {
        reservation_id: reservationId,
        status: "APPROVED",
        allocated_quantity: { $gte: 0 },
        reserved_quantity: { $gte: transferQuantity },
        $expr: {
          $and: [
            {
              $lte: [
                { $add: ["$allocated_quantity", transferQuantity] },
                "$quantity",
              ],
            },
            {
              $gte: [
                "$allocated_quantity",
                "$delivered_quantity",
              ],
            },
          ],
        },
      },
      {
        $inc: {
          allocated_quantity: new Int32(transferQuantity),
        },
      }
    );

    if (reservationResult.modifiedCount !== 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Transfer quantity exceeds the remaining reservation quantity, or the reservation changed. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    reservationAllocationUpdated = true;

    // 6. Atomically allocate active inventory commitment.
    const inventoryResult = await inventoryAllocations.updateOne(
      {
        _id: inventoryId,
        committed_quantity: { $gte: 0 },
        $expr: {
          $lte: [
            { $add: ["$committed_quantity", transferQuantity] },
            inventoryItem.reserved,
          ],
        },
      },
      {
        $inc: {
          committed_quantity: new Int32(transferQuantity),
        },
      }
    );

    if (inventoryResult.modifiedCount !== 1) {
      const reservationRollback = await reservations.updateOne(
        {
          reservation_id: reservationId,
          allocated_quantity: { $gte: transferQuantity },
        },
        {
          $inc: {
            allocated_quantity: new Int32(-transferQuantity),
          },
        }
      );

      if (reservationRollback.modifiedCount !== 1) {
        throw new Error(
          "Inventory commitment failed and reservation allocation rollback requires manual review"
        );
      }

      reservationAllocationUpdated = false;

      return NextResponse.json(
        {
          success: false,
          message:
            "Insufficient reserved inventory or missing inventory allocation record. Resolve existing stock commitments first.",
          reserved_stock: inventoryItem.reserved,
          requested_quantity: transferQuantity,
        },
        { status: 409 }
      );
    }

    inventoryAllocationUpdated = true;

    // 7. Generate the next transfer ID.
    const counters = db.collection<{
      _id: string;
      sequence_value: number;
    }>("counters");

    const counterResult = await counters.findOneAndUpdate(
      { _id: "transfer_id" },
      { $inc: { sequence_value: 1 } },
      { returnDocument: "after" }
    );

    const nextId = counterResult?.sequence_value;

    if (
      typeof nextId !== "number" ||
      !Number.isSafeInteger(nextId) ||
      nextId <= 0 ||
      nextId > MAX_INT32
    ) {
      throw new Error("Transfer ID limit reached or counter is invalid");
    }

    // 8. Create the transfer and creation event.
    const now = new Date();

    const transfer = {
      transfer_id: new Int32(nextId),
      reservation_id: new Int32(reservationId),
      inventory_id: new Int32(inventoryId),
      quantity: new Int32(transferQuantity),
      source: source.trim(),
      destination: destination.trim(),
      status: "PENDING",
      performed_by: new Int32(performedBy),
      created_at: now,
      updated_at: now,
    };

    let insertedTransferId;

    try {
      const result = await transfers.insertOne(transfer);
      insertedTransferId = result.insertedId;

      await events.insertOne({
        transfer_id: new Int32(nextId),
        event_type: "CREATED",
        performed_by: new Int32(performedBy),
        description: "Transfer created",
        timestamp: now,
      });
    } catch (creationError) {
      if (insertedTransferId) {
        const deletion = await transfers.deleteOne({
          _id: insertedTransferId,
        });

        if (deletion.deletedCount !== 1) {
          // Keep both allocations because the transfer may still exist.
          reservationAllocationUpdated = false;
          inventoryAllocationUpdated = false;

          console.error(
            "Transfer creation rollback failed. Allocations retained for manual review.",
            creationError
          );

          throw new Error(
            "Transfer creation failed and rollback requires manual review"
          );
        }

        await events.deleteOne({
          transfer_id: new Int32(nextId),
          event_type: "CREATED",
        });
      }

      throw creationError;
    }

    // All operations succeeded. Do not execute rollback.
    reservationAllocationUpdated = false;
    inventoryAllocationUpdated = false;

    return NextResponse.json(
      {
        success: true,
        message: "Transfer created successfully",
        transfer: {
          ...transfer,
          _id: insertedTransferId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create transfer error:", error);

    // Best-effort rollback of allocations if creation failed.
    try {
      const db = await getDatabase();

      if (
        inventoryAllocationUpdated &&
        inventoryId !== null &&
        transferQuantity !== null
      ) {
        await db.collection<{
            _id: number;
            inventory_id: number;
            committed_quantity: number;
          }>("transfer_inventory_allocations").updateOne(
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
      }

      if (
        reservationAllocationUpdated &&
        reservationId !== null &&
        transferQuantity !== null
      ) {
        await db.collection<{
          reservation_id: number;
          allocated_quantity: number;
        }>("reservations").updateOne(
          {
            reservation_id: reservationId,
            allocated_quantity: { $gte: transferQuantity },
          },
          {
            $inc: {
              allocated_quantity: new Int32(-transferQuantity),
            },
          }
        );
      }
    } catch (rollbackError) {
      console.error("Transfer creation rollback error:", rollbackError);
    }

    return NextResponse.json(
      { success: false, message: "Failed to create transfer" },
      { status: 500 }
    );
  }
}
