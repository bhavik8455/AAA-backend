import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      "file:D:/user/Downloads/Aditya/contributions/aaa-backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/19a9a3ef716565e10b3d2ab5dd5590ee983cdda4ff019a77e484fb82dd97b797.sqlite",
  },
});
