import { redirect } from "next/navigation";

export default async function Home() {
  // Always redirect to login — the proxy handles auth-based redirects
  redirect("/login");
}
