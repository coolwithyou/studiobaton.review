import Link from "next/link";
import { GitBranch } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-14 md:flex-row px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          <span>Code Review System</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/help"
            className="hover:text-foreground transition-colors"
          >
            도움말
          </Link>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            개인정보처리방침
          </Link>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            이용약관
          </Link>
        </div>
      </div>
    </footer>
  );
}

