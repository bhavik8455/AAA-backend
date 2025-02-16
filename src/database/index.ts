import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export default (DB: D1Database) => {
  return drizzle(DB, { logger: false, schema });
};
