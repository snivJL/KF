import Sidebar from "./sidebar";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background dark:bg-primary text-gray-900 dark:text-white px-8">
        {children}
      </main>
    </div>
  );
}
