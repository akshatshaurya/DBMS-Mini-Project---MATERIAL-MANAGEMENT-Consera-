
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri) {
  throw new Error("Please define MONGODB_URI in .env.local");
}

if (!dbName) {
  throw new Error("Please define MONGODB_DB in .env.local");
}

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

const client = new MongoClient(uri);

const clientPromise =
  globalForMongo.mongoClientPromise ??
  client.connect();

if (process.env.NODE_ENV !== "production") {
  globalForMongo.mongoClientPromise = clientPromise;
}

export async function getDatabase(): Promise<Db> {
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}
