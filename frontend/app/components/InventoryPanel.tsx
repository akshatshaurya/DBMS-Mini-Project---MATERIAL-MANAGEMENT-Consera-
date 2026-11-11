
"use client";

import { useEffect, useMemo, useState } from "react";

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

type InventoryForm = {
  name: string;
  category: string;
  unit: string;
  total: string;
  available: string;
  reserved: string;
  condition: string;
};

const emptyForm: InventoryForm = {
  name: "",
  category: "",
  unit: "",
  total: "",
  available: "",
  reserved: "0",
  condition: "GOOD",
};

const CONDITIONS = [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "UNUSABLE",
];

const inputClass =
  "form-input";

export default function InventoryPanel() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InventoryForm>(emptyForm);

  async function fetchInventory() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/inventory");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not fetch inventory");
      }

      setInventory(data.inventory);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to load inventory"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInventory();
  }, []);

  const categories = useMemo(
    () => ["ALL", ...Array.from(new Set(inventory.map((item) => item.category)))],
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === "ALL" || item.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [inventory, search, categoryFilter]);

  const totalStock = inventory.reduce((sum, item) => sum + item.total, 0);
  const availableStock = inventory.reduce(
    (sum, item) => sum + item.available,
    0
  );
  const reservedStock = inventory.reduce(
    (sum, item) => sum + item.reserved,
    0
  );

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function openEditForm(item: InventoryItem) {
    setEditingId(item._id);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      total: String(item.total),
      available: String(item.available),
      reserved: String(item.reserved),
      condition: item.condition,
    });
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateField(field: keyof InventoryForm, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");

    const total = Number(form.total);
    const available = Number(form.available);
    const reserved = Number(form.reserved);

    if (
      !form.name.trim() ||
      !form.category.trim() ||
      !form.unit.trim()
    ) {
      setError("Please complete all material details.");
      return;
    }

    if (
      !Number.isSafeInteger(total) ||
      !Number.isSafeInteger(available) ||
      !Number.isSafeInteger(reserved) ||
      total < 0 ||
      available < 0 ||
      reserved < 0
    ) {
      setError("Quantities must be non-negative whole numbers.");
      return;
    }

    if (available + reserved !== total) {
      setError(
        "Available quantity plus reserved quantity must equal total stock."
      );
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit.trim(),
      total,
      available,
      reserved,
      condition: form.condition,
    };

    setSaving(true);

    try {
      const response = await fetch(
        editingId
          ? `/api/inventory/${editingId}`
          : "/api/inventory",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save inventory item");
      }

      closeForm();
      setNotice(
        editingId
          ? "Material updated successfully."
          : "New material added successfully."
      );

      await fetchInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: InventoryItem) {
    const confirmed = window.confirm(
      `Delete ${item.name} from inventory? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/inventory/${item._id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete material");
      }

      setNotice(`${item.name} deleted successfully.`);
      await fetchInventory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete material"
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: "Material Types",
            value: inventory.length,
            detail: "Registered materials",
          },
          {
            label: "Total Stock",
            value: totalStock.toLocaleString("en-IN"),
            detail: "All material quantities",
          },
          {
            label: "Available Stock",
            value: availableStock.toLocaleString("en-IN"),
            detail: `${reservedStock.toLocaleString("en-IN")} reserved`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-bold">{card.value}</p>
            <p className="mt-2 text-xs text-slate-400">{card.detail}</p>
          </div>
        ))}
      </section>

      {/* Main inventory section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-xl font-bold">Material Inventory</h3>
            <p className="mt-1 text-sm text-slate-400">
              Manage materials, quantities and stock conditions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={fetchInventory}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "⟳"}
            </button>

            <button
              onClick={openAddForm}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Add Material
            </button>
          </div>
        </div>

        {/* Search and category filter */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClass}
            placeholder="Search materials or categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className={`${inputClass} sm:max-w-52`}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "ALL" ? "All Categories" : category}
              </option>
            ))}
          </select>
        </div>

        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        {error && !showForm && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-225 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="pb-4 font-medium">Material</th>
                <th className="pb-4 font-medium">Category</th>
                <th className="pb-4 font-medium">Total</th>
                <th className="pb-4 font-medium">Available</th>
                <th className="pb-4 font-medium">Reserved</th>
                <th className="pb-4 font-medium">Condition</th>
                <th className="pb-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Loading inventory...
                  </td>
                </tr>
              ) : error && inventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-red-500">
                    Unable to load inventory.
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No matching materials found.
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr
                    key={item.inventory_id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="py-4">
                      <p className="font-semibold">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        ID: {item.inventory_id}
                      </p>
                    </td>

                    <td className="text-slate-500">{item.category}</td>
                    <td>{item.total} {item.unit}</td>
                    <td className="font-semibold">{item.available}</td>
                    <td>{item.reserved}</td>

                    <td>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.condition === "EXCELLENT"
                            ? "bg-blue-50 text-blue-700"
                            : item.condition === "GOOD"
                              ? "bg-emerald-50 text-emerald-700"
                              : item.condition === "FAIR"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                        }`}
                      >
                        {item.condition}
                      </span>
                    </td>

                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditForm(item)}
                          className="rounded-lg border border-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteItem(item)}
                          className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 text-xs text-slate-400">
          Showing {filteredInventory.length} of {inventory.length} materials
        </div>
      </section>

      {/* Add / Edit form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  {editingId ? "Edit Material" : "Add New Material"}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Enter material details and stock quantities.
                </p>
              </div>

              <button
                onClick={closeForm}
                className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-100"
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Material Name
                  <input
                    required
                    className={inputClass}
                    placeholder="e.g. OPC Cement"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Category
                  <input
                    required
                    className={inputClass}
                    placeholder="e.g. Cement"
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Unit
                  <input
                    required
                    className={inputClass}
                    placeholder="e.g. Bags"
                    value={form.unit}
                    onChange={(e) => updateField("unit", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Condition
                  <select
                    className={inputClass}
                    value={form.condition}
                    onChange={(e) => updateField("condition", e.target.value)}
                  >
                    {CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Total Stock
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.total}
                    onChange={(e) => updateField("total", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Available Stock
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.available}
                    onChange={(e) => updateField("available", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium sm:col-span-2">
                  Reserved Stock
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={form.reserved}
                    onChange={(e) => updateField("reserved", e.target.value)}
                  />
                </label>
              </div>

              <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                Available stock + Reserved stock must equal Total stock.
              </p>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save Changes"
                      : "Add Material"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
