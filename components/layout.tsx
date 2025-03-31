import { getAccessToken } from "@/lib/vcrm";
import Sidebar from "./sidebar";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getAccessToken();
  return (
    <div className="flex min-h-screen">
      <Sidebar token={token} />
      <main className="flex-1 bg-gray-50 dark:bg-[#1a1d2d] text-gray-900 dark:text-white p-8">
        {children}
      </main>
    </div>
  );
}
