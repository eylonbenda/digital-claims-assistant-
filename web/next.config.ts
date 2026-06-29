import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the form-fill assets (blank template PDFs + Hebrew font) into the
  // serverless function for the form route, so it works when deployed.
  outputFileTracingIncludes: {
    "/api/forms/[insurer]": ["./src/lib/formfill/assets/**"],
    "/api/claims/[id]/form/[insurer]": ["./src/lib/formfill/assets/**"],
    "/api/claims/submit": ["./src/lib/formfill/assets/**"],
  },
};

export default nextConfig;
