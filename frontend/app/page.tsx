"use client";

import { useEffect, useState } from "react";
import TransfersPanel from "./components/TransfersPanel";
import InspectionsPanel from "./components/InspectionsPanel";
import NotificationsPanel from "./components/NotificationsPanel";
import InventoryPanel from "./components/InventoryPanel";
import ProjectsPanel from "./components/ProjectsPanel";
type InventoryItem = {
  _id: string;
  inventory_id: number;
  name: string;
  category: string;
  unit: string;
  total: number;
  available: number;
  reserved: number;
  condition: string;
};

type Reservation = {
  _id: string;
  reservation_id: number;
  inventory_id: number;
  material: string;
  project: string;
  supplier: string;
  quantity: number;
  unit: string;
  allocated_quantity?: number;
  delivered_quantity?: number;
  reserved_quantity?: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "FULFILLED";
  created_at: string;
  updated_at: string;
};

type Project = {
  _id: string;
  project_id: number;
  project_name: string;
  status: "planning" | "active" | "completed" | "cancelled";
  budget: number | null;
};

const navItems = [
  ["Overview", "◫"],
  ["Projects", "▦"],
  ["Inventory", "▤"],
  ["Reservations", "⇄"],
  ["Transfers", "↗"],
  ["Inspections", "✓"],
  ["Notifications", "♧"],
];

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [profileOpen, setProfileOpen] = useState(false);

  // Inventory state loaded from MongoDB
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");

  // Reservations state loaded from MongoDB
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [reservationsError, setReservationsError] = useState("");

  // Projects state loaded from MongoDB
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");

  const [notice, setNotice] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  // New reservation form state
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationInventoryId, setReservationInventoryId] = useState("");
  const [reservationProject, setReservationProject] = useState("");
  const [reservationSupplier, setReservationSupplier] = useState("");
  const [reservationQuantity, setReservationQuantity] = useState("");
  const [creatingReservation, setCreatingReservation] = useState(false);
  // Fetch inventory
  async function fetchInventory() {
    setInventoryLoading(true);
    setInventoryError("");

    try {
      const response = await fetch("/api/inventory");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load inventory");
      }

      setInventory(data.inventory);
    } catch (error) {
      console.error("Inventory fetch error:", error);
      setInventoryError("Unable to load inventory. Please try again.");
    } finally {
      setInventoryLoading(false);
    }
  }

  // Fetch reservations
  async function fetchReservations() {
    setReservationsLoading(true);
    setReservationsError("");

    try {
      const response = await fetch("/api/reservations");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch reservations");
      }

      setReservations(data.reservations);
    } catch (error) {
      console.error("Reservations fetch error:", error);
      setReservationsError(
        "Unable to load reservations. Please try again."
      );
    } finally {
      setReservationsLoading(false);
    }
  }

  // Fetch projects
  async function fetchProjects() {
    setProjectsLoading(true);
    setProjectsError("");

    try {
      const response = await fetch("/api/projects");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch projects");
      }

      setProjects(data.projects);
    } catch (error) {
      console.error("Projects fetch error:", error);
      setProjectsError("Unable to load projects. Please try again.");
    } finally {
      setProjectsLoading(false);
    }
  }

  // Load data when dashboard opens
  useEffect(() => {
    const loadDashboardData = async () => {
      await Promise.resolve();
      await Promise.all([
        fetchInventory(),
        fetchReservations(),
        fetchProjects(),
      ]);
    };

    void loadDashboardData();
  }, []);

  // Pending reservation count
  const pending = reservations.filter(
    (r) => r.status === "REQUESTED"
  ).length;

  // Project statistics
  const totalProjects = projects.length;

  const activeProjects = projects.filter(
    (project) => project.status === "active"
  ).length;

  const planningProjects = projects.filter(
    (project) => project.status === "planning"
  ).length;

  const completedProjects = projects.filter(
    (project) => project.status === "completed"
  ).length;

  // Approve or reject a reservation through the backend
  async function updateReservation(
    id: string,
    status: "APPROVED" | "REJECTED"
  ) {
    setProcessingId(id);
    setNotice("");

    try {
      const response = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update reservation");
      }

      setNotice(data.message || `Reservation ${status.toLowerCase()} successfully.`);

      // Refresh reservations and inventory after approval
      await Promise.all([
        fetchReservations(),
        status === "APPROVED"
          ? fetchInventory()
          : Promise.resolve(),
      ]);
    } catch (error) {
      console.error("Reservation update error:", error);

      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to update reservation."
      );
    } finally {
      setProcessingId(null);
    }
  }

  function approve(id: string) {
    return updateReservation(id, "APPROVED");
  }

  function reject(id: string) {
    return updateReservation(id, "REJECTED");
  }
  // Create a new material reservation
async function createReservation(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const inventoryId = Number(reservationInventoryId);
  const quantity = Number(reservationQuantity);

  if (!inventoryId || !reservationProject || !reservationSupplier.trim()) {
    setNotice("Please complete all reservation details.");
    return;
  }

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    setNotice("Please enter a valid positive whole-number quantity.");
    return;
  }

  const selectedInventory = inventory.find(
    (item) => item.inventory_id === inventoryId
  );

  if (!selectedInventory) {
    setNotice("Please select a valid inventory item.");
    return;
  }

  if (quantity > selectedInventory.available) {
    setNotice(
      `Only ${selectedInventory.available} ${selectedInventory.unit} are currently available.`
    );
    return;
  }

  setCreatingReservation(true);
  setNotice("");

  try {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inventory_id: inventoryId,
        project: reservationProject,
        supplier: reservationSupplier.trim(),
        quantity,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to create reservation.");
    }

    setNotice("Reservation request created successfully.");

    setReservationInventoryId("");
    setReservationProject("");
    setReservationSupplier("");
    setReservationQuantity("");
    setShowReservationForm(false);

    await fetchReservations();
    await fetchInventory();
  } catch (error) {
    console.error("Create reservation error:", error);

    setNotice(
      error instanceof Error
        ? error.message
        : "Unable to create reservation."
    );
  } finally {
    setCreatingReservation(false);
  }
}
  // Dashboard statistics
  const totalMaterials = inventory.length;

  const totalAvailable = inventory.reduce(
    (sum, item) => sum + item.available,
    0
  );

  const stats = [
    {
      label: "Total Materials",
      value: inventoryLoading ? "..." : String(totalMaterials),
      detail: "Across inventory records",
      icon: "▤",
    },
    {
      label: "Available Stock",
      value: inventoryLoading
        ? "..."
        : totalAvailable.toLocaleString("en-IN"),
      detail: "Across all materials",
      icon: "◈",
    },
    {
      label: "Pending Approvals",
      value: reservationsLoading ? "..." : String(pending),
      detail: "Awaiting supplier decision",
      icon: "◷",
    },
    {
      label: "Active Projects",
      value: projectsLoading
        ? "..."
        : projectsError
          ? "Error"
          : String(activeProjects),
      detail: projectsLoading
        ? "Loading projects..."
        : projectsError
          ? projectsError
          : `${totalProjects} total · ${planningProjects} planning · ${completedProjects} completed`,
      icon: "▦",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-800">
      {/* SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-62.5 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-19 items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            C
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight">Consera</h1>
            <p className="text-[10px] tracking-[2px] text-slate-400">
              MATERIAL MANAGEMENT
            </p>
          </div>
        </div>

        <div className="px-4 pt-7">
          <p className="mb-3 px-3 text-[10px] font-bold tracking-[1.8px] text-slate-400">
            WORKSPACE
          </p>

          <nav className="space-y-1">
            {navItems.map(([label, icon]) => (
              <button
                key={label}
                onClick={() => {
                  setActive(label);
                  setNotice("");
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                  active === label
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="w-6 text-center text-lg">{icon}</span>

                {label}

                {label === "Reservations" && pending > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    {pending}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              A
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Administrator</p>
              <p className="text-xs text-slate-400">Admin account</p>
            </div>

            <span className="ml-auto text-slate-400">⋯</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="lg:pl-62.5">
        {/* HEADER */}
        <header className="sticky top-0 z-10 flex h-19 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur-md sm:px-8">
          <div>
            <p className="text-xs text-slate-400">
              Workspace / {active}
            </p>

            <h2 className="text-lg font-bold">
              {active === "Overview" ? "Dashboard Overview" : active}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 sm:block">
              ● System Online
            </span>

            <button
              onClick={() => setActive("Notifications")}
              aria-label="Open notifications"
              className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 text-xl transition hover:bg-slate-50"
            >
              🔔
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-600" />
            </button>

            <div className="relative">
              <button
                onClick={() => setProfileOpen((prev) => !prev)}
                aria-label="Open user profile"
                aria-expanded={profileOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                A
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
                      A
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Administrator
                      </p>
                      <p className="text-xs text-slate-500">
                        Admin account
                      </p>
                    </div>
                  </div>

                  <div className="my-3 border-t border-slate-100" />

                  <button
                    onClick={() => setProfileOpen(false)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Close profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-375 space-y-7 p-5 sm:p-8">
          {/* DASHBOARD */}
          {active === "Overview" && (
            <>
              <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm text-slate-500">
                    Welcome back, Administrator
                  </p>

                  <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                    Your operations at a glance.
                  </h1>

                  <p className="mt-2 text-sm text-slate-500">
                    Monitor materials, supplier approvals and project transfers.
                  </p>
                </div>

                <button
                  onClick={() => setActive("Reservations")}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  View reservations →
                </button>
              </section>

              {/* STATISTICS */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-500">{s.label}</p>

                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">
                        {s.icon}
                      </span>
                    </div>

                    <p className="mt-4 text-3xl font-bold tracking-tight">
                      {s.value}
                    </p>

                    <p className="mt-2 text-xs text-slate-400">
                      {s.detail}
                    </p>
                  </div>
                ))}
              </section>

              {/* INVENTORY AND WORKFLOW */}
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">Material Inventory</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Stock available at GreenBuild Construction
                      </p>
                    </div>

                    <button
                      onClick={() => setActive("Inventory")}
                      className="text-sm font-semibold text-blue-600"
                    >
                      View all →
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-142.5 text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-slate-400">
                          <th className="pb-3 font-medium">Material</th>
                          <th className="pb-3 font-medium">Category</th>
                          <th className="pb-3 font-medium">Total stock</th>
                          <th className="pb-3 font-medium">Available</th>
                          <th className="pb-3 font-medium">Condition</th>
                        </tr>
                      </thead>

                      <tbody>
                        {inventoryLoading ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-slate-400">
                              Loading inventory...
                            </td>
                          </tr>
                        ) : inventoryError ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-red-600">
                              {inventoryError}
                            </td>
                          </tr>
                        ) : inventory.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-slate-400">
                              No inventory records found.
                            </td>
                          </tr>
                        ) : (
                          inventory.slice(0, 5).map((item) => (
                            <tr
                              key={item.inventory_id}
                              className="border-b border-slate-50 last:border-0"
                            >
                              <td className="py-4 font-semibold">{item.name}</td>
                              <td className="py-4 text-slate-500">{item.category}</td>
                              <td className="py-4">
                                {item.total} {item.unit}
                              </td>
                              <td className="py-4 font-semibold">
                                {item.available}
                              </td>
                              <td className="py-4">
                                <Condition value={item.condition} />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RESERVATION WORKFLOW */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-bold">Reservation workflow</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Supplier-controlled material movement
                  </p>

                  <div className="mt-6 space-y-5">
                    {[
                      ["01", "Buyer requests", "Material requirement submitted"],
                      ["02", "Supplier approves", "Supplier reviews the request"],
                      ["03", "Quantity reserved", "Available stock is updated"],
                      ["04", "Transfer initiated", "Material is dispatched"],
                    ].map(([n, title, desc], i) => (
                      <div key={n} className="flex gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            i === 0
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {n}
                        </div>

                        <div>
                          <p className="text-sm font-semibold">{title}</p>
                          <p className="mt-1 text-xs text-slate-400">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* RECENT RESERVATIONS */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Recent Reservations</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Track requests and supplier decisions
                    </p>
                  </div>

                  <button
                    onClick={() => setActive("Reservations")}
                    className="text-sm font-semibold text-blue-600"
                  >
                    View all →
                  </button>
                </div>

                {reservationsLoading ? (
                  <p className="py-4 text-center text-sm text-slate-400">
                    Loading reservations...
                  </p>
                ) : reservationsError ? (
                  <p className="py-4 text-center text-sm text-red-600">
                    {reservationsError}
                  </p>
                ) : (
                  <ReservationTable
                    reservations={reservations.slice(0, 3)}
                  />
                )}
              </section>
            </>
          )}

          {/* INVENTORY */}
          {active === "Inventory" && <InventoryPanel />}

          {/* RESERVATIONS */}
          {active === "Reservations" && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-xl font-bold">Material Reservations</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Review buyer requests and manage supplier decisions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-fit rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                    {reservationsLoading ? "..." : pending} awaiting approval
                  </span>

                  <button
                    onClick={() => {
                      setNotice("");
                      setShowReservationForm((previous) => !previous);
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {showReservationForm ? "Cancel" : "+ New Reservation"}
                  </button>
                </div>
              </div>

              {showReservationForm && (
                <form
                  onSubmit={createReservation}
                  className="mb-6 rounded-xl border border-blue-100 bg-slate-50 p-5"
                >
                  <h4 className="mb-4 font-bold text-slate-800">
                    Create Material Reservation
                  </h4>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Material
                      </label>
                      <select
                        required
                        value={reservationInventoryId}
                        onChange={(e) => setReservationInventoryId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">Select material</option>
                        {inventory.map((item) => (
                          <option
                            key={item.inventory_id}
                            value={item.inventory_id}
                            disabled={item.available <= 0}
                          >
                            {item.name} — {item.available} {item.unit} available
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Project
                      </label>
                      <select
                        required
                        value={reservationProject}
                        onChange={(e) => setReservationProject(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">Select project</option>
                        {projects
                          .filter(
                            (project) =>
                              project.status === "active" ||
                              project.status === "planning"
                          )
                          .map((project) => (
                            <option
                              key={project.project_id}
                              value={project.project_name}
                            >
                              {project.project_name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Supplier
                      </label>
                      <input
                        required
                        type="text"
                        value={reservationSupplier}
                        onChange={(e) => setReservationSupplier(e.target.value)}
                        placeholder="Enter supplier name"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Quantity
                      </label>
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={reservationQuantity}
                        onChange={(e) => setReservationQuantity(e.target.value)}
                        placeholder="Enter required quantity"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={creatingReservation || inventoryLoading || projectsLoading}
                      className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingReservation ? "Submitting..." : "Submit Reservation"}
                    </button>
                  </div>
                </form>
              )}

              {/* SUCCESS / ERROR MESSAGE */}
              {notice && (
                <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                  {notice}
                </div>
              )}

              {reservationsLoading ? (
                <p className="py-8 text-center text-slate-400">
                  Loading reservations...
                </p>
              ) : reservationsError ? (
                <div className="py-8 text-center">
                  <p className="text-red-600">{reservationsError}</p>

                  <button
                    onClick={fetchReservations}
                    className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </div>
              ) : reservations.length === 0 ? (
                <p className="py-8 text-center text-slate-400">
                  No reservations found.
                </p>
              ) : (
                <div className="space-y-4">
                  {reservations.map((r) => (
                    <div
                      key={r._id}
                      className="rounded-xl border border-slate-200 p-4 sm:p-5"
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-bold">
                            {r.material}{" "}
                            <span className="font-normal text-slate-400">
                              · {r.quantity} {r.unit}
                            </span>
                          </p>

                          <p className="mt-2 text-sm text-slate-500">
                            {r.project}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Supplier: {r.supplier} · Reservation #
                            {r.reservation_id}
                          </p>

                          {(r.status === "APPROVED" || r.status === "FULFILLED") && (
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                              {typeof r.allocated_quantity === "number" &&
                              typeof r.delivered_quantity === "number" &&
                              typeof r.reserved_quantity === "number" ? (
                                <>
                                  <span>
                                    Allocated: <strong>{r.allocated_quantity} {r.unit}</strong>
                                  </span>
                                  <span>
                                    Delivered: <strong>{r.delivered_quantity} {r.unit}</strong>
                                  </span>
                                  <span>
                                    Reserved: <strong>{r.reserved_quantity} {r.unit}</strong>
                                  </span>
                                  <span>
                                    Remaining:{" "}
                                    <strong>{Math.max(0, r.quantity - r.delivered_quantity)} {r.unit}</strong>
                                  </span>
                                </>
                              ) : (
                                <span className="text-amber-600">
                                  Historical record — lifecycle quantities unavailable
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <Status value={r.status} />

                          {r.status === "REQUESTED" && (
                            <>
                              <button
                                onClick={() => approve(r._id)}
                                disabled={processingId !== null}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {processingId === r._id
                                  ? "Processing..."
                                  : "Approve"}
                              </button>

                              <button
                                onClick={() => reject(r._id)}
                                disabled={processingId !== null}
                                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {processingId === r._id
                                  ? "Processing..."
                                  : "Reject"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* PROJECTS */}
          {active === "Projects" && <ProjectsPanel />}

          {/* TRANSFERS */}
          {active === "Transfers" && <TransfersPanel />}

          {/* INSPECTIONS */}
          {active === "Inspections" && <InspectionsPanel />}

          {/* NOTIFICATIONS */}
          {active === "Notifications" && <NotificationsPanel />}
        </div>
      </main>
    </div>
  );
}

// INVENTORY CONDITION BADGE
function Condition({ value }: { value: string }) {
  const styles: Record<string, string> = {
    GOOD: "bg-emerald-50 text-emerald-700",
    EXCELLENT: "bg-blue-50 text-blue-700",
    FAIR: "bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        styles[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {value}
    </span>
  );
}

// RESERVATION STATUS BADGE
function Status({ value }: { value: string }) {
  const styles: Record<string, string> = {
    REQUESTED: "bg-amber-50 text-amber-700",
    APPROVED: "bg-blue-50 text-blue-700",
    REJECTED: "bg-red-50 text-red-700",
    FULFILLED: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        styles[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {value}
    </span>
  );
}

// RECENT RESERVATIONS TABLE
function ReservationTable({
  reservations,
}: {
  reservations: Reservation[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-137.5 text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-400">
            <th className="pb-3 font-medium">Material</th>
            <th className="pb-3 font-medium">Project</th>
            <th className="pb-3 font-medium">Quantity</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>

        <tbody>
          {reservations.map((r) => (
            <tr
              key={r._id}
              className="border-b border-slate-50 last:border-0"
            >
              <td className="py-4 font-semibold">{r.material}</td>
              <td className="py-4 text-slate-500">{r.project}</td>
              <td className="py-4">
                {r.quantity} {r.unit}
              </td>
              <td className="py-4">
                <Status value={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
