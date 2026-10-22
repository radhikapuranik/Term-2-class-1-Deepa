import { LoginForm } from "./form";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }} className="card">
      <h1 style={{ font: "700 1.8rem var(--f-display)" }}>Sign in to act</h1>
      <p className="muted small" style={{ marginTop: 8 }}>Anyone can look at the dashboard. Approving, editing, uploading and changing rules need the desk passcode.</p>
      <LoginForm next={typeof sp.next === "string" ? sp.next : "/"} />
    </div>
  );
}
