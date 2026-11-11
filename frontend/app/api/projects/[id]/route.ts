
import { NextRequest, NextResponse } from "next/server";
import { ObjectId, Int32 } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

const PROJECT_STATUSES = [
  "planning",
  "active",
  "completed",
  "cancelled",
] as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;
    const projectId = Number(id);

    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return NextResponse.json(
        { success: false, message: "Invalid project ID." },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    const project = await db.collection("projects").findOne({
      project_id: projectId,
    });

    if (!project) {
      return NextResponse.json(
        { success: false, message: "Project not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("Project GET error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch project." },
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
    const projectId = Number(id);

    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return NextResponse.json(
        { success: false, message: "Invalid project ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const db = await getDatabase();
    const projects = db.collection("projects");

    const existingProject = await projects.findOne({
      project_id: projectId,
    });

    if (!existingProject) {
      return NextResponse.json(
        { success: false, message: "Project not found." },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.project_name !== undefined) {
      if (
        typeof body.project_name !== "string" ||
        !body.project_name.trim()
      ) {
        return NextResponse.json(
          { success: false, message: "Project name cannot be empty." },
          { status: 400 }
        );
      }

      updates.project_name = body.project_name.trim();
    }

    if (body.site_id !== undefined) {
      const siteId = Number(body.site_id);

      if (!Number.isSafeInteger(siteId) || siteId < 1) {
        return NextResponse.json(
          { success: false, message: "Invalid site ID." },
          { status: 400 }
        );
      }

      updates.site_id = new Int32(siteId);
    }

    if (body.project_manager_id !== undefined) {
      const managerId = Number(body.project_manager_id);

      if (!Number.isSafeInteger(managerId) || managerId < 1) {
        return NextResponse.json(
          { success: false, message: "Invalid project manager ID." },
          { status: 400 }
        );
      }

      updates.project_manager_id = new Int32(managerId);
    }

    const startDate =
      body.start_date !== undefined
        ? new Date(body.start_date)
        : existingProject.start_date;

    if (
      !(startDate instanceof Date) ||
      Number.isNaN(startDate.getTime())
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid start date." },
        { status: 400 }
      );
    }

    if (body.start_date !== undefined) {
      updates.start_date = startDate;
    }

    if (body.expected_end_date !== undefined) {
      if (body.expected_end_date === null || body.expected_end_date === "") {
        updates.expected_end_date = null;
      } else {
        if (typeof body.expected_end_date !== "string") {
          return NextResponse.json(
            { success: false, message: "Invalid expected end date." },
            { status: 400 }
          );
        }

        const endDate = new Date(body.expected_end_date);

        if (
          Number.isNaN(endDate.getTime()) ||
          endDate < startDate
        ) {
          return NextResponse.json(
            {
              success: false,
              message: "Expected end date cannot precede the start date.",
            },
            { status: 400 }
          );
        }

        updates.expected_end_date = endDate;
      }
    } else if (
      existingProject.expected_end_date instanceof Date &&
      existingProject.expected_end_date < startDate
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Start date cannot be later than the existing expected end date.",
        },
        { status: 400 }
      );
    }

    if (body.budget !== undefined) {
      if (body.budget === null || body.budget === "") {
        updates.budget = null;
      } else {
        const budget = Number(body.budget);

        if (!Number.isFinite(budget) || budget < 0) {
          return NextResponse.json(
            { success: false, message: "Budget must be non-negative." },
            { status: 400 }
          );
        }

        updates.budget = budget;
      }
    }

    if (body.status !== undefined) {
      if (!PROJECT_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { success: false, message: "Invalid project status." },
          { status: 400 }
        );
      }

      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid fields provided for update." },
        { status: 400 }
      );
    }

    updates.updated_at = new Date();

    const result = await projects.findOneAndUpdate(
      { project_id: projectId },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json(
        { success: false, message: "Project update failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Project updated successfully.",
      project: result,
    });
  } catch (error) {
    console.error("Project PATCH error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update project." },
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
    const projectId = Number(id);

    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return NextResponse.json(
        { success: false, message: "Invalid project ID." },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const projects = db.collection("projects");

    const project = await projects.findOne({
      project_id: projectId,
    });

    if (!project) {
      return NextResponse.json(
        { success: false, message: "Project not found." },
        { status: 404 }
      );
    }

    const linkedReservation = await db
      .collection("reservations")
      .findOne({ project: project.project_name });

    if (linkedReservation) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Cannot delete this project because reservations are linked to it.",
        },
        { status: 409 }
      );
    }

    await projects.deleteOne({ project_id: projectId });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully.",
    });
  } catch (error) {
    console.error("Project DELETE error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to delete project." },
      { status: 500 }
    );
  }
}
