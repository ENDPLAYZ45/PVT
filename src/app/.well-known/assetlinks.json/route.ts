import { NextResponse } from "next/server";

// Digital Asset Links — links your Play Store TWA app to this domain
// The sha256_cert_fingerprints value MUST be updated with the actual
// SHA-256 fingerprint from your TWA signing keystore (from PWABuilder).
// See: https://developers.google.com/digital-asset-links/v1/getting-started

const assetLinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      // TODO: Replace with your actual Play Store package name after creating it
      package_name: "app.pvt.chat",
      // TODO: Replace with your actual SHA-256 fingerprint from PWABuilder
      sha256_cert_fingerprints: [
        "PLACEHOLDER:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF"
      ],
    },
  },
];

export async function GET() {
  return NextResponse.json(assetLinks, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
