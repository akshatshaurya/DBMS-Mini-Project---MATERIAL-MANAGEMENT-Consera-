
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getDatabase();
    const collections = await db.listCollections().toArray();

    return NextResponse.json({
      success: true,
      database: db.databaseName,
      status: "Connected",
      collections: collections.map((collection) => collection.name),
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);

    return NextResponse.json(
      {
        success: false,
        status: "Disconnected",
      },
      { status: 500 }
    );
  }
}
