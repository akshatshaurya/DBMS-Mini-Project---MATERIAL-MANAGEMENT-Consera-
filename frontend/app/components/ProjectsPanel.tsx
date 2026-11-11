
"use client";

import { useEffect, useMemo, useState } from "react";

type ProjectStatus = "planning" | "active" | "completed" | "cancelled";

type Project = {
  _id: string;
  project_id: number;
  project_name: string;
  site_id: number;
  project_manager_id: number;
  start_date: string;
  expected_end_date: string | null;
  budget: number | null;
  status: ProjectStatus;
};

type ProjectForm = {
  project_name: string;
  site_id: string;
  project_manager_id: string;
  start_date: string;
  expected_end_date: string;
  budget: string;
  status: ProjectStatus;
};

const emptyForm: ProjectForm = {
  project_name: "",
  site_id: "",
  project_manager_id: "",
  start_date: "",
  expected_end_date: "",
  budget: "",
  status: "planning",
};

const PROJECT_STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "completed",
  "cancelled",
];

const inputClass = "form-input";

function formatDate(value: string | null) {
  if (!value) return "Not specified";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatBudget(value: number | null) {
  if (value === null || value === undefined) return "Not specified";

  return `₹${value.toLocaleString("en-IN")}`;
}

function statusClass(status: ProjectStatus) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "planning":
      return "bg-blue-50 text-blue-700";
    case "completed":
      return "bg-slate-100 text-slate-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);

  async function fetchProjects() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/projects");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not fetch projects.");
      }

      setProjects(data.projects);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to load projects."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        project.project_name.toLowerCase().includes(searchText) ||
        String(project.project_id).includes(searchText) ||
        String(project.site_id).includes(searchText) ||
        String(project.project_manager_id).includes(searchText);

      const matchesStatus =
        statusFilter === "ALL" || project.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  const activeCount = projects.filter(
    (project) => project.status === "active"
  ).length;

  const planningCount = projects.filter(
    (project) => project.status === "planning"
  ).length;

  const completedCount = projects.filter(
    (project) => project.status === "completed"
  ).length;

  const totalBudget = projects.reduce(
    (sum, project) => sum + (project.budget ?? 0),
    0
  );

  function updateField(field: keyof ProjectForm, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function openEditForm(project: Project) {
    setEditingId(project.project_id);

    setForm({
      project_name: project.project_name,
      site_id: String(project.site_id),
      project_manager_id: String(project.project_manager_id),
      start_date: project.start_date
        ? project.start_date.slice(0, 10)
        : "",
      expected_end_date: project.expected_end_date
        ? project.expected_end_date.slice(0, 10)
        : "",
      budget:
        project.budget === null ? "" : String(project.budget),
      status: project.status,
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");

    const siteId = Number(form.site_id);
    const managerId = Number(form.project_manager_id);
    const budget = form.budget === "" ? null : Number(form.budget);

    if (!form.project_name.trim()) {
      setError("Please enter a project name.");
      return;
    }

    if (
      !Number.isSafeInteger(siteId) ||
      siteId < 1 ||
      !Number.isSafeInteger(managerId) ||
      managerId < 1
    ) {
      setError("Site ID and project manager ID must be positive whole numbers.");
      return;
    }

    if (!form.start_date) {
      setError("Please select a project start date.");
      return;
    }

    if (
      form.expected_end_date &&
      form.expected_end_date < form.start_date
    ) {
      setError("Expected end date cannot precede the start date.");
      return;
    }

    if (
      budget !== null &&
      (!Number.isFinite(budget) || budget < 0)
    ) {
      setError("Budget must be a non-negative number.");
      return;
    }

    const payload = {
      project_name: form.project_name.trim(),
      site_id: siteId,
      project_manager_id: managerId,
      start_date: form.start_date,
      expected_end_date: form.expected_end_date || null,
      budget,
      status: form.status,
    };

    setSaving(true);

    try {
      const response = await fetch(
        editingId
          ? `/api/projects/${editingId}`
          : "/api/projects",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save project.");
      }

      closeForm();

      setNotice(
        editingId
          ? "Project updated successfully."
          : "New project added successfully."
      );

      await fetchProjects();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(
      `Delete "${project.project_name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    setDeletingId(project.project_id);

    try {
      const response = await fetch(
        `/api/projects/${project.project_id}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete project.");
      }

      setNotice(`${project.project_name} deleted successfully.`);
      await fetchProjects();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete project."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Projects",
            value: projects.length,
            detail: "Registered construction projects",
          },
          {
            label: "Active Projects",
            value: activeCount,
            detail: "Currently in progress",
          },
          {
            label: "Planning Projects",
            value: planningCount,
            detail: "Awaiting execution",
          },
          {
            label: "Total Budget",
            value: formatBudget(totalBudget),
            detail: `${completedCount} completed projects`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-3 text-2xl font-bold">{card.value}</p>
            <p className="mt-2 text-xs text-slate-400">{card.detail}</p>
          </div>
        ))}
      </section>

      {/* Main projects section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-xl font-bold">Construction Projects</h3>
            <p className="mt-1 text-sm text-slate-400">
              Manage project details, timelines, budgets and status.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={fetchProjects}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "⟳ Refresh"}
            </button>

            <button
              onClick={openAddForm}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Add Project
            </button>
          </div>
        </div>

        {/* Search and status filter */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClass}
            placeholder="Search projects, site IDs or manager IDs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className={`${inputClass} sm:max-w-52`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
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

        {/* Projects table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-250 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="pb-4 font-medium">Project</th>
                <th className="pb-4 font-medium">Site ID</th>
                <th className="pb-4 font-medium">Manager ID</th>
                <th className="pb-4 font-medium">Start Date</th>
                <th className="pb-4 font-medium">Expected End</th>
                <th className="pb-4 font-medium">Budget</th>
                <th className="pb-4 font-medium">Status</th>
                <th className="pb-4 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-slate-400"
                  >
                    Loading projects...
                  </td>
                </tr>
              ) : error && projects.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-red-500"
                  >
                    Unable to load projects.
                  </td>
                </tr>
              ) : filteredProjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-slate-400"
                  >
                    No matching projects found.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => (
                  <tr
                    key={project.project_id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="py-4">
                      <p className="font-semibold">{project.project_name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        ID: {project.project_id}
                      </p>
                    </td>

                    <td>{project.site_id}</td>
                    <td>{project.project_manager_id}</td>
                    <td>{formatDate(project.start_date)}</td>
                    <td>{formatDate(project.expected_end_date)}</td>
                    <td className="whitespace-nowrap">
                      {formatBudget(project.budget)}
                    </td>

                    <td>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusClass(
                          project.status
                        )}`}
                      >
                        {project.status}
                      </span>
                    </td>

                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditForm(project)}
                          className="rounded-lg border border-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteProject(project)}
                          disabled={deletingId === project.project_id}
                          className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === project.project_id
                            ? "Deleting..."
                            : "Delete"}
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
          Showing {filteredProjects.length} of {projects.length} projects
        </div>
      </section>

      {/* Add / Edit form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  {editingId ? "Edit Project" : "Add New Project"}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Enter the project details below.
                </p>
              </div>

              <button
                onClick={closeForm}
                disabled={saving}
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
                <label className="space-y-2 text-sm font-medium sm:col-span-2">
                  Project Name
                  <input
                    required
                    className={inputClass}
                    placeholder="e.g. Whitefield Office Expansion"
                    value={form.project_name}
                    onChange={(e) =>
                      updateField("project_name", e.target.value)
                    }
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Site ID
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    className={inputClass}
                    value={form.site_id}
                    onChange={(e) => updateField("site_id", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Project Manager ID
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    className={inputClass}
                    value={form.project_manager_id}
                    onChange={(e) =>
                      updateField("project_manager_id", e.target.value)
                    }
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Start Date
                  <input
                    required
                    type="date"
                    className={inputClass}
                    value={form.start_date}
                    onChange={(e) =>
                      updateField("start_date", e.target.value)
                    }
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Expected End Date
                  <input
                    type="date"
                    min={form.start_date || undefined}
                    className={inputClass}
                    value={form.expected_end_date}
                    onChange={(e) =>
                      updateField("expected_end_date", e.target.value)
                    }
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Budget (₹)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={inputClass}
                    placeholder="e.g. 25000000"
                    value={form.budget}
                    onChange={(e) => updateField("budget", e.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  Project Status
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) =>
                      updateField("status", e.target.value as ProjectStatus)
                    }
                  >
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                Site ID and Project Manager ID must be positive whole numbers.
                Budget and expected end date are optional.
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
                      : "Add Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
