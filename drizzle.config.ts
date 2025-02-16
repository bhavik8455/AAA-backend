import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      "file:C:/Users/Solan/OneDrive/Desktop/AAA-backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/fa14c453400d563bfbc46dd02094896114991e948b5a760fcc97d8c740b639e6.sqlite",
  },
});
