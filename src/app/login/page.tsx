import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  // Sudah login -> tidak perlu melihat form lagi.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return <LoginForm />;
}
