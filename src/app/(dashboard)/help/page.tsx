import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle,
  GitBranch,
  BarChart3,
  Sparkles,
  Shield,
} from "lucide-react";

const faqs = [
  {
    question: "Work Unit이란 무엇인가요?",
    answer:
      "Work Unit은 관련된 커밋들을 의미 있는 '작업 단위'로 묶은 것입니다. 단순히 커밋을 나열하는 대신, 시간과 변경 경로의 유사도를 기반으로 클러스터링하여 '로그인 기능 구현', '결제 버그 수정' 등의 논리적 작업 단위로 분석합니다.",
  },
  {
    question: "임팩트 점수는 어떻게 계산되나요?",
    answer:
      "임팩트 점수는 단순한 코드 줄 수(LoC)가 아닌 여러 요소를 종합하여 계산됩니다: 변경 규모(상한 캡 적용), 핵심 모듈 터치 여부, 핫스팟 파일 변경, 설정/스키마 변경, 테스트 비율 등. 이를 통해 '많이 바꾼 사람'이 아닌 '의미 있는 변경을 한 사람'을 평가합니다.",
  },
  {
    question: "AI 리뷰는 어떻게 작동하나요?",
    answer:
      "모든 Work Unit을 AI로 분석하지 않습니다. 임팩트 상위 7개, 랜덤 3개, 특수 케이스(hotfix/revert) 2개를 샘플링하여 GPT-4o 또는 Claude가 분석합니다. AI는 객관적 사실만 기반으로 강점, 리스크, 개선 제안을 제공하며, 성향이나 태도에 대한 추측은 하지 않습니다.",
  },
  {
    question: "GitHub App은 어떤 권한이 필요한가요?",
    answer:
      "최소 권한만 요청합니다: Repository contents (읽기 전용), Metadata (읽기 전용). 코드를 수정하거나 삭제하는 권한은 전혀 없습니다. 모든 데이터는 읽기 전용으로만 접근합니다.",
  },
  {
    question: "분석 비용은 어떻게 되나요?",
    answer:
      "LLM 비용은 샘플링을 통해 최적화됩니다. 일반적으로 사용자당 10-12개의 Work Unit만 AI 리뷰를 실행하여, 대량 분석 대비 비용을 90% 이상 절감합니다.",
  },
  {
    question: "연도별 비교는 어떻게 하나요?",
    answer:
      "같은 조직, 같은 사용자에 대해 매년 분석을 실행하면 자동으로 전년 대비 변화를 추적합니다. 프롬프트 버전과 분석 옵션을 저장하여 연도 간 비교의 일관성을 유지합니다.",
  },
];

const glossary = [
  {
    term: "Work Unit",
    description: "관련 커밋들의 논리적 묶음 (작업 단위)",
  },
  {
    term: "임팩트 점수",
    description: "변경의 의미/중요도를 반영한 복합 지표",
  },
  {
    term: "핫스팟 파일",
    description: "최근 자주 변경되는 파일 (버그 위험도 높음)",
  },
  {
    term: "클러스터링",
    description: "시간/경로 유사도 기반 커밋 그룹화",
  },
  {
    term: "샘플링",
    description: "AI 리뷰 대상 Work Unit 선정 방식",
  },
];

export default function HelpPage() {
  return (
    <div className="container max-w-4xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">도움말</h1>
        <p className="mt-2 text-muted-foreground">
          Code Review 시스템 사용 방법과 자주 묻는 질문입니다.
        </p>
      </div>

      {/* 주요 개념 */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">커밋 기반 분석</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              PR/코드 리뷰가 없어도 커밋 히스토리만으로 의미 있는 기여도 분석이
              가능합니다. Work Unit 클러스터링으로 작업 단위를 식별합니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">맥락 기반 평가</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              단순 LoC가 아닌 핵심 모듈, 핫스팟, 리스크 영역 등을 고려한 임팩트
              점수로 변경의 의미를 반영합니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI 리뷰</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              대표 작업을 GPT-4o/Claude가 분석하여 강점, 리스크, 개선안을
              제공합니다. 샘플링으로 비용을 최적화합니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">안전한 접근</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              읽기 전용 권한만 사용합니다. 코드 수정/삭제 권한 없이 안전하게
              분석합니다.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            자주 묻는 질문
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* 용어 설명 */}
      <Card>
        <CardHeader>
          <CardTitle>용어 설명</CardTitle>
          <CardDescription>시스템에서 사용하는 주요 용어입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {glossary.map((item) => (
              <div key={item.term} className="flex items-start gap-3">
                <Badge variant="outline" className="shrink-0">
                  {item.term}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

