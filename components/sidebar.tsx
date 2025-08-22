"use client";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Home,
  Upload,
  RefreshCw,
  ContactIcon,
  PillIcon,
  ListChecks,
  ReceiptIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

const sidebarLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/surveys", label: "Surveys", icon: ListChecks },
  { label: "Sync Data", href: "/sync", icon: RefreshCw },
  { label: "Territories", href: "/territory", icon: ContactIcon },
  {
    label: "Contact - Employees",
    href: "/contacts-employees",
    icon: ContactIcon,
  },
  {
    label: "Accounts - Employees",
    href: "/accounts-employees",
    icon: PillIcon,
  },
  { label: "Invoices", href: "/invoices", icon: ReceiptIcon },
];

const Sidebar = () => {
  const { data: session } = useSession();
  const pathname = usePathname();

  const handleAuth = () => {
    window.location.href = "/api/auth/login";
  };

  const hideSidebar =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/surveys";

  const handleLogin = () => signIn();
  const handleLogout = () => signOut();

  if (hideSidebar) return null;
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
        <h2 className="text-xl font-bold">KF Portal</h2>
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
        <Button onClick={handleAuth} variant="secondary" className="w-full">
          Authenticate VCRM
        </Button>
        {session ? (
          <>
            <Button
              onClick={handleLogout}
              variant="secondary"
              className="w-full"
            >
              Sign Out
            </Button>
            <p className="text-xs text-center">
              Signed in as {session.user?.name}
            </p>
          </>
        ) : (
          <Button onClick={handleLogin} variant="secondary" className="w-full">
            Sign In
          </Button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
