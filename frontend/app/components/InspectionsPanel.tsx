
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Inspection = {
  _id: string;
  inventory_id: number;
  inspector_id: number;
  condition: string;
  defects: string[];
  notes: string;
  photographs: string[];
  inspection_date: string;
};

const conditions = ["EXCELLENT", "GOOD", "FAIR", "POOR", "UNUSABLE"];

const conditionStyles: Record<string, string> = {
  EXCELLENT: "bg-blue-50 text-blue-700",
  GOOD: "bg-emerald-50 text-emerald-700",
  FAIR: "bg-amber-50 text-amber-700",
  POOR: "bg-orange-50 text-orange-700",
  UNUSABLE: "bg-red-50 text-red-700",
};

const emptyForm = {
  inventory_id: "1",
  inspector_id: "5",
  condition: "GOOD",
  defects: "",
  notes: "",
  photographs: "",
  inspection_date: new Date().toISOString().slice(0, 16),
};

export default function InspectionsPanel() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [photographs, setPhotographs] = useState<string[]>([]);
  const [draggingImages, setDraggingImages] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const loadInspections = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const query = filter
        ? `?inventory_id=${encodeURIComponent(filter)}`
        : "";

      const response = await fetch(`/api/inspections${query}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load inspections");
      }

      setInspections(data.inspections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspections");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadInspections();
  }, [loadInspections]);

  useEffect(() => {
    if (previewImages.length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewImages([]);
      } else if (event.key === "ArrowRight") {
        setPreviewIndex((current) => (current + 1) % previewImages.length);
      } else if (event.key === "ArrowLeft") {
        setPreviewIndex((current) =>
          (current - 1 + previewImages.length) % previewImages.length
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImages]);

  function openImagePreview(images: string[], index: number) {
    const validImages = images.filter((image) => image.startsWith("data:image/"));
    if (validImages.length === 0) return;
    setPreviewImages(validImages);
    setPreviewIndex(Math.min(index, validImages.length - 1));
  }

  function openCreateForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      inspection_date: new Date().toISOString().slice(0, 16),
    });
    setPhotographs([]);
    setShowForm(true);
    setMessage("");
    setError("");
  }

  function openEditForm(item: Inspection) {
    setEditingId(item._id);
    setForm({
      inventory_id: String(item.inventory_id),
      inspector_id: String(item.inspector_id),
      condition: item.condition,
      defects: item.defects.join(", "),
      notes: item.notes || "",
      photographs: "",
      inspection_date: new Date(item.inspection_date)
        .toISOString()
        .slice(0, 16),
    });
    setPhotographs(item.photographs || []);
    setShowForm(true);
    setMessage("");
    setError("");
  }

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
  }

  async function handleImageFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const remainingSlots = 5 - photographs.length;

    if (remainingSlots <= 0) {
      setError("You can attach a maximum of 5 images per inspection.");
      return;
    }

    const accepted = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setError("Only 5 images can be attached. Extra files were ignored.");
    } else {
      setError("");
    }

    for (const file of accepted) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError(`${file.name} was skipped. Choose a JPG, PNG, or WEBP image.`);
        continue;
      }

      if (file.size > 1 * 1024 * 1024) {
        setError(`${file.name} was skipped because it exceeds 1 MB.`);
        continue;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Unable to read image."));
          };
          reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
          reader.readAsDataURL(file);
        });

        setPhotographs((current) =>
          current.length < 5 ? [...current, dataUrl] : current
        );
      } catch {
        setError(`Unable to read ${file.name}. Please try another image.`);
      }
    }
  }

  function removePhotograph(index: number) {
    setPhotographs((current) => current.filter((_, i) => i !== index));
  }

  async function saveInspection(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const body = {
        inventory_id: Number(form.inventory_id),
        inspector_id: Number(form.inspector_id),
        condition: form.condition,
        defects: form.defects
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        notes: form.notes,
        photographs,
        inspection_date: new Date(form.inspection_date).toISOString(),
      };

      const response = await fetch(
        editingId
          ? `/api/inspections/${editingId}`
          : "/api/inspections",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save inspection");
      }

      setMessage(
        editingId
          ? "Inspection updated successfully."
          : "Inspection created successfully."
      );
      setShowForm(false);
      setEditingId(null);
      setPhotographs([]);
      await loadInspections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save inspection");
    } finally {
      setSaving(false);
    }
  }

  async function deleteInspection(id: string) {
    if (!window.confirm("Are you sure you want to delete this inspection?")) {
      return;
    }

    try {
      setError("");
      setMessage("");

      const response = await fetch(`/api/inspections/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete inspection");
      }

      setMessage("Inspection deleted successfully.");
      await loadInspections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete inspection");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-xl font-bold">Material Inspections</h3>
          <p className="mt-1 text-sm text-slate-500">
            Record and manage material quality inspections.
          </p>
        </div>

        <button
          onClick={openCreateForm}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + New Inspection
        </button>
      </section>

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

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <Summary label="Total Inspections" value={inspections.length} />
        <Summary
          label="Excellent / Good"
          value={inspections.filter((i) =>
            ["EXCELLENT", "GOOD"].includes(i.condition)
          ).length}
        />
        <Summary
          label="Needs Attention"
          value={inspections.filter((i) =>
            ["POOR", "UNUSABLE"].includes(i.condition)
          ).length}
        />
      </section>

      {showForm && (
        <form
          onSubmit={saveInspection}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-bold">
                {editingId ? "Edit Inspection" : "Create Inspection"}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Enter the inspection record details.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Inventory ID">
              <input
                type="number"
                min="1"
                required
                value={form.inventory_id}
                onChange={(e) => updateField("inventory_id", e.target.value)}
                className="form-input"
              />
            </Field>

            <Field label="Inspector ID">
              <input
                type="number"
                min="1"
                required
                value={form.inspector_id}
                onChange={(e) => updateField("inspector_id", e.target.value)}
                className="form-input"
              />
            </Field>

            <Field label="Condition">
              <select
                value={form.condition}
                onChange={(e) => updateField("condition", e.target.value)}
                className="form-input"
              >
                {conditions.map((condition) => (
                  <option key={condition}>{condition}</option>
                ))}
              </select>
            </Field>

            <Field label="Inspection Date">
              <input
                type="datetime-local"
                required
                value={form.inspection_date}
                onChange={(e) => updateField("inspection_date", e.target.value)}
                className="form-input"
              />
            </Field>

            <Field label="Defects (comma separated)">
              <input
                value={form.defects}
                onChange={(e) => updateField("defects", e.target.value)}
                placeholder="Cracks, surface damage"
                className="form-input"
              />
            </Field>

            <div className="sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-600">
                Inspection Images
              </span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void handleImageFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => imageInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    imageInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggingImages(true);
                }}
                onDragLeave={() => setDraggingImages(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDraggingImages(false);
                  void handleImageFiles(e.dataTransfer.files);
                }}
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                  draggingImages
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
                }`}
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-2xl text-blue-600">
                  ↑
                </div>
                <p className="font-semibold text-slate-700">
                  Click to upload or drag and drop images here.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  JPG, PNG or WEBP · Maximum 1 MB per image · Up to 5 images
                </p>
              </div>

              {photographs.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {photographs.map((photo, index) => (
                    <div
                      key={`${index}-${photo.slice(0, 32)}`}
                      className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {photo.startsWith("data:image/") ? (
                        <button
                          type="button"
                          onClick={() => openImagePreview(photographs, index)}
                          className="block w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          aria-label={`Preview inspection image ${index + 1}`}
                        >
                          <img
                            src={photo}
                            alt={`Inspection image ${index + 1}`}
                            className="h-28 w-full object-cover transition hover:opacity-90"
                          />
                        </button>
                      ) : (
                        <div className="flex h-28 items-center justify-center break-all p-2 text-center text-xs text-slate-500">
                          {photo}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhotograph(index)}
                        className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-red-600 shadow hover:bg-red-50"
                        aria-label={`Remove image ${index + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {photographs.length} of 5 images selected
              </p>
            </div>
          </div>

          <Field label="Inspection Notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Add inspection observations..."
              className="form-input"
            />
          </Field>

          <button
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Inspection"}
          </button>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h4 className="font-bold">Inspection Records</h4>
            <p className="mt-1 text-xs text-slate-400">
              Stored material quality records.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Filter by inventory ID"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setFilter("")}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Loading inspections...
          </p>
        ) : inspections.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No inspection records found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-212.5 text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  {["Inventory", "Inspector", "Condition", "Defects", "Photos", "Date", "Actions"].map(
                    (heading) => (
                      <th key={heading} className="pb-4 font-medium">
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {inspections.map((item) => (
                  <tr key={item._id} className="border-b border-slate-50">
                    <td className="py-4 font-semibold">#{item.inventory_id}</td>
                    <td>{item.inspector_id}</td>
                    <td>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${conditionStyles[item.condition] || "bg-slate-100 text-slate-600"}`}>
                        {item.condition}
                      </span>
                    </td>
                    <td className="max-w-40 truncate">
                      {item.defects.length ? item.defects.join(", ") : "None"}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {item.photographs.slice(0, 3).map((photo, index) =>
                          photo.startsWith("data:image/") ? (
                            <button
                              key={index}
                              type="button"
                              onClick={() => openImagePreview(item.photographs, index)}
                              className="rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              aria-label={`Open inspection ${item._id} image ${index + 1}`}
                              title="View image"
                            >
                              <img
                                src={photo}
                                alt={`Inspection ${item._id} image ${index + 1}`}
                                className="h-9 w-9 cursor-zoom-in rounded-md border border-slate-200 object-cover transition hover:opacity-80"
                              />
                            </button>
                          ) : null
                        )}
                        <span className="text-xs text-slate-500">
                          {item.photographs.length} {item.photographs.length === 1 ? "image" : "images"}
                        </span>
                      </div>
                    </td>
                    <td>{new Date(item.inspection_date).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEditForm(item)}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteInspection(item._id)}
                          className="font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {previewImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImages([])}
          role="dialog"
          aria-modal="true"
          aria-label="Inspection image preview"
        >
          <button
            type="button"
            onClick={() => setPreviewImages([])}
            className="absolute right-5 top-5 z-10 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
            aria-label="Close image preview"
          >
            Close ✕
          </button>

          {previewImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPreviewIndex((current) =>
                    (current - 1 + previewImages.length) % previewImages.length
                  );
                }}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 px-4 py-3 text-2xl text-white transition hover:bg-white/25"
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPreviewIndex((current) => (current + 1) % previewImages.length);
                }}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 px-4 py-3 text-2xl text-white transition hover:bg-white/25"
                aria-label="Next image"
              >
                ›
              </button>
            </>
          )}

          <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <img
              src={previewImages[previewIndex]}
              alt={`Inspection image ${previewIndex + 1}`}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            <p className="text-sm text-white/80">
              Image {previewIndex + 1} of {previewImages.length} · Press Esc to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
