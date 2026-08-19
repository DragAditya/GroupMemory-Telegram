import { createGroupMemoryApp } from "../server/app";

// Vercel imports this Express app as a serverless function. The normal Node entrypoint
// remains in server/_core/index.ts for Render, Docker, and local development.
export default createGroupMemoryApp();
