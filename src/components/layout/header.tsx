"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  GitBranch,
  LayoutDashboard,
  Settings,
  LogOut,
  User,
  BarChart3,
  Building2,
} from "lucide-react";

interface HeaderProps {
  user?: {
    name: string | null;
    login: string;
    avatarUrl: string | null;
  } | null;
}

const navigation = [
  { name: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { name: "분석", href: "/analysis", icon: BarChart3 },
  { name: "조직", href: "/organizations", icon: Building2 },
];

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <GitBranch className="h-6 w-6 text-primary" />
          <span className="hidden sm:inline-block">Code Review</span>
        </Link>

        {/* Navigation */}
        {user && (
          <nav className="ml-8 flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline-block">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Menu */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={user.avatarUrl || undefined}
                    alt={user.name || user.login}
                  />
                  <AvatarFallback>
                    {(user.name || user.login).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user.name || user.login}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    @{user.login}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  <span>프로필</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>설정</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href="/api/auth/logout"
                  className="flex items-center text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>로그아웃</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild>
            <Link href="/login">
              <GitBranch className="mr-2 h-4 w-4" />
              GitHub로 로그인
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

