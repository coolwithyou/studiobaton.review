import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getInstallationOctokit } from "@/lib/github";

interface PermissionCheck {
  permission: string;
  required: "read" | "write";
  granted: "none" | "read" | "write";
  status: "ok" | "missing" | "insufficient";
  description: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgLogin = searchParams.get("orgLogin");

    if (!orgLogin) {
      return NextResponse.json(
        { error: "Organization login required" },
        { status: 400 }
      );
    }

    const org = await db.organization.findUnique({
      where: { login: orgLogin },
    });

    if (!org || !org.installationId) {
      return NextResponse.json(
        { error: "Organization not found or GitHub App not installed" },
        { status: 404 }
      );
    }

    // GitHub App 권한 조회
    const octokit = await getInstallationOctokit(org.installationId);
    const { data: installation } = await octokit.rest.apps.getInstallation({
      installation_id: org.installationId,
    });

    const permissions = installation.permissions || {};

    // 필요한 권한 체크
    const requiredPermissions = [
      {
        permission: "contents",
        required: "read" as const,
        description: "저장소 콘텐츠 읽기 (커밋 정보)",
      },
      {
        permission: "metadata",
        required: "read" as const,
        description: "저장소 메타데이터 읽기",
      },
      {
        permission: "pull_requests",
        required: "read" as const,
        description: "Pull Request 정보 읽기 (선택)",
      },
      {
        permission: "members",
        required: "read" as const,
        description: "조직 멤버 목록 읽기",
      },
    ];

    const checks: PermissionCheck[] = requiredPermissions.map((req) => {
      const granted: "none" | "read" | "write" = (permissions as any)[req.permission] || "none";
      let status: "ok" | "missing" | "insufficient" = "ok";

      if (granted === "none") {
        status = "missing";
      } else if (granted === "read" || granted === "write") {
        // 현재 모든 필수 권한이 read이므로, read 또는 write 권한이 있으면 ok
        status = "ok";
      }

      return {
        permission: req.permission,
        required: req.required,
        granted,
        status,
        description: req.description,
      };
    });

    const hasAllRequired = checks
      .filter((c) => c.permission !== "pull_requests") // PR은 선택사항
      .every((c) => c.status === "ok");

    const hasPRPermission = checks.find((c) => c.permission === "pull_requests")?.status === "ok";

    return NextResponse.json({
      orgLogin,
      installationId: org.installationId,
      hasAllRequired,
      hasPRPermission,
      checks,
      permissions,
    });
  } catch (error) {
    console.error("Permission check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
