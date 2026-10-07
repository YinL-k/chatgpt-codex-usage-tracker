let allData = {};
let currentYear = new Date().getFullYear();
let availableYears = [];
let yearSelectButtonEl;
let yearSelectValueEl;
let yearSelectMenuEl;

/** Hourly chart state (24h line) */
const hourlyChartState = {
  canvas: null,
  points: [],
  hours: new Array(24).fill(0),
  hasDetailed: false,
  hoverIndex: -1,
};

/** Time distribution pie chart state */
const timeDistributionState = {
  canvas: null,
  segments: [],
  total: 0,
  centerX: 0,
  centerY: 0,
  radius: 0,
  innerRadius: 0,
  hoverIndex: -1,
  animationFrameId: null,
};

/** Modal 8h-bucket bar chart state (3 bars) */
const dayModalBarState = {
  canvas: null,
  tooltip: null,
  bins: [0, 0, 0], // Morning(0-8), Noon(8-16), Evening(16-24)
  barRects: [], // hitboxes in CSS px coords: {x,y,w,h,value}
  hoverIndex: -1,
  animFrameId: null,
  animStart: 0,
  animProgress: 1,
  duration: 520,
};

const TIME_BUCKETS = [
  {
    id: "midnight",
    startHour: 0,
    endHour: 4,
    labelKey: "label_midnight",
    rangeKey: "range_midnight",
    descKey: "desc_midnight",
  },
  {
    id: "morning",
    startHour: 4,
    endHour: 8,
    labelKey: "label_morning",
    rangeKey: "range_morning",
    descKey: "desc_morning",
  },
  {
    id: "forenoon",
    startHour: 8,
    endHour: 12,
    labelKey: "label_forenoon",
    rangeKey: "range_forenoon",
    descKey: "desc_forenoon",
  },
  {
    id: "afternoon",
    startHour: 12,
    endHour: 16,
    labelKey: "label_afternoon",
    rangeKey: "range_afternoon",
    descKey: "desc_afternoon",
  },
  {
    id: "evening",
    startHour: 16,
    endHour: 20,
    labelKey: "label_evening",
    rangeKey: "range_evening",
    descKey: "desc_evening",
  },
  {
    id: "night",
    startHour: 20,
    endHour: 24,
    labelKey: "label_night",
    rangeKey: "range_night",
    descKey: "desc_night",
  },
];

/* ---------- Bootstrap ---------- */

document.addEventListener("DOMContentLoaded", () => {
  if (!window.GPTTrackerI18n) {
    console.error("[SakuraMeter] i18n module missing");
    
    bootstrap();
    return;
  }

  function detectBrowserLang() {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("en")) return "en";
    return "en"; 
  }

  chrome.storage.sync.get("gptTrackerLang", async (res) => {
    const stored = res.gptTrackerLang;
    const lang = stored || detectBrowserLang();

    
    await window.GPTTrackerI18n.initI18n(lang);

    bootstrap();
  });
});

async function bootstrap() {
  
  yearSelectButtonEl = document.getElementById("yearSelectButton");
  yearSelectValueEl = document.getElementById("yearSelectValue");
  yearSelectMenuEl = document.getElementById("yearSelectMenu");

  
  allData = await getStorageData();

  
  initMonthsHeader();
  initThemeToggle();
  initExportImport();
  initModal();
  initDailyChartInteractions();
  initPieChart();

  
  buildYearOptions();
  renderCalendar(currentYear);
  updateDailyChartForToday();
  updateTimeDistribution();

  document.dispatchEvent(new CustomEvent("gpt-heatmap-ready"));

  
  initYearSelectControl();

  
  const langBtn = document.getElementById("languageToggle");
  if (langBtn && window.GPTTrackerI18n) {
    langBtn.addEventListener("click", async () => {
      const current = window.GPTTrackerI18n.currentLang;
      const newLang = current === "zh" ? "en" : "zh";

      chrome.storage.sync.set({ gptTrackerLang: newLang });

      await window.GPTTrackerI18n.initI18n(newLang);
      refreshI18nAndCharts();
    });
  }
}

function refreshI18nAndCharts() {
  if (window.GPTTrackerI18n) {
    window.GPTTrackerI18n.applyI18n(document);
    }

  
  initMonthsHeader();

  
  renderCalendar(currentYear);
  updateDailyChartForToday();
  updateTimeDistribution();
}


/* ---------- Storage helpers ---------- */

function getStorageData() {
  return new Promise((resolve) => chrome.storage.local.get(null, resolve));
}

function isDateKey(key) {
  return !!GPTUsageCore.dateFromKey(key);
}

function normalizeEntry(raw) { return GPTUsageCore.entry(raw); }

function toISODate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`; 
}

/* ---------- Months header ---------- */

function initMonthsHeader() {
  const monthsLabel = document.getElementById("monthsLabel");
  if (!monthsLabel) return;

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  const months = [
    { shortKey: "month_1_short", fallback: "Jan" },
    { shortKey: "month_2_short", fallback: "Feb" },
    { shortKey: "month_3_short", fallback: "Mar" },
    { shortKey: "month_4_short", fallback: "Apr" },
    { shortKey: "month_5_short", fallback: "May" },
    { shortKey: "month_6_short", fallback: "Jun" },
    { shortKey: "month_7_short", fallback: "Jul" },
    { shortKey: "month_8_short", fallback: "Aug" },
    { shortKey: "month_9_short", fallback: "Sep" },
    { shortKey: "month_10_short", fallback: "Oct" },
    { shortKey: "month_11_short", fallback: "Nov" },
    { shortKey: "month_12_short", fallback: "Dec" },
  ];

  monthsLabel.innerHTML = "";
  months.forEach((m) => {
    const span = document.createElement("span");
    span.textContent = t(m.shortKey, m.fallback);
    monthsLabel.appendChild(span);
  });
}

/* ---------- Year select ---------- */

function closeYearSelectMenu({ returnFocus = false } = {}) {
  const shell = yearSelectButtonEl?.closest('.year-select-shell');
  if (!shell || !yearSelectButtonEl || !yearSelectMenuEl) return;
  shell.classList.remove('is-open');
  yearSelectButtonEl.setAttribute('aria-expanded', 'false');
  yearSelectMenuEl.hidden = true;
  if (returnFocus) yearSelectButtonEl.focus({ preventScroll: true });
}

function openYearSelectMenu({ focusSelected = false } = {}) {
  const shell = yearSelectButtonEl?.closest('.year-select-shell');
  if (!shell || !yearSelectButtonEl || !yearSelectMenuEl) return;
  shell.classList.add('is-open');
  yearSelectButtonEl.setAttribute('aria-expanded', 'true');
  yearSelectMenuEl.hidden = false;
  if (focusSelected) {
    const selected = yearSelectMenuEl.querySelector('[aria-selected="true"]') || yearSelectMenuEl.querySelector('button');
    selected?.focus({ preventScroll: true });
  }
}

function applyYearSelection(year, { focusButton = true } = {}) {
  if (!Number.isFinite(year)) return;
  currentYear = year;
  if (yearSelectValueEl) yearSelectValueEl.textContent = String(year);
  yearSelectMenuEl?.querySelectorAll('[role="option"]').forEach((option) => {
    option.setAttribute('aria-selected', option.dataset.year === String(year) ? 'true' : 'false');
  });
  renderCalendar(currentYear);
  closeYearSelectMenu({ returnFocus: focusButton });
}

function syncYearSelectControl() {
  if (!yearSelectMenuEl || !yearSelectValueEl) return;
  yearSelectValueEl.textContent = String(currentYear);
  yearSelectMenuEl.replaceChildren();
  availableYears.forEach((year) => {
    const value = String(year);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'year-select-option';
    button.setAttribute('role', 'option');
    button.dataset.year = value;
    button.textContent = value;
    button.setAttribute('aria-selected', year === currentYear ? 'true' : 'false');
    button.addEventListener('click', () => applyYearSelection(year));
    button.addEventListener('keydown', (e) => {
      const options = Array.from(yearSelectMenuEl.querySelectorAll('.year-select-option'));
      const index = options.indexOf(button);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        options[(index + 1) % options.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        options[(index - 1 + options.length) % options.length]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeYearSelectMenu({ returnFocus: true });
      } else if (e.key === 'Tab') {
        closeYearSelectMenu();
      }
    });
    yearSelectMenuEl.appendChild(button);
  });
}

function initYearSelectControl() {
  if (!yearSelectButtonEl || !yearSelectMenuEl) return;
  const shell = yearSelectButtonEl.closest('.year-select-shell');

  yearSelectButtonEl.addEventListener('click', () => {
    if (shell?.classList.contains('is-open')) closeYearSelectMenu();
    else openYearSelectMenu();
  });

  yearSelectButtonEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openYearSelectMenu({ focusSelected: true });
    } else if (e.key === 'Escape') {
      closeYearSelectMenu();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!shell?.contains(e.target)) closeYearSelectMenu();
  }, { capture: true });

  window.addEventListener('blur', () => closeYearSelectMenu());
  syncYearSelectControl();
}

function buildYearOptions() {
  const years = new Set();
  const todayYear = new Date().getFullYear();
  years.add(todayYear);

  Object.keys(allData).forEach((key) => {
    if (!isDateKey(key)) return;
    const y = parseInt(key.split("-")[0], 10);
    if (!Number.isNaN(y)) years.add(y);
  });

  availableYears = Array.from(years).sort((a, b) => b - a);
  if (!availableYears.includes(currentYear)) {
    currentYear = availableYears[0] || todayYear;
  }
  syncYearSelectControl();
}

/* ---------- Calendar rendering ---------- */

function renderCalendar(year) {
  const grid = document.getElementById("heatmapGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  let totalCount = 0;
  let activeDays = 0;
  let maxCount = 0;
  const dailyCounts = {};
  const positiveCounts = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = toISODate(d);
    const entry = normalizeEntry(allData[dateStr]);
    const count = dateStr>toISODate(new Date())?0:entry.count || 0;

    dailyCounts[dateStr] = count;

    if (count > 0) {
      totalCount += count;
      activeDays++;
      if (count > maxCount) maxCount = count;
      positiveCounts.push(count);
    }
  }

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  // Stats
  const yearTotalEl = document.getElementById("yearTotal");
  const activeDaysEl = document.getElementById("activeDays");
  const avgDailyEl = document.getElementById("avgDaily");
  const currentStreakEl = document.getElementById("currentStreak");
  const longestStreakEl = document.getElementById("longestStreak");

  if (yearTotalEl) yearTotalEl.textContent = String(totalCount);
  if (activeDaysEl) activeDaysEl.textContent = String(activeDays);
  if (avgDailyEl) {
    avgDailyEl.textContent = activeDays
      ? (totalCount / activeDays).toFixed(1)
      : "0";
  }

  const streaks = computeStreaks(year, startDate, endDate, dailyCounts);
  if (currentStreakEl) currentStreakEl.textContent = String(streaks.current);
  if (longestStreakEl) longestStreakEl.textContent = String(streaks.longest);

  // Color scale based on percentiles (with log fallback)
  const colorScale = buildColorScale(positiveCounts, maxCount);

  // Empty cells to align first week (Mon-based)
  const firstDay = startDate.getDay(); // 0 Sun - 6 Sat
  const emptyCells = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < emptyCells; i++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.style.visibility = "hidden";
    cell.style.pointerEvents = "none";
    grid.appendChild(cell);
  }

  // Actual days
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = toISODate(d);
    const count = dailyCounts[dateStr] || 0;

    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.dataset.date = dateStr;
    const tooltipLabel = t("heatmap_cell_tooltip", "{date}: {count} chats")
      .replace("{date}", dateStr)
      .replace("{count}", String(count));
    cell.dataset.tooltip = tooltipLabel;
    cell.setAttribute('role','button');cell.setAttribute('aria-label',tooltipLabel);cell.tabIndex=dateStr===toISODate(new Date())||d.getTime()===startDate.getTime()?0:-1;
    cell.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();handleDayClick(dateStr);return;}
      const steps={ArrowRight:7,ArrowLeft:-7,ArrowDown:1,ArrowUp:-1};if(!(e.key in steps))return;
      e.preventDefault();const cells=[...grid.querySelectorAll('[data-date]')],next=cells[cells.indexOf(cell)+steps[e.key]];if(next){cells.forEach(x=>x.tabIndex=-1);next.tabIndex=0;next.focus();}
    });
    cell.dataset.level = getColorLevel(count, colorScale);
    cell.addEventListener("click", () => handleDayClick(dateStr));
    grid.appendChild(cell);
  }

  let heatmapTooltip = document.getElementById("heatmapTooltip");
  if (!heatmapTooltip) {
    heatmapTooltip = document.createElement("div");
    heatmapTooltip.id = "heatmapTooltip";
    heatmapTooltip.className = "tooltip tooltip-hidden";
    document.body.appendChild(heatmapTooltip);
  }
  heatmapTooltip = ensureFloatingTooltip(heatmapTooltip);

  
  grid.onmousemove = (e) => {
    const cell = e.target.closest(".day-cell");
    if (!cell || !cell.dataset.tooltip) return;

    heatmapTooltip.textContent = cell.dataset.tooltip;
    heatmapTooltip.classList.remove("tooltip-hidden");
    heatmapTooltip.classList.add("tooltip-visible");

    placeTooltipNearPointer(heatmapTooltip, e.clientX, e.clientY, {
      gapX: 14,
      gapY: 14,
      pad: 10,
    });
  };

  grid.onmouseleave = () => {
    heatmapTooltip.classList.add("tooltip-hidden");
    heatmapTooltip.classList.remove("tooltip-visible");
  };

  renderTrendSection(year, startDate, endDate, dailyCounts);
  requestAnimationFrame(()=>updateHeatmapNavigation(year));
}

let heatmapNavigationYear=null;
function updateHeatmapNavigation(year,force=false){
  const box=document.getElementById('heatmapScroll'),nav=document.getElementById('heatmapNavigation'),button=document.getElementById('heatmapCurrent');
  if(!box||!box.clientWidth)return;
  nav.hidden=box.scrollWidth<=box.clientWidth+2;
  const current=year===new Date().getFullYear();button.hidden=!current;
  button.onclick=()=>updateHeatmapNavigation(year,true);
  if(!nav.hidden&&(force||heatmapNavigationYear!==year)){
    const target=current?document.querySelector('[data-date="'+toISODate(new Date())+'"]'):document.querySelector('#heatmapGrid [data-date]');
    if(target)box.scrollLeft+=target.getBoundingClientRect().left-box.getBoundingClientRect().left-box.clientWidth*.6;
    heatmapNavigationYear=year;
  }
}

/* ---------- Color scale ---------- */

function buildColorScale(counts, maxCount) {
  const positive = counts.filter((c) => c > 0);
  if (!positive.length) {
    return { type: "none", thresholds: null, max: 0 };
  }

  const sorted = positive.slice().sort((a, b) => a - b);

  const percentile = (p) => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
  };

  let thresholds = [
    Math.round(percentile(0.2)),
    Math.round(percentile(0.4)),
    Math.round(percentile(0.6)),
    Math.round(percentile(0.8)),
  ];

  // Ensure non-decreasing and at least 1
  let last = 1;
  thresholds = thresholds.map((t) => {
    if (!Number.isFinite(t) || t < last) {
      return last;
    }
    last = t;
    return t;
  });

  return {
    type: "percentile",
    thresholds,
    max: maxCount || sorted[sorted.length - 1] || 1,
  };
}

function getColorLevel(count, scale) {
  if (!scale || count === 0) return 0;

  if (scale.type === "percentile" && scale.thresholds) {
    const [p20, p40, p60, p80] = scale.thresholds;

    if (count <= p20) return 1;
    if (count <= p40) return 2;
    if (count <= p60) return 3;
    if (count <= p80) return 4;
    return 4;
  }

  if (!scale.max || scale.max <= 0) return 1;

  const normalized = Math.log(count + 1) / Math.log(scale.max + 1);
  if (normalized <= 0.25) return 1;
  if (normalized <= 0.5) return 2;
  if (normalized <= 0.75) return 3;
  return 4;
}

/* ---------- Streaks ---------- */

function computeStreaks(year, startDate, endDate, dailyCounts) {
  let longest = 0;
  let current = 0;
  let streak = 0;

  // Longest streak within the selected year
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = toISODate(d);
    const count = dailyCounts[dateStr] || 0;
    if (count > 0) {
      streak++;
      if (streak > longest) longest = streak;
    } else {
      streak = 0;
    }
  }

  // Current streak (GitHub-style: ending at today if same year, otherwise end of that year)
  const today = new Date();
  const todayYear = today.getFullYear();
  let endForCurrent;

  if (year === todayYear) {
    endForCurrent = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
  } else {
    endForCurrent = new Date(year, 11, 31);
  }

  current = 0;
  for (
    let d = new Date(endForCurrent);
    d >= startDate;
    d.setDate(d.getDate() - 1)
  ) {
    if (year === todayYear && d > today) continue;

    const dateStr = toISODate(d);
    const count = dailyCounts[dateStr] || 0;

    if (count > 0) {
      current++;
    } else {
      if (year === todayYear && d.toDateString() === today.toDateString()) {
        current = 0;
      }
      break;
    }
  }

  return { current, longest };
}

/* ---------- Trend charts & stats ---------- */

function renderTrendSection(year, startDate, endDate, dailyCounts) {
  // 24h chart for today (or latest day with timestamps)
  updateDailyChartForToday();

  const weeklyTotals = new Map();
  const monthlyTotals = new Map();
  const weekdayTotals = new Array(7).fill(0); // 0 Sun - 6 Sat

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = toISODate(d);
    const count = dailyCounts[dateStr] || 0;

    const weekKey = getWeekStartISO(d);
    weeklyTotals.set(weekKey, (weeklyTotals.get(weekKey) || 0) + count);

    const monthKey = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + count);

    weekdayTotals[d.getDay()] += count;
  }

  renderWeeklyStats(weeklyTotals);
  renderMonthlyStats(year, monthlyTotals);
  renderBusiestWeekday(weekdayTotals);

  updateTimeDistribution();
}

function getWeekStartISO(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun - 6 Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return toISODate(d);
}

/* ---------- Canvas helpers ---------- */

function getCanvasContext(canvas) {
  const ctx = canvas.getContext("2d");

  
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return {ctx, width:0, height:0};
  if (!canvas.style.height) canvas.style.height = rect.height + "px";

  
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  
  ctx.scale(dpr, dpr);

  return {
    ctx,
    width: canvas.width / dpr,
    height: canvas.height / dpr,
  };
}

/* ---------- 24h Daily Activity chart ---------- */

function initDailyChartInteractions() {
  const canvas = document.getElementById("dailyChart");
  if (!canvas) return;
  hourlyChartState.canvas = canvas;

  const tooltip = document.getElementById("dailyTooltip");
  canvas.addEventListener("mousemove", (event) =>
    handleDailyChartHover(event, tooltip)
  );
  canvas.addEventListener("mouseleave", () => handleDailyChartLeave(tooltip));
}

function updateDailyChartForToday() {
  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;
  const todayStr = toISODate(new Date());
  const entry = normalizeEntry(allData[todayStr]);

  const hours = new Array(24).fill(0);
  const timestamps = entry.timestamps.filter(ts=>ts<=Date.now()&&toISODate(ts)===todayStr);
  let hasDetailed = timestamps.length > 0;

  if (hasDetailed) {
    timestamps.forEach((ts) => {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())||ts>Date.now()) return;
      const dateStr = toISODate(d);
      if (dateStr !== todayStr) return;
      const h = d.getHours();
      if (h >= 0 && h < 24) {
        hours[h] = (hours[h] || 0) + 1;
      }
    });
  }

  hourlyChartState.hours = hours;
  hourlyChartState.hasDetailed = hasDetailed;
  hourlyChartState.total = entry.count;
  hourlyChartState.hoverIndex = -1;

  renderDailyChart();
}

function renderDailyChart() {
  const canvas = hourlyChartState.canvas;
  if (!canvas) return;

  const tooltip = document.getElementById("dailyTooltip");
  const empty=document.getElementById('dailyEmpty');
  canvas.parentElement.classList.toggle('is-empty',!hourlyChartState.hasDetailed);
  empty.hidden=hourlyChartState.hasDetailed;
  empty.textContent=GPTTrackerI18n.t(hourlyChartState.total?'chart_daily_no_detail':'chart_daily_empty');
  const { ctx, width, height } = getCanvasContext(canvas);
  ctx.clearRect(0, 0, width, height);

  const margin = { top: 10, right: 12, bottom: 24, left: 32 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const styles = getComputedStyle(document.body);
  const axisColor =
    (styles.getPropertyValue("--muted-text-color") || "#656d76").trim();
  const lineColor =
    (styles.getPropertyValue("--accent-color") || "#f06292").trim();
  const gridColor =
    (styles.getPropertyValue("--border-color") || "#d0d7de").trim();

  ctx.font =
    '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;

  // Axes
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;
  const hours = hourlyChartState.hours.slice();
  const hasDetailed = hourlyChartState.hasDetailed;

  const maxCount = hours.reduce((max, v) => (v > max ? v : max), 0);
  hourlyChartState.points = [];

  if (!hasDetailed) {
    ctx.clearRect(0,0,width,height);
    if(tooltip)tooltip.classList.add("tooltip-hidden");
    return;
  }

  if (maxCount === 0) {
    ctx.fillStyle = axisColor;
    ctx.textAlign = "left";
    ctx.fillText(
      t("chart_daily_no_data", "No activity recorded today."),
      margin.left + 4,
      margin.top + 20
    );
    if (tooltip) {
      tooltip.classList.add("tooltip-hidden");
      tooltip.classList.remove("tooltip-visible");
    }
    return;
  }

  // Y-axis grid
  const yStep = Math.max(Math.ceil(maxCount / 4), 1);
  for (let v = 0; v <= maxCount; v += yStep) {
    const ratio = v / maxCount;
    const y = margin.top + (1 - ratio) * plotHeight;

    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();

    ctx.fillStyle = axisColor;
    ctx.fillText(String(v), margin.left - 4, y);
  }

  // X-axis ticks: 0, 6, 12, 18, 23
  const tickHours = [0, 6, 12, 18, 23];
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  tickHours.forEach((h) => {
    const ratio = 23 > 0 ? h / 23 : 0.5;
    const x = margin.left + ratio * plotWidth;
    const label = `${String(h).padStart(2, "0")}:00`;
    ctx.fillStyle = axisColor;
    ctx.fillText(label, x, height - margin.bottom + 4);
  });

  // Line
  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.6;

  hours.forEach((count, hour) => {
    const ratioX = 23 > 0 ? hour / 23 : 0.5;
    const x = margin.left + ratioX * plotWidth;
    const y = margin.top + (1 - count / maxCount) * plotHeight;

    hourlyChartState.points[hour] = { hour, x, y, value: count };

    if (hour === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Highlight point / vertical guide under hover
  const hoverIndex = hourlyChartState.hoverIndex;
  if (hoverIndex >= 0 && hourlyChartState.points[hoverIndex]) {
    const pt = hourlyChartState.points[hoverIndex];

    // vertical guide line
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = lineColor + "66";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, margin.top);
    ctx.lineTo(pt.x, height - margin.bottom);
    ctx.stroke();
    ctx.restore();

    // glow point
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = lineColor;
    ctx.beginPath();
    ctx.fillStyle = lineColor;
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // outer ring
    ctx.beginPath();
    ctx.strokeStyle = lineColor + "88";
    ctx.lineWidth = 2;
    ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function handleDailyChartHover(event, tooltip) {
  const canvas = hourlyChartState.canvas;
  if (!canvas || !tooltip) return;
  if (!hourlyChartState.hasDetailed) return;
  if (!hourlyChartState.points.length) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  
  
  const marginLeft = 32;
  const marginRight = 12;
  const plotWidth = rect.width - marginLeft - marginRight;

  if (plotWidth <= 0 || x < marginLeft || x > rect.width - marginRight) {
    if (hourlyChartState.hoverIndex !== -1) {
      hourlyChartState.hoverIndex = -1;
      renderDailyChart();
    }
    tooltip.classList.add("tooltip-hidden");
    tooltip.classList.remove("tooltip-visible");
    return;
  }

  let nearestIndex = -1;
  let minDx = Infinity;

  hourlyChartState.points.forEach((pt, index) => {
    if (!pt) return;
    const dx = Math.abs(pt.x - x);
    if (dx < minDx) {
      minDx = dx;
      nearestIndex = index;
    }
  });

  const stepX = 23 > 0 ? plotWidth / 23 : plotWidth;
  const thresholdX = stepX * 0.6; 

  if (nearestIndex === -1 || minDx > thresholdX) {
    if (hourlyChartState.hoverIndex !== -1) {
      hourlyChartState.hoverIndex = -1;
      renderDailyChart();
    }
    tooltip.classList.add("tooltip-hidden");
    tooltip.classList.remove("tooltip-visible");
    return;
  }

  if (nearestIndex !== hourlyChartState.hoverIndex) {
    hourlyChartState.hoverIndex = nearestIndex;
    renderDailyChart();
  }

  const pt = hourlyChartState.points[nearestIndex];
  if (!pt) return;

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;
  const range = formatHourRange(pt.hour);
  const unit = t("unit_prompt_suffix", " times");
  tooltip.textContent = `${range} · ${pt.value}${unit}`;

  tooltip = ensureFloatingTooltip(tooltip);

  tooltip.classList.remove("tooltip-hidden");
  tooltip.classList.add("tooltip-visible");

  placeTooltipNearPointer(tooltip, event.clientX, event.clientY, {
    gapX: 14,
    gapY: 14,
    pad: 10,
  });
  return;
}

function handleDailyChartLeave(tooltip) {
  if (!tooltip) return;
  hourlyChartState.hoverIndex = -1;
  renderDailyChart();
  tooltip.classList.add("tooltip-hidden");
  tooltip.classList.remove("tooltip-visible");
}

function formatHourRange(hour) {
  const start = String(hour).padStart(2, "0");
  const end = String(Math.min(hour + 1, 24)).padStart(2, "0");
  return `${start}:00–${end}:00`;
}

/* ---------- Weekly / monthly / weekday stats ---------- */

function renderWeeklyStats(weeklyTotals) {
  const list=document.getElementById('weeklyTotals'),avg=document.getElementById('weeklyAverage');if(!list||!avg)return;
  const entries=[...weeklyTotals.entries()].sort((a,b)=>a[0].localeCompare(b[0])).filter(([,total])=>total>0);
  renderSummaryColumns(list,entries.map(([key,total])=>({label:key.slice(5).replace('-','/'),full:key,total})), 'weekly');
  avg.textContent=entries.length?Math.round(entries.reduce((sum,[,n])=>sum+n,0)/entries.length)+GPTTrackerI18n.t('unit_per_week'):'—';
}

function getMonthShortName(index) {
  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;
  const keys = [
    "month_1_short",
    "month_2_short",
    "month_3_short",
    "month_4_short",
    "month_5_short",
    "month_6_short",
    "month_7_short",
    "month_8_short",
    "month_9_short",
    "month_10_short",
    "month_11_short",
    "month_12_short",
  ];
  const fallbacks = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return t(keys[index] || "", fallbacks[index] || "");
}

function renderMonthlyStats(year,monthlyTotals) {
  const list=document.getElementById('monthlyTotals'),avg=document.getElementById('monthlyAverage');if(!list)return;
  const now=new Date(),entries=Array.from({length:12},(_,month)=>({label:getMonthShortName(month),full:getMonthShortName(month)+' '+year,total:monthlyTotals.get(`${year}-${String(month+1).padStart(2,'0')}`)||0,current:year===now.getFullYear()&&month===now.getMonth()}));
  renderSummaryColumns(list,entries,'monthly');
  const active=entries.filter(x=>x.total>0);if(avg)avg.textContent=active.length?Math.round(active.reduce((sum,x)=>sum+x.total,0)/active.length)+GPTTrackerI18n.t('unit_per_month'):'—';
}

function renderBusiestWeekday(weekdayTotals) {
  const el = document.getElementById("busiestWeekday");
  if (!el) return;

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;
  const max = Math.max(...weekdayTotals);

  el.innerHTML = "";

  if (!max) {
    el.textContent = t("text_no_data", "No data available.");
    return;
  }

  const names = [
    t("weekday_mon", "Mon"),
    t("weekday_tue", "Tue"),
    t("weekday_wed", "Wed"),
    t("weekday_thu", "Thu"),
    t("weekday_fri", "Fri"),
    t("weekday_sat", "Sat"),
    t("weekday_sun", "Sun"),
  ];

  // align incoming totals to Mon-first ordering (data array is Sun-first)
  const entries = names.map((label, idx) => {
    const val = weekdayTotals[(idx + 1) % 7] || 0;
    return { label, value: val, idx };
  });

  const topSet = new Set(
    entries
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((item) => item.idx)
  );

  const container = document.createElement("div");
  container.className = "weekday-bars";

  entries.forEach((item) => {
    const row = document.createElement("div");
    row.className = "weekday-bar-row";
    row.classList.add(topSet.has(item.idx) ? "is-top" : "is-muted");

    const label = document.createElement("span");
    label.className = "weekday-label";
    label.textContent = item.label;

    const bar = document.createElement("div");
    bar.className = "weekday-bar";

    const fill = document.createElement("div");
    fill.className = "weekday-bar-fill";
    const widthPercent = max > 0 ? (item.value / max) * 100 : 0;
    fill.style.width = `${widthPercent}%`;
    bar.appendChild(fill);

    const value = document.createElement("span");
    value.className = "weekday-value";
    value.textContent = String(item.value);

    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(value);
    container.appendChild(row);
  });

  el.appendChild(container);
}/* ---------- Day detail modal ---------- */

let modalReturnFocus=null;
function initModal() {
  const overlay = document.getElementById("dayDetailOverlay");
  const closeBtn = document.getElementById("modalCloseBtn");
  if (!overlay || !closeBtn) return;

  closeBtn.addEventListener("click", hideModal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideModal();
  });

  document.addEventListener("keydown", (e) => {
    if(overlay.classList.contains('hidden'))return;
    if(e.key==='Tab'){e.preventDefault();closeBtn.focus();}
    if (e.key === "Escape") hideModal();
  });

  // init modal bar chart interactions
  initDayModalBarChartInteractions();
}

function handleDayClick(dateStr) {
  const entry = normalizeEntry(allData[dateStr]);
  showModalForDay(dateStr, entry);
}

function showModalForDay(dateStr, entry) {
  const overlay = document.getElementById("dayDetailOverlay");
  if (!overlay) return;

  const titleEl = document.getElementById("modalDateTitle");
  const countEl = document.getElementById("modalCountText");
  const summaryEl = document.getElementById("modalTimesSummary");

  const count = entry.count || 0;
  const timestamps = Array.isArray(entry.timestamps) ? entry.timestamps : [];

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  if (titleEl) titleEl.textContent = formatDateHuman(dateStr);

  if (countEl) {
    if (!count) {
      countEl.textContent = t("modal_no_usage", "No activity on this day.");
    } else {
      const unit = t("unit_prompt_suffix", " times");
      const suffix = t("modal_on_this_day", "On this day");
      countEl.textContent = `${count}${unit} ${suffix}`;
    }
  }

  // 3 buckets: Morning(0-8), Noon(8-16), Evening(16-24)
  let bins = [0, 0, 0];
  if (timestamps.length) {
    bins = summarizeTimeBuckets8h(timestamps);
  }

  if (summaryEl) {
    if (!count) {
      summaryEl.textContent = t(
        "modal_no_usage_detail",
        "No time-of-day details available."
      );
    } else if (!timestamps.length) {
      summaryEl.textContent = t(
        "modal_no_timestamps",
        "Only the total count was saved for this date. No timestamp details."
      );
    } else {
      const labels = [
        t("modal_bucket_morning", "Morning"),
        t("modal_bucket_noon", "Noon"),
        t("modal_bucket_evening", "Evening"),
      ];
      const maxVal = Math.max(...bins);
      if (maxVal === 0) {
        summaryEl.textContent = t("modal_even_usage", "Activity is evenly distributed.");
      } else {
        const topIndices = bins
          .map((v, i) => (v === maxVal ? i : -1))
          .filter((i) => i !== -1);
        const topLabels = topIndices.map((i) => labels[i]);
        const prefix = t("modal_peak_usage_prefix", "Peak period:");
        summaryEl.textContent = `${prefix}${topLabels.join(" / ")}`;
      }
    }
  }

  // animated bar chart
  renderDayTimeChart(bins, true);

  modalReturnFocus=document.activeElement;overlay.classList.remove("hidden");document.getElementById("modalCloseBtn").focus();
}

function hideModal() {
  const overlay = document.getElementById("dayDetailOverlay");
  if (overlay&&!overlay.classList.contains("hidden")){overlay.classList.add("hidden");modalReturnFocus?.focus();}

  // stop animation
  if (dayModalBarState.animFrameId != null) {
    cancelAnimationFrame(dayModalBarState.animFrameId);
    dayModalBarState.animFrameId = null;
  }

  // hide tooltip
  hideDayModalBarTooltip();
  dayModalBarState.hoverIndex = -1;
}

function summarizeTimeBuckets8h(timestamps) {
  // 3 buckets: Morning(0-8), Noon(8-16), Evening(16-24)
  const buckets = [0, 0, 0];
  timestamps.forEach((ts) => {
    const d = new Date(ts);
    const h = d.getHours();
    if (Number.isNaN(h)) return;
    if (h < 8) buckets[0]++;
    else if (h < 16) buckets[1]++;
    else buckets[2]++;
  });
  return buckets;
}

function initDayModalBarChartInteractions() {
  const canvas = document.getElementById("dayTimeChart");
  const tooltip = document.getElementById("dayTimeTooltip");
  if (!canvas || !tooltip) return;

  dayModalBarState.canvas = canvas;
  dayModalBarState.tooltip = tooltip;

  canvas.addEventListener("mousemove", handleDayModalBarHover);
  canvas.addEventListener("mouseleave", () => {
    dayModalBarState.hoverIndex = -1;
    hideDayModalBarTooltip();
    drawDayModalBarChart(dayModalBarState.animProgress || 1);
  });

  // keep tooltip floating even after window resize/scroll changes
  window.addEventListener("scroll", () => {
    if (dayModalBarState.tooltip) {
      // nothing to do; fixed tooltip stays in place
    }
  });
}

function renderDayTimeChart(bins, animate = true) {
  animate = animate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("dayTimeChart");
  if (!canvas) return;

  dayModalBarState.canvas = canvas;
  dayModalBarState.bins = Array.isArray(bins) ? bins.slice(0, 3) : [0, 0, 0];
  dayModalBarState.hoverIndex = -1;
  hideDayModalBarTooltip();

  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (dayModalBarState.animFrameId != null) {
      cancelAnimationFrame(dayModalBarState.animFrameId);
      dayModalBarState.animFrameId = null;
    }
    dayModalBarState.animProgress = 1;
    drawDayModalBarChart(1);
    return;
  }

  // start animation
  if (dayModalBarState.animFrameId != null) {
    cancelAnimationFrame(dayModalBarState.animFrameId);
    dayModalBarState.animFrameId = null;
  }

  dayModalBarState.animStart = performance.now();
  dayModalBarState.animProgress = 0;

  const tick = (now) => {
    const elapsed = now - dayModalBarState.animStart;
    const t = Math.min(elapsed / dayModalBarState.duration, 1);
    const eased = easeOutCubic(t);
    dayModalBarState.animProgress = eased;
    drawDayModalBarChart(eased);

    if (t < 1) {
      dayModalBarState.animFrameId = requestAnimationFrame(tick);
    } else {
      dayModalBarState.animFrameId = null;
    }
  };

  dayModalBarState.animFrameId = requestAnimationFrame(tick);
}

function drawDayModalBarChart(progress) {
  const canvas = dayModalBarState.canvas;
  if (!canvas) return;

  const { ctx, width, height } = getCanvasContext(canvas);
  ctx.clearRect(0, 0, width, height);

  const bins = dayModalBarState.bins || [0, 0, 0];

  const margin = { top: 10, right: 10, bottom: 28, left: 30 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const styles = getComputedStyle(document.body);
  const axisColor =
    (styles.getPropertyValue("--muted-text-color") || "#656d76").trim();
  const barColor =
    (styles.getPropertyValue("--accent-color") || "#f06292").trim();

  const tFn = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  const labels = [
    tFn("modal_bucket_morning", "Morning"),
    tFn("modal_bucket_noon", "Noon"),
    tFn("modal_bucket_evening", "Evening"),
  ];

  const maxVal = Math.max(...bins, 1);
  const slotWidth = plotWidth / 3;
  const barWidth = slotWidth * 0.58;

  // Axes
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();

  // Y ticks: 0 and max
  ctx.font =
    '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = axisColor;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("0", margin.left - 4, height - margin.bottom);
  ctx.fillText(String(maxVal), margin.left - 4, margin.top);

  // Bars + hitboxes
  dayModalBarState.barRects = [];
  for (let i = 0; i < 3; i++) {
    const value = bins[i] || 0;
    const xCenter = margin.left + slotWidth * i + slotWidth / 2;
    const targetH = (value / maxVal) * (plotHeight - 4);
    const h = targetH * Math.max(0, Math.min(progress, 1));

    const x = xCenter - barWidth / 2;
    const y = height - margin.bottom - h;

    const isHover = dayModalBarState.hoverIndex === i;

    // bar
    ctx.save();
    if (isHover) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = barColor;
      ctx.globalAlpha = 1.0;
    } else {
      ctx.shadowBlur = 0;
      ctx.globalAlpha =
        dayModalBarState.hoverIndex !== -1 ? 0.75 : 1.0;
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(x, y, barWidth, h);
    ctx.restore();

    dayModalBarState.barRects[i] = { x, y, w: barWidth, h, value };

    // x labels
    ctx.fillStyle = axisColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(labels[i], xCenter, height - margin.bottom + 6);
  }
}

function handleDayModalBarHover(event) {
  const canvas = dayModalBarState.canvas;
  let tooltip = dayModalBarState.tooltip;
  if (!canvas || !tooltip) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const bars = dayModalBarState.barRects || [];
  let hit = -1;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!b) continue;
    // if value=0, keep it non-hoverable (same as your current behavior)
    if (b.h <= 0) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      hit = i;
      break;
    }
  }

  if (hit === -1) {
    if (dayModalBarState.hoverIndex !== -1) {
      dayModalBarState.hoverIndex = -1;
      drawDayModalBarChart(dayModalBarState.animProgress || 1);
    }
    hideDayModalBarTooltip();
    return;
  }

  if (hit !== dayModalBarState.hoverIndex) {
    dayModalBarState.hoverIndex = hit;
    drawDayModalBarChart(dayModalBarState.animProgress || 1);
  }

  const value =
    bars[hit] && typeof bars[hit].value === "number" ? bars[hit].value : 0;

  // ---- Build tooltip text via i18n (no hardcoded prompt) ----
  const tFn = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  const labelKeys = [
    "modal_bucket_morning",
    "modal_bucket_noon",
    "modal_bucket_evening",
  ];
  const rangeKeys = [
    "modal_bucket_morning_range",
    "modal_bucket_noon_range",
    "modal_bucket_evening_range",
  ];

  const label = tFn(labelKeys[hit], "");
  const range = tFn(rangeKeys[hit], "");
  const unit = tFn("unit_prompt_suffix", " times");

  const template = tFn(
    "modal_bucket_tooltip",
    "{label} · {range} · {count}{unit}"
  );

  // Use textContent (not innerHTML) for safety and to keep it simple
  tooltip.textContent = template
    .replace("{label}", label)
    .replace("{range}", range)
    .replace("{count}", String(value))
    .replace("{unit}", unit);

  // ---- Make tooltip floating on <body>, so it won't be clipped ----
  tooltip = ensureFloatingTooltip(tooltip);
  dayModalBarState.tooltip = tooltip;

  // Show + position (fixed, viewport-based)
  tooltip.classList.remove("tooltip-hidden");
  tooltip.classList.add("tooltip-visible");
  placeTooltipNearBar(tooltip, canvas, bars[hit]);

}

function ensureFloatingTooltip(tooltip) {
  if (!tooltip) return null;

  if (!tooltip.classList.contains("tooltip-floating")) {
    // Move tooltip to <body> so it won't be clipped by modal / containers
    document.body.appendChild(tooltip);
    tooltip.classList.add("tooltip-floating");
  }

  tooltip.style.right = "auto";
  tooltip.style.bottom = "auto";
  tooltip.style.transform = "translate(0, 0)";

  return tooltip;
}

function placeTooltipNearBar(tooltip, canvas, barRect) {
  if (!tooltip || !canvas || !barRect) return;

  const pad = 10;
  const gap = 12;

  const canvasRect = canvas.getBoundingClientRect();


  const barLeft = canvasRect.left + barRect.x;
  const barRight = barLeft + barRect.w;
  const barTop = canvasRect.top + barRect.y;
  const barBottom = barTop + barRect.h;


  let left = barRight + gap;
  let top = (barTop + barBottom) / 2;


  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  const tw = tooltip.offsetWidth || 0;
  const th = tooltip.offsetHeight || 0;


  top = top - th / 2;

  const vw = window.innerWidth;
  const vh = window.innerHeight;


  if (left + tw + pad > vw) {
    left = barLeft - gap - tw;
  }


  left = Math.max(pad, Math.min(left, vw - tw - pad));


  top = Math.max(pad, Math.min(top, vh - th - pad));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function placeTooltipNearPointer(tooltip, clientX, clientY, opts = {}) {
  if (!tooltip) return;

  const pad = typeof opts.pad === "number" ? opts.pad : 10;
  const gapX = typeof opts.gapX === "number" ? opts.gapX : 14;
  const gapY = typeof opts.gapY === "number" ? opts.gapY : 14;

  // ensure fixed + reset legacy positioning every time
  tooltip = ensureFloatingTooltip(tooltip);


  let left = clientX + gapX;
  let top = clientY + gapY;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  const tw = tooltip.offsetWidth || 0;
  const th = tooltip.offsetHeight || 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;


  if (left + tw + pad > vw) {
    left = clientX - gapX - tw;
  }

  if (top + th + pad > vh) {
    top = clientY - gapY - th;
  }


  left = Math.max(pad, Math.min(left, vw - tw - pad));
  top = Math.max(pad, Math.min(top, vh - th - pad));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideDayModalBarTooltip() {
  const tooltip =
    dayModalBarState.tooltip || document.getElementById("dayTimeTooltip");
  if (!tooltip) return;
  tooltip.classList.add("tooltip-hidden");
  tooltip.classList.remove("tooltip-visible");
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}


function formatDateHuman(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;

  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  const weekdays = [
    t("weekday_sun", "Sun"),
    t("weekday_mon", "Mon"),
    t("weekday_tue", "Tue"),
    t("weekday_wed", "Wed"),
    t("weekday_thu", "Thu"),
    t("weekday_fri", "Fri"),
    t("weekday_sat", "Sat"),
  ];

  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const weekday = weekdays[d.getDay()];

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )} (${weekday})`;
}

/* ---------- Theme + import/export ---------- */

function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const stored = localStorage.getItem("gptTrackerTheme");
  const effective = stored || (prefersDark ? "dark" : "light");

  applyTheme(effective);

  btn.addEventListener("click", () => {
    const isDark = !document.body.classList.contains("dark");
    applyTheme(isDark ? "dark" : "light");
  });
}

function applyTheme(theme) {
  const btn = document.getElementById("themeToggle");
  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  if (theme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
    theme = "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("gptTrackerTheme", theme);

  if (btn) {
    // iOS-style switch: drive visuals via aria-checked, do NOT render emoji text.
    btn.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    btn.textContent = "";
    btn.title =
      theme === "dark"
        ? t("tooltip_switch_to_light", "Switch to light mode")
        : t("tooltip_switch_to_dark", "Switch to dark mode");
  }

  if (timeDistributionState.segments.length > 0) {
    const colors=getComputedStyle(document.body);
    for(const segment of timeDistributionState.segments)segment.color=colors.getPropertyValue('--sakura-'+(segment.bucketIndex+1)).trim();
    drawPieSegments();
  }
  if (hourlyChartState.canvas) {
    renderDailyChart();
  }
  document.dispatchEvent(new CustomEvent("gpt-theme-changed", { detail: { theme } }));
}

function initExportImport() {
  const exportBtn = document.getElementById("exportData");
  const importBtn = document.getElementById("importData");
  const input = document.getElementById("importFileInput");
  exportBtn.addEventListener('click',()=>GPTFeedback.run(exportBtn,async()=>{
    const result=await chrome.runtime.sendMessage({type:'UG_EXPORT'});if(!result.ok)throw Error();
    const url=URL.createObjectURL(new Blob([JSON.stringify(result.payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='sakurameter-activity-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    GPTFeedback.status(GPTTrackerI18n.t('u_backup'));
  },'u_export_error'));
  importBtn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    const t = GPTTrackerI18n.t;importBtn.disabled=true;importBtn.setAttribute("aria-busy","true");
    try {
      if (file.size > 10 * 1024 * 1024) throw Error("file_too_large");
      const result = await chrome.runtime.sendMessage({type:"UG_IMPORT",payload:JSON.parse(await file.text())});
      if (!result.ok) throw Error("invalid_activity_backup");
      allData = await getStorageData(); buildYearOptions();
      renderCalendar(currentYear); updateDailyChartForToday(); updateTimeDistribution();
      GPTFeedback.status(t("u_imported"));
    } catch { GPTFeedback.status(t("u_import_error"),true); }
    finally { input.value = "";importBtn.disabled=false;importBtn.removeAttribute("aria-busy"); }
  });
}

/* ---------- Time distribution pie chart ---------- */

function initPieChart() {
  const canvas = document.getElementById("timePieChart");
  if (!canvas) return;
  timeDistributionState.canvas = canvas;

  canvas.addEventListener("mousemove", handlePieMouseMove);
  canvas.addEventListener("mouseleave", handlePieMouseLeave);
}

function updateTimeDistribution() {
  const canvas = timeDistributionState.canvas;
  const emptyEl = document.getElementById("timeDistributionEmpty");
  if (!canvas || !emptyEl) return;

  const counts = new Array(TIME_BUCKETS.length).fill(0);

  Object.entries(allData).forEach(([dateStr, raw]) => {
    if (!isDateKey(dateStr)||dateStr>toISODate(new Date())) return;
    const entry = normalizeEntry(raw);
    const timestamps = Array.isArray(entry.timestamps)
      ? entry.timestamps
      : [];
    timestamps.forEach((ts) => {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())||ts>Date.now()) return;
      const hour = d.getHours();
      if (hour < 0 || hour >= 24) return;
      const idx = getTimeBucketIndex(hour);
      if (idx !== -1) counts[idx]++;
    });
  });

  const total = counts.reduce((sum, v) => sum + v, 0);
  const section=document.getElementById('timeDistributionSection'),legend=document.getElementById('distributionLegend');
  section.classList.toggle('is-empty',!total);legend.replaceChildren();
  if(total){
    for(let i=0;i<counts.length;i++){
      const item=document.createElement('li'),swatch=document.createElement('i'),label=document.createElement('span'),value=document.createElement('strong');
      swatch.style.background=`var(--sakura-${i+1})`;swatch.setAttribute('aria-hidden','true');
      label.textContent=GPTTrackerI18n.t(TIME_BUCKETS[i].labelKey)+' · '+GPTTrackerI18n.t(TIME_BUCKETS[i].rangeKey);
      value.textContent=GPTTrackerI18n.t('distribution_count').replace('{n}',counts[i]).replace('{pct}',Math.round(counts[i]/total*100));
      item.append(swatch,label,value);legend.append(item);
    }
  }
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',GPTTrackerI18n.t('distribution_unit')+': '+total);
  if (!total) {
    const { ctx, width, height } = getCanvasContext(canvas);
    ctx.clearRect(0, 0, width, height);
    emptyEl.style.display = "block";

    timeDistributionState.segments = [];
    timeDistributionState.total = 0;
    timeDistributionState.hoverIndex = -1;
    if (timeDistributionState.animationFrameId != null) {
      cancelAnimationFrame(timeDistributionState.animationFrameId);
      timeDistributionState.animationFrameId = null;
    }

    const tooltip = document.getElementById("pieTooltip");
    if (tooltip) {
      tooltip.classList.add("tooltip-hidden");
      tooltip.classList.remove("tooltip-visible");
    }
    return;
  }

  emptyEl.style.display = "none";

  renderTimeDistributionPie(counts, total);
}

function getTimeBucketIndex(hour) {
  for (let i = 0; i < TIME_BUCKETS.length; i++) {
    const bucket = TIME_BUCKETS[i];
    if (hour >= bucket.startHour && hour < bucket.endHour) return i;
  }
  return -1;
}

function renderTimeDistributionPie(counts, total) {
  const canvas = timeDistributionState.canvas;
  if (!canvas) return;

  const { ctx, width, height } = getCanvasContext(canvas);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.body);


  const centerX = width / 2;
  const centerY = height / 2;

  const baseVisualSize = Math.min(canvas.clientWidth, canvas.clientHeight);
  const radius = baseVisualSize * 0.42;
  const innerRadius = radius * .55;

  timeDistributionState.centerX = centerX;
  timeDistributionState.centerY = centerY;
  timeDistributionState.radius = radius;
  timeDistributionState.innerRadius = innerRadius;
  timeDistributionState.total = total;
  timeDistributionState.segments = [];
  timeDistributionState.hoverIndex = -1;

  let startAngle = -Math.PI / 2;
  const sakura = [
    styles.getPropertyValue("--sakura-1").trim(),
    styles.getPropertyValue("--sakura-2").trim(),
    styles.getPropertyValue("--sakura-3").trim(),
    styles.getPropertyValue("--sakura-4").trim(),
    styles.getPropertyValue("--sakura-5").trim(),
    styles.getPropertyValue("--sakura-6").trim(),
  ];

  for (let i = 0; i < counts.length; i++) {
    const value = counts[i];
    if (value <= 0) continue;

    const fraction = value / total;
    const angle = fraction * Math.PI * 2;
    const endAngle = startAngle + angle;

    timeDistributionState.segments.push({
      bucketIndex: i,
      startAngle,
      endAngle,
      value,
      color: sakura[i % sakura.length],
      offset: 0,
      targetOffset: 0,
      scale: 1,
      targetScale: 1,
    });

    startAngle = endAngle;
  }

  startPieAnimation();
}

function startPieAnimation() {
  const canvas = timeDistributionState.canvas;
  if (!canvas || !canvas.offsetWidth) return;
  if (timeDistributionState.animationFrameId != null) cancelAnimationFrame(timeDistributionState.animationFrameId);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    for (const seg of timeDistributionState.segments) { seg.offset = seg.targetOffset; seg.scale = seg.targetScale; }
    drawPieSegments(); timeDistributionState.animationFrameId = null; return;
  }
  const loop = () => {
    if (!canvas.offsetWidth || document.hidden) {timeDistributionState.animationFrameId = null; return;}
    drawPieSegments();
    const moving = timeDistributionState.segments.some(seg => Math.abs(seg.offset-seg.targetOffset)>0.02 || Math.abs(seg.scale-seg.targetScale)>0.001);
    timeDistributionState.animationFrameId = moving ? requestAnimationFrame(loop) : null;
  };
  loop();
}

function drawPieSegments() {
  const canvas = timeDistributionState.canvas;
  if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return;

  const segments = timeDistributionState.segments;
  if (!segments.length) {
    const { ctx, width, height } = getCanvasContext(canvas);
    ctx.clearRect(0, 0, width, height);
    return;
  }

  const { ctx, width, height } = getCanvasContext(canvas);
  ctx.clearRect(0, 0, width, height);

  const centerX = timeDistributionState.centerX || width / 2;
  const centerY = timeDistributionState.centerY || height / 2;

  const baseRadius =
    timeDistributionState.radius || Math.min(width, height) / 2 - 24;
  const baseInnerRadius =
    timeDistributionState.innerRadius || baseRadius * 0.55;

  const styles = getComputedStyle(document.body);
  const textColor =
    (styles.getPropertyValue("--text-color") || "#ffffff").trim();

  const hoverIndex = timeDistributionState.hoverIndex;

  segments.forEach((seg, index) => {
    seg.offset += (seg.targetOffset - seg.offset) * 0.18;
    seg.scale += (seg.targetScale - seg.scale) * 0.18;



    const extraR = seg.offset;

    const outerR = baseRadius * seg.scale + extraR;
    const innerR = baseInnerRadius * seg.scale;

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerR, seg.startAngle, seg.endAngle);
    ctx.arc(centerX, centerY, innerR, seg.endAngle, seg.startAngle, true);
    ctx.closePath();

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = seg.color;

    ctx.globalAlpha = hoverIndex !== -1 && hoverIndex !== index ? 0.6 : 1.0;

    ctx.fillStyle = seg.color+"aa";
    ctx.fill();
    ctx.restore();
  });



  const total = timeDistributionState.total || 0;
  const sakura3 = (styles.getPropertyValue("--sakura-3") || "#F48FB1").trim();


  const fontSize = Math.max(18, timeDistributionState.radius * 0.22);

  const isDark = document.body.classList.contains("dark");

  ctx.save();
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";


  ctx.shadowColor = sakura3;
  ctx.shadowBlur = fontSize * .55;
  ctx.fillStyle = isDark?sakura3:textColor;
  ctx.fillText(String(total), centerX, centerY-12);
  ctx.shadowBlur = 0;
  ctx.font = '12px system-ui';
  ctx.fillStyle = textColor;
  ctx.fillText(GPTTrackerI18n.t('distribution_unit'),centerX,centerY+25);

  ctx.restore();
}

function handlePieMouseMove(event) {
  startPieAnimation();
  const canvas = timeDistributionState.canvas;
  if (!canvas) return;
  if (!timeDistributionState.segments.length) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const dx = x - timeDistributionState.centerX;
  const dy = y - timeDistributionState.centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const radius = timeDistributionState.radius;
  const innerRadius = timeDistributionState.innerRadius;
  const outerLimit = radius * 1.25;


  if (distance < innerRadius || distance > outerLimit) {
    if (timeDistributionState.hoverIndex !== -1) {
      timeDistributionState.hoverIndex = -1;
      timeDistributionState.segments.forEach((seg) => {
        seg.targetOffset = 0;
        seg.targetScale = 1;
      });
    }
    hidePieTooltip();
    return;
  }

  let angle = Math.atan2(dy, dx); // [-PI, PI]
  if (angle < -Math.PI / 2) {
    angle += 2 * Math.PI;
  }

  let foundIndex = -1;
  timeDistributionState.segments.forEach((seg, index) => {
    if (angle >= seg.startAngle && angle <= seg.endAngle) {
      foundIndex = index;
    }
  });

  if (foundIndex === -1) {
    if (timeDistributionState.hoverIndex !== -1) {
      timeDistributionState.hoverIndex = -1;
      timeDistributionState.segments.forEach((seg) => {
        seg.targetOffset = 0;
        seg.targetScale = 1;
      });
    }
    hidePieTooltip();
    return;
  }

  if (foundIndex !== timeDistributionState.hoverIndex) {
    timeDistributionState.hoverIndex = foundIndex;
    timeDistributionState.segments.forEach((seg, index) => {
      if (index === foundIndex) {
        seg.targetOffset = 16;
        seg.targetScale = 1.1;
      } else {
        seg.targetOffset = 0;
        seg.targetScale = 0.92;
      }
    });
  }

  startPieAnimation();
  showPieTooltip(foundIndex, event.clientX, event.clientY);
}

function handlePieMouseLeave() {
  if (timeDistributionState.hoverIndex !== -1) {
    timeDistributionState.hoverIndex = -1;
    timeDistributionState.segments.forEach((seg) => {
      seg.targetOffset = 0;
      seg.targetScale = 1;
    });
    startPieAnimation();
  }
  hidePieTooltip();
}

function showPieTooltip(index, clientX, clientY) {
  let tooltip = document.getElementById("pieTooltip");
  if (!tooltip) return;

  const seg = timeDistributionState.segments[index];
  if (!seg) return;

  const bucket = TIME_BUCKETS[seg.bucketIndex];
  const t = window.GPTTrackerI18n ? window.GPTTrackerI18n.t : (k, f) => f || k;

  const label = t(bucket.labelKey, bucket.id);
  const range = t(bucket.rangeKey, "");
  const desc = t(bucket.descKey, "");
  const unit = t("unit_prompt_suffix", " times");
  const total = timeDistributionState.total || 1;
  const pct = ((seg.value / total) * 100).toFixed(1);

  tooltip.innerHTML = `
    <div class="tooltip-title">${label}</div>
    <div class="tooltip-range">${range}</div>
    <div class="tooltip-desc">${desc}</div>
    <div class="tooltip-metric">${seg.value}${unit} · ${pct}%</div>
  `;
  tooltip = ensureFloatingTooltip(tooltip);

  tooltip.classList.remove("tooltip-hidden");
  tooltip.classList.add("tooltip-visible");

  placeTooltipNearPointer(tooltip, clientX, clientY, {
    gapX: 14,
    gapY: 14,
    pad: 10,
  });

}

function hidePieTooltip() {
  const tooltip = document.getElementById("pieTooltip");
  if (!tooltip) return;
  tooltip.classList.add("tooltip-hidden");
  tooltip.classList.remove("tooltip-visible");
}
