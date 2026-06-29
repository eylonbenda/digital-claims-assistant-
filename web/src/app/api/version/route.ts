// GET /api/version — reports the running app version. Handy for verifying deploys.
export async function GET() {
  return Response.json({
    name: "digital-claims-assistant",
    version: process.env.npm_package_version ?? "0.1.0",
  });
}
