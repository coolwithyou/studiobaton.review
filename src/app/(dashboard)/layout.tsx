import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getUser, isAuthenticated } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const user = await getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

