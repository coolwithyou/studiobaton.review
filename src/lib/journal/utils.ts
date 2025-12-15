import { setISOWeek, startOfISOWeek, endOfISOWeek, getYear, getISOWeek, startOfMonth, endOfMonth } from "date-fns";

export interface WeekInfo {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}

/**
 * 특정 연도의 모든 주차 정보를 생성합니다 (ISO 8601 기준)
 */
export function generateYearWeeks(year: number): WeekInfo[] {
  const weeks: WeekInfo[] = [];

  // ISO 8601 주차는 1~53까지
  for (let weekNumber = 1; weekNumber <= 53; weekNumber++) {
    try {
      // 해당 년도의 특정 주차 첫 날을 구함 (ISO 기준)
      const dateInWeek = setISOWeek(new Date(year, 0, 4), weekNumber); // 1월 4일 기준
      const weekStart = startOfISOWeek(dateInWeek);
      const weekEnd = endOfISOWeek(dateInWeek);

      // 해당 주차가 목표 년도에 포함되는지 확인
      const startYear = getYear(weekStart);
      const endYear = getYear(weekEnd);

      if (startYear === year || endYear === year) {
        weeks.push({
          weekNumber,
          startDate: weekStart,
          endDate: weekEnd,
        });
      }
    } catch (error) {
      // 53주차가 없는 해도 있음 (에러 무시)
      continue;
    }
  }

  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
}

/**
 * 특정 월에 포함되는 주차들을 계산합니다
 * 주차의 중간 날짜가 해당 월에 속하면 그 월의 주차로 간주
 */
export function getWeeksInMonth(year: number, month: number): number[] {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);

  const weeks: number[] = [];

  // 해당 월의 첫 주와 마지막 주
  const firstWeek = getISOWeek(monthStart, { weekStartsOn: 1 });
  const lastWeek = getISOWeek(monthEnd, { weekStartsOn: 1 });

  for (let weekNumber = firstWeek; weekNumber <= lastWeek; weekNumber++) {
    try {
      const dateInWeek = setISOWeek(new Date(year, 0, 4), weekNumber);
      const weekStart = startOfISOWeek(dateInWeek);
      const weekEnd = endOfISOWeek(dateInWeek);

      // 주차의 중간 날짜
      const midDate = new Date((weekStart.getTime() + weekEnd.getTime()) / 2);

      // 중간 날짜가 해당 월에 속하면 포함
      if (midDate >= monthStart && midDate <= monthEnd) {
        weeks.push(weekNumber);
      }
    } catch (error) {
      continue;
    }
  }

  return weeks.sort((a, b) => a - b);
}
