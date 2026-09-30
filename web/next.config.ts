import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the form-fill assets (blank template PDFs + Hebrew font) into the
  // serverless functions that fill forms, so they work when deployed.
  outputFileTracingIncludes: {
    "/api/claims/[id]/form/[insurer]": ["./src/lib/formfill/assets/**"],
    "/api/claims/submit": ["./src/lib/formfill/assets/**"],
  },
};

export default nextConfig;
