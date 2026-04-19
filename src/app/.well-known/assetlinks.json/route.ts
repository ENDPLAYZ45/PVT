import { NextResponse } from "next/server";

// Digital Asset Links — links your Play Store TWA app to this domain
// This proves to Android that you own this website and the app.
// Once deployed, the browser address bar will disappear in the installed app.

const assetLinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "app.vercel.pvt_cyan.twa",
      sha256_cert_fingerprints: [
        "F5:1E:84:5A:2E:8D:F2:39:EA:68:78:26:04:3A:20:FC:72:46:C4:DB:19:99:77:10:C9:3F:19:0F:87:95:4E:F0"
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
