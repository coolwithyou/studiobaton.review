"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Settings,
  ChevronDown,
  Building2,
  RefreshCw,
} from "lucide-react";

interface Organization {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

interface OrgSidebarProps {
  currentOrg: Organization;
  allOrgs: Organization[];
}

const navigation = [
  { name: "대시보드", href: "", icon: LayoutDashboard },
  { name: "커밋 동기화", href: "/sync", icon: RefreshCw },
  { name: "설정", href: "/settings", icon: Settings },
];

export function OrgSidebar({ currentOrg, allOrgs }: OrgSidebarProps) {
  const pathname = usePathname();
  const baseHref = `/organizations/${currentOrg.login}`;

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      {/* 조직 선택 드롭다운 */}
      <div className="border-b p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={currentOrg.avatarUrl || undefined} />
                  <AvatarFallback>
                    {currentOrg.login.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">
                    {currentOrg.name || currentOrg.login}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    @{currentOrg.login}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel>조직 전환</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allOrgs.map((org) => (
              <DropdownMenuItem key={org.id} asChild>
                <Link
                  href={`/organizations/${org.login}`}
                  className="flex items-center gap-3"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={org.avatarUrl || undefined} />
                    <AvatarFallback className="text-xs">
                      {org.login.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm">{org.name || org.login}</span>
                    <span className="text-xs text-muted-foreground">
                      @{org.login}
                    </span>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>모든 조직 보기</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const href = `${baseHref}${item.href}`;
          const isActive = item.href === ""
            ? pathname === baseHref
            : pathname.startsWith(href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
