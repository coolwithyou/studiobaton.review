// ============================================
// 커스텀 에러 클래스
// ============================================

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

// 인증 관련 에러
export class AuthError extends AppError {
  constructor(message: string = "인증이 필요합니다.") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthError";
  }
}

// 권한 관련 에러
export class ForbiddenError extends AppError {
  constructor(message: string = "접근 권한이 없습니다.") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

// 리소스 없음 에러
export class NotFoundError extends AppError {
  constructor(resource: string = "리소스") {
    super(`${resource}를 찾을 수 없습니다.`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

// 유효성 검증 에러
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

// Rate Limit 에러
export class RateLimitError extends AppError {
  constructor(
    message: string = "요청 한도를 초과했습니다.",
    public retryAfter?: number
  ) {
    super(message, "RATE_LIMIT", 429, { retryAfter });
    this.name = "RateLimitError";
  }
}

// GitHub API 에러
export class GitHubError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "GITHUB_ERROR", 502, details);
    this.name = "GitHubError";
  }
}

// LLM API 에러
export class LLMError extends AppError {
  constructor(message: string, provider: string) {
    super(message, "LLM_ERROR", 502, { provider });
    this.name = "LLMError";
  }
}

// ============================================
// 에러 핸들링 유틸리티
// ============================================

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function formatError(error: unknown): {
  message: string;
  code: string;
  statusCode: number;
} {
  if (isAppError(error)) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: "INTERNAL_ERROR",
      statusCode: 500,
    };
  }

  return {
    message: "알 수 없는 오류가 발생했습니다.",
    code: "UNKNOWN_ERROR",
    statusCode: 500,
  };
}

// ============================================
// 재시도 유틸리티
// ============================================

interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 재시도하지 않아야 하는 에러
      if (
        error instanceof AuthError ||
        error instanceof ForbiddenError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }

      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay
        );

        // Jitter 추가 (0.5 ~ 1.5배)
        const jitter = 0.5 + Math.random();
        await sleep(delay * jitter);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

