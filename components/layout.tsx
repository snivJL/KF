"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Upload, History, LogOut, SunMoon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const sidebarLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/history", label: "History", icon: History },
  { href: "/logs", label: "Import Logs", icon: LogOut },
  { label: "Sync Data", href: "/sync",icon: RefreshCw }
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  const fetchToken = async () => {
    try {
      const res = await fetch("/api/auth/token", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get token");
      const data = await res.json();
      console.log("Token info:", data); // Optional debug
      setTokenStatus("✅ Authenticated");
    } catch (err) {
      console.error(err);
      setTokenStatus("❌ Auth Failed");
    }
  };

  const handleAuth = () => {
    window.location.href = "/api/auth/login";
  };

  useEffect(() => {
    fetchToken();
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-[#212536] text-white flex flex-col p-4 space-y-2">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/logo.svg" alt="Logo" width={32} height={32} className="rounded" />
          <h2 className="text-xl font-bold">Invoice Portal</h2>
        </div>
        {sidebarLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md hover:bg-[#2f3348] transition",
              pathname === href && "bg-[#0A6AE7]"
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-white/20 space-y-2">
          <Button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            variant="ghost"
            className="w-full flex gap-2 text-white hover:bg-[#2f3348]"
          >
            <SunMoon className="w-5 h-5" />
            Toggle Theme
          </Button>
          <Button
            onClick={handleAuth}
            variant="secondary"
            className="w-full"
          >
            Authenticate VCRM
          </Button>
          {tokenStatus && <p className="text-xs text-center">{tokenStatus}</p>}
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 dark:bg-[#1a1d2d] text-gray-900 dark:text-white p-8">
        {children}
      </main>
    </div>
  );
}
