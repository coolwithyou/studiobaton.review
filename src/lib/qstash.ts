/**
 * QStash Client
 * 서버리스 환경에서 안정적인 백그라운드 작업 실행을 위한 클라이언트
 */

import { Client } from "@upstash/qstash";

if (!process.env.QSTASH_TOKEN) {
  throw new Error("QSTASH_TOKEN is not set");
}

export const qstash = new Client({
  token: process.env.QSTASH_TOKEN,
});

// QStash 서명 검증을 위한 키
export const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
export const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

