import { NextRequest, NextResponse } from "next/server";
import { Int32 } from "mongodb";
import { getDatabase } from "@/lib/mongodb";

const PROJECT_STATUSES = [
  "planning",
  "active",
  "completed",
  "cancelled",
] as const;

export async function GET() {
  try {
    const db = await getDatabase();

    const projects = await db
      .collection("projects")
      .find({})
      .sort({ project_id: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    console.error("Projects GET error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch projects." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      project_name,
      site_id,
      project_manager_id,
      start_date,
      expected_end_date,
      budget,
      status,
    } = body;

    if (
      typeof project_name !== "string" ||
      !project_name.trim() ||
      !Number.isSafeInteger(Number(site_id)) ||
      Number(site_id) < 1 ||
      !Number.isSafeInteger(Number(project_manager_id)) ||
      Number(project_manager_id) < 1 ||
      typeof start_date !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing project details." },
        { status: 400 }
      );
    }

    const startDate = new Date(start_date);

    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json(
        { success: false, message: "Invalid start date." },
        { status: 400 }
      );
    }

    let expectedEndDate: Date | null = null;

    if (expected_end_date !== undefined && expected_end_date !== null && expected_end_date !== "") {
      if (typeof expected_end_date !== "string") {
        return NextResponse.json(
          { success: false, message: "Invalid expected end date." },
          { status: 400 }
        );
      }

      expectedEndDate = new Date(expected_end_date);

      if (
        Number.isNaN(expectedEndDate.getTime()) ||
        expectedEndDate < startDate
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Expected end date must be valid and cannot precede the start date.",
          },
          { status: 400 }
        );
      }
    }

    const projectStatus =
      status === undefined ? "planning" : status;

    if (!PROJECT_STATUSES.includes(projectStatus)) {
      return NextResponse.json(
        { success: false, message: "Invalid project status." },
        { status: 400 }
      );
    }

    let projectBudget: number | null = null;

    if (budget !== undefined && budget !== null && budget !== "") {
      projectBudget = Number(budget);

      if (
        !Number.isFinite(projectBudget) ||
        projectBudget < 0
      ) {
        return NextResponse.json(
          { success: false, message: "Budget must be a non-negative number." },
          { status: 400 }
        );
      }
    }

    const db = await getDatabase();
    const projects = db.collection("projects");

    const latestProject = await projects
      .find({})
      .sort({ project_id: -1 })
      .limit(1)
      .next();

    const nextId = (latestProject?.project_id ?? 0) + 1;

    const now = new Date();

    const newProject = {
      project_id: new Int32(nextId),
      project_name: project_name.trim(),
      site_id: new Int32(Number(site_id)),
      project_manager_id: new Int32(Number(project_manager_id)),
      start_date: startDate,
      expected_end_date: expectedEndDate,
      budget: projectBudget,
      status: projectStatus,
      created_at: now,
      updated_at: now,
    };

    const result = await projects.insertOne(newProject);

    return NextResponse.json(
      {
        success: true,
        message: "Project created successfully.",
        project: {
          ...newProject,
          _id: result.insertedId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Projects POST error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create project." },
      { status: 500 }
    );
  }
}