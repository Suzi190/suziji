<script setup>
/**
 * 迷你日历（首页大组件右侧）
 * 对齐参考稿：左上「10 月」大字 + 右上小年份，下面是日~六 + 日期格；
 * 今天用主题色实心圆标出来。不再用英文月份，中文更干净。
 */
import { computed } from 'vue'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const today = new Date()
const year = today.getFullYear()
const month = today.getMonth()
const date = today.getDate()

const monthName = computed(() => `${month + 1} 月`)

const days = computed(() => {
  const firstWeekday = new Date(year, month, 1).getDay()
  const total = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= total; day++) cells.push(day)
  return cells
})
</script>

<template>
  <div class="mini-calendar">
    <div class="head">
      <span class="month">{{ monthName }}</span>
      <span class="year">{{ year }}</span>
    </div>
    <div class="week">
      <span v-for="label in WEEK_LABELS" :key="label">{{ label }}</span>
    </div>
    <div class="days">
      <span v-for="(day, index) in days" :key="index" class="day" :class="{ today: day === date }">
        {{ day ?? '' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/*
 * 尺寸全部写成 min(设计值, 自身高度的百分比)：
 * 正常屏幕（390×844 及以上）用设计值，和参考稿一致；
 * 矮屏（如 375×667 网格被压缩）时自动缩小，日历不会撑破卡片、也不盖到五个圆点上
 */
.mini-calendar {
  container-type: size;
  display: flex;
  flex-direction: column;
  gap: min(calc(var(--u) * 6), 2.6cqh);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: min(calc(var(--u) * 18), 7cqh) min(calc(var(--u) * 16), 7cqw);
  border-radius: calc(var(--u) * 20);
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.88);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(var(--u) * 4);
  color: var(--c-text);
}

.month {
  font-size: min(calc(var(--u) * 26), 13.5cqh);
  font-weight: 500;
  letter-spacing: calc(var(--u) * 0.4);
  line-height: 1.1;
}

.year {
  font-size: min(calc(var(--u) * 11.5), 7.5cqh);
  letter-spacing: calc(var(--u) * 0.3);
  color: var(--c-text-faint);
}

.week,
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  justify-items: center;
  align-items: center;
}

.week {
  font-size: min(calc(var(--u) * 11.5), 7.5cqh);
  color: var(--c-text-faint);
}

/* 行高均分剩余空间：6 行 / 5 行的月份都不会挤在一起或散开 */
.days {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  grid-auto-rows: minmax(0, 1fr);
  font-size: min(calc(var(--u) * 13), 8.5cqh);
  line-height: 1.05;
  color: var(--c-text-soft);
  font-variant-numeric: tabular-nums;
}

/* 高度吃满所在日期格（矮屏时按卡片高度自动变小），宽度由 aspect-ratio 推出，保证是正圆 */
.day {
  display: flex;
  align-items: center;
  justify-content: center;
  height: min(calc(var(--u) * 20), 9.6cqh);
  aspect-ratio: 1;
  border-radius: 999px;
}

.day.today {
  color: #fff;
  background: var(--c-accent);
}
</style>
