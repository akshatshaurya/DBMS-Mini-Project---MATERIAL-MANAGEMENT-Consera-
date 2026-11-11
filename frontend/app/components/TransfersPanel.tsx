
"use client";

import { useCallback, useEffect, useState } from "react";

type Transfer = {
  _id: string;
  transfer_id: number;
  reservation_id: number;
  inventory_id: number;
  quantity: number;
  source: string;
  destination: string;
  status: string;
  performed_by: number;
  created_at: string;
  updated_at: string;
};

type TransferEvent = {
  event_type: string;
  performed_by: number;
  description?: string;
  timestamp: string;
};

type Reservation = {
  reservation_id: number;
  inventory_id: number;
  material: string;
  project: string;
  supplier: string;
  quantity: number;
  unit: string;
  status: string;
};

const allowedTransitions: Record<string, string[]> = {
  PENDING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  IN_TRANSIT: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export default function TransfersPanel() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [events, setEvents] = useState<TransferEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [reservationId, setReservationId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");

  const loadTransfers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/transfers", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load transfers");
      }

      setTransfers(data.transfers);

      setSelected((current) => {
        if (!current) return data.transfers[0] || null;
        return (
          data.transfers.find(
            (item: Transfer) => item._id === current._id
          ) || data.transfers[0] || null
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApprovedReservations = useCallback(async () => {
    try {
      const response = await fetch("/api/reservations", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load reservations");
      }

      setReservations(
        data.reservations.filter(
          (reservation: Reservation) =>
            reservation.status === "APPROVED"
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load approved reservations"
      );
    }
  }, []);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/transfers/${id}/events`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load event history");
      }

      setEvents(data.events);
    } catch (err) {
      setEvents([]);
      setError(err instanceof Error ? err.message : "Failed to load events");
    }
  }, []);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    loadApprovedReservations();
  }, [loadApprovedReservations]);

  useEffect(() => {
    if (selected?._id) {
      loadEvents(selected._id);
    } else {
      setEvents([]);
    }
  }, [selected?._id, loadEvents]);

  async function updateStatus(status: string) {
  if (!selected || status === selected.status) return;

  const permittedStatuses = allowedTransitions[selected.status] || [];

  if (!permittedStatuses.includes(status)) {
    setError(
      `Invalid status transition: ${selected.status} → ${status}`
    );
    return;
  }

  try {
    setUpdating(true);
    setError("");
    setMessage("");

    const response = await fetch(`/api/transfers/${selected._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        performed_by: 4,
        description: `Transfer status updated to ${status}`,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Unable to update transfer");
    }

    setMessage(data.message);
    await loadTransfers();
    await loadEvents(selected._id);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Update failed");
    await loadTransfers();
  } finally {
    setUpdating(false);
  }
}

  async function createTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const selectedReservation = reservations.find(
      (reservation) =>
        reservation.reservation_id === Number(reservationId)
    );

    if (!selectedReservation) {
      setError("Please select a valid approved reservation.");
      return;
    }

    const quantity = Number(transferQuantity);

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      setError("Enter a valid positive whole-number quantity.");
      return;
    }

    const alreadyAssigned = transfers
      .filter(
        (transfer) =>
          transfer.reservation_id === selectedReservation.reservation_id &&
          transfer.status !== "CANCELLED"
      )
      .reduce((sum, transfer) => sum + transfer.quantity, 0);

    const remaining =
      selectedReservation.quantity - alreadyAssigned;

    if (quantity > remaining) {
      setError(`Only ${Math.max(0, remaining)} ${selectedReservation.unit} remain for this reservation.`);
      return;
    }

    if (!source.trim() || !destination.trim()) {
      setError("Source and destination are required.");
      return;
    }

    try {
      setCreating(true);
      setError("");
      setMessage("");

      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservation_id: selectedReservation.reservation_id,
          inventory_id: selectedReservation.inventory_id,
          quantity,
          source: source.trim(),
          destination: destination.trim(),
          performed_by: 4,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to create transfer");
      }

      setMessage(data.message);

      setReservationId("");
      setTransferQuantity("");
      setSource("");
      setDestination("");
      setShowCreateForm(false);

      await loadTransfers();
      await loadApprovedReservations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create transfer"
      );
    } finally {
      setCreating(false);
    }
  }

  const counts = {
    total: transfers.length,
    pending: transfers.filter((t) => t.status === "PENDING").length,
    transit: transfers.filter((t) => t.status === "IN_TRANSIT").length,
    delivered: transfers.filter((t) => t.status === "DELIVERED").length,
  };

  if (loading) {
    return <div className="rounded-xl border bg-white p-8 text-slate-500">Loading transfers...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold">Material Transfers</h3>
          <p className="mt-1 text-sm text-slate-500">
            Monitor material movement and track transfer progress.
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreateForm((current) => !current);
            setError("");
            setMessage("");
          }}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {showCreateForm ? "Cancel" : "+ Create Transfer"}
        </button>
      </section>

      {showCreateForm && (
        <form
          onSubmit={createTransfer}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h4 className="font-bold">Create Material Transfer</h4>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Approved Reservation
            </label>

            <select
              required
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm"
            >
              <option value="">Select reservation</option>

              {reservations.map((reservation) => (
                <option
                  key={reservation.reservation_id}
                  value={reservation.reservation_id}
                >
                  #{reservation.reservation_id} — {reservation.material} —{" "}
                  {reservation.project} ({reservation.quantity} {reservation.unit})
                </option>
              ))}
            </select>

            {reservations.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                No approved reservations available.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Transfer Quantity
            </label>

            <input
              type="number"
              min="1"
              step="1"
              required
              value={transferQuantity}
              onChange={(e) => setTransferQuantity(e.target.value)}
              placeholder="Enter quantity"
              className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Source
              </label>

              <input
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Supplier / source location"
                className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Destination
              </label>

              <input
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Project / destination location"
                className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || reservations.length === 0}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Transfer"}
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          ["Total Transfers", counts.total],
          ["Pending", counts.pending],
          ["In Transit", counts.transit],
          ["Delivered", counts.delivered],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      {transfers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <h4 className="font-bold">No transfers found</h4>
          <p className="mt-2 text-sm text-slate-500">
            Transfers created through the system will appear here.
          </p>
          <button onClick={loadTransfers} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            ⟳
          </button>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="space-y-3 xl:col-span-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold">All Transfers</h4>
              <button onClick={loadTransfers} className="text-sm font-semibold text-blue-600">
                ⟳
              </button>
            </div>

            {transfers.map((transfer) => (
              <button
                key={transfer._id}
                onClick={() => {
                  setSelected(transfer);
                  setMessage("");
                  setError("");
                }}
                className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-blue-300 ${
                  selected?._id === transfer._id
                    ? "border-blue-500 ring-1 ring-blue-200"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">Transfer #{transfer.transfer_id}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Reservation #{transfer.reservation_id}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[transfer.status] || "bg-slate-100 text-slate-600"}`}>
                    {transfer.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Source</p>
                    <p className="mt-1 font-medium">{transfer.source}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Destination</p>
                    <p className="mt-1 font-medium">{transfer.destination}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-500">
                  Quantity: <strong className="text-slate-800">{transfer.quantity}</strong>
                  {" · "}Inventory #{transfer.inventory_id}
                </p>
              </button>
            ))}
          </div>

          <div className="space-y-5 xl:col-span-2">
            {selected && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="font-bold">Transfer Details</h4>

                  <div className="mt-4 space-y-3 text-sm">
                    <Detail label="Transfer ID" value={`#${selected.transfer_id}`} />
                    <Detail label="Source" value={selected.source} />
                    <Detail label="Destination" value={selected.destination} />
                    <Detail label="Quantity" value={String(selected.quantity)} />
                    <Detail label="Inventory ID" value={String(selected.inventory_id)} />
                    <Detail label="Created" value={new Date(selected.created_at).toLocaleString()} />
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <label className="mb-2 block text-sm font-semibold">
                      Update transfer status
                    </label>
                    {(allowedTransitions[selected.status] || []).length > 0 ? (
                      <>
                        <select
                          value=""
                          disabled={updating}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateStatus(e.target.value);
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                        >
                          <option value="">
                            Select next status
                          </option>

                          {allowedTransitions[selected.status].map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <p className="mt-2 text-xs text-slate-400">
                          Only valid next statuses are available.
                        </p>
                      </>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-sm font-semibold text-slate-700">
                          {selected.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          This transfer has reached a final status and cannot be changed.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="font-bold">Transfer History</h4>
                  <p className="mt-1 text-xs text-slate-400">Chronological event timeline</p>

                  <div className="mt-5 space-y-5">
                    {events.length === 0 ? (
                      <p className="text-sm text-slate-400">No events available.</p>
                    ) : (
                      events.map((event, index) => (
                        <div key={`${event.timestamp}-${index}`} className="flex gap-3">
                          <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-500 ring-4 ring-blue-50" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{event.event_type}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {event.description || "Transfer event recorded"}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {new Date(event.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 pb-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
