"use client";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Home, Upload, History, LogOut, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";

const sidebarLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/history", label: "History", icon: History },
  { href: "/logs", label: "Import Logs", icon: LogOut },
  { label: "Sync Data", href: "/sync", icon: RefreshCw },
];

const Sidebar = ({ token }: { token: string | null }) => {
  const pathname = usePathname();

  const handleAuth = () => {
    window.location.href = "/api/auth/login";
  };

  return (
    <aside className="w-64 bg-[#171717] text-white flex flex-col p-4 space-y-2">
      <div className="mb-6 flex items-center gap-2">
        <Image
          src="/logo.svg"
          alt="Logo"
          width={32}
          height={32}
          className="rounded"
        />
        <h2 className="text-xl font-bold">Invoice Portal</h2>
      </div>
      {sidebarLinks.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md hover:bg-[#2f3348] transition",
            pathname === href && "bg-[#638AC7]"
          )}
        >
          <Icon className="w-5 h-5" />
          <span>{label}</span>
        </Link>
      ))}
      <div className="mt-auto pt-4 border-t border-white/20 space-y-2">
        {/* <Button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          variant="ghost"
          className="w-full flex gap-2 text-white hover:bg-[#2f3348]"
        >
          <SunMoon className="w-5 h-5" />
          Toggle Theme
        </Button> */}
        <Button onClick={handleAuth} variant="secondary" className="w-full">
          Authenticate VCRM
        </Button>
        {token ? (
          <p className="text-xs text-center">Authenticated</p>
        ) : (
          <p className="text-xs text-center">Not Authenticated</p>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
