#!/usr/bin/env node
/**
 * cc-streak — Claude Code activity streak counter
 * Shows your current streak, longest streak, and burnout warnings.
 * Like GitHub streak but for Claude Code sessions.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');

if (helpFlag) {
  console.log(`
  cc-streak — Claude Code activity streak counter

  Usage:
    cc-streak [options]

  Options:
    --json    Print raw JSON data
    --help    Show this help

  Shows:
    ▸ Current active streak (consecutive days with CC sessions)
    ▸ Longest streak ever
    ▸ Rest days (days with no activity)
    ▸ Burnout warnings (30+ days without a break)

  Data source: cc-session-stats (reads ~/.claude/projects/)
  `);
  process.exit(0);
}

// ── Load session stats ────────────────────────────────────────────────────────
function loadSessionData() {
  const paths = [
    [join(HOME, 'bin', 'cc-session-stats'), ['--json']],
    ['node', [join(HOME, 'projects', 'cc-loop', 'cc-session-stats', 'cli.mjs'), '--json']],
  ];
  for (const [cmd, cmdArgs] of paths) {
    try {
      const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', timeout: 30000 });
      const json = JSON.parse(out);
      if (json.byDate || json.dates || json.activeDates) return json;
    } catch {}
  }
  return null;
}

// Try cc-agent-load as fallback (also has byDate)
function loadAgentLoadData() {
  const paths = [
    [join(HOME, 'bin', 'cc-agent-load'), ['--json']],
    ['node', [join(HOME, 'projects', 'cc-loop', 'cc-agent-load', 'cli.mjs'), '--json']],
  ];
  for (const [cmd, cmdArgs] of paths) {
    try {
      const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', timeout: 30000 });
      const json = JSON.parse(out);
      if (json.byDate && Object.keys(json.byDate).length > 0) return json;
    } catch {}
  }
  return null;
}

// ── Compute streak stats ──────────────────────────────────────────────────────
function computeStreaks(byDate) {
  // Get all active dates sorted
  const activeDates = Object.keys(byDate)
    .filter(d => {
      const v = byDate[d];
      // Active = any usage (main or sub > 0)
      const hours = typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : v;
      return hours > 0;
    })
    .sort();

  if (activeDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0, totalRestDays: 0, lastActive: null, lastRest: null, streaks: [] };
  }

  // Use local timezone date (not UTC) to match cc-agent-load's date grouping
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - now.getTimezoneOffset() * 60000 - 86400000).toISOString().slice(0, 10);

  // Find all streaks
  const streaks = [];
  let currentStreakStart = activeDates[0];
  let currentStreakLen = 1;
  let prev = activeDates[0];

  for (let i = 1; i < activeDates.length; i++) {
    const cur = activeDates[i];
    const prevDate = new Date(prev);
    const curDate = new Date(cur);
    const diffDays = (curDate - prevDate) / 86400000;

    if (diffDays === 1) {
      // Consecutive day
      currentStreakLen++;
    } else {
      // Gap — save current streak
      streaks.push({ start: currentStreakStart, end: prev, length: currentStreakLen });
      currentStreakStart = cur;
      currentStreakLen = 1;
    }
    prev = cur;
  }
  streaks.push({ start: currentStreakStart, end: prev, length: currentStreakLen });

  // Check if current streak includes today or yesterday (still ongoing)
  const lastStreak = streaks[streaks.length - 1];
  const isOngoing = lastStreak.end === today || lastStreak.end === yesterday;
  const currentStreak = isOngoing ? lastStreak.length : 0;

  const longestStreak = Math.max(...streaks.map(s => s.length));

  // Rest days: days between first active and today with no sessions
  const firstDate = new Date(activeDates[0]);
  const todayDate = new Date(today);
  const todayDateObj = parseDateLocal(today);
  const firstDateObj = parseDateLocal(activeDates[0]);
  const totalSpan = Math.round((todayDateObj - firstDateObj) / 86400000) + 1;
  // Remove duplicate declaration above
  const totalRestDays = totalSpan - activeDates.length;
  const lastRest = findLastRestDay(activeDates, today);

  return {
    currentStreak,
    longestStreak,
    totalActiveDays: activeDates.length,
    totalRestDays,
    lastActive: activeDates[activeDates.length - 1],
    lastRest,
    streaks,
    isOngoing,
    firstActive: activeDates[0],
  };
}

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function parseDateLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function findLastRestDay(activeDates, today) {
  const activeSet = new Set(activeDates);
  const todayDate = parseDateLocal(today);
  const firstDate = parseDateLocal(activeDates[0]);

  for (let cur = new Date(todayDate); cur >= firstDate; cur.setDate(cur.getDate() - 1)) {
    const ds = toLocalDateStr(cur);
    if (!activeSet.has(ds)) return ds;
  }
  return null;
}

// ── ANSI colors ───────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  red: '\x1b[91m',
  orange: '\x1b[33m',
  gray: '\x1b[90m',
};

// ── Streak visualizer (last 26 weeks as flame dots) ───────────────────────────
function renderStreakBar(byDate, width = 52) {
  const today = new Date();
  const cells = [];

  for (let i = width - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const v = byDate[ds];
    const hours = v ? (typeof v === 'object' ? (v.main || 0) + (v.sub || 0) : v) : 0;

    if (hours === 0) cells.push({ char: '·', color: C.gray });
    else if (hours < 1) cells.push({ char: '▪', color: C.cyan });
    else if (hours < 4) cells.push({ char: '▪', color: C.yellow });
    else cells.push({ char: '▪', color: C.orange });
  }

  return cells.map(c => `${c.color}${c.char}${C.reset}`).join('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
let data = loadAgentLoadData();
if (!data) {
  // Try cc-session-stats
  data = loadSessionData();
}

if (!data || !data.byDate) {
  console.error('Error: Could not load session data.');
  console.error('Make sure cc-agent-load is installed: npm i -g cc-agent-load');
  process.exit(1);
}

const stats = computeStreaks(data.byDate);
const now = new Date();
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Burnout detection
const daysSinceRest = stats.lastRest
  ? Math.round((parseDateLocal(today) - parseDateLocal(stats.lastRest)) / 86400000)
  : stats.totalActiveDays;

const burnoutLevel = daysSinceRest >= 60 ? 3 : daysSinceRest >= 30 ? 2 : daysSinceRest >= 14 ? 1 : 0;

if (jsonFlag) {
  console.log(JSON.stringify({
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    totalActiveDays: stats.totalActiveDays,
    totalRestDays: stats.totalRestDays,
    lastActive: stats.lastActive,
    lastRest: stats.lastRest,
    daysSinceRest,
    burnoutLevel,
    firstActive: stats.firstActive,
    streaks: stats.streaks,
  }, null, 2));
  process.exit(0);
}

// ── Terminal output ───────────────────────────────────────────────────────────
const streakEmoji = stats.currentStreak >= 30 ? '🔥' : stats.currentStreak >= 7 ? '⚡' : stats.currentStreak >= 1 ? '✨' : '💤';
const streakColor = stats.currentStreak >= 30 ? C.orange : stats.currentStreak >= 7 ? C.yellow : stats.currentStreak >= 1 ? C.cyan : C.gray;

console.log('');
console.log(`  ${C.bold}cc-streak${C.reset}`);
console.log(`  ${'─'.repeat(48)}`);
console.log('');
console.log(`  ${streakEmoji}  Current streak: ${streakColor}${C.bold}${stats.currentStreak} days${C.reset}`);
console.log(`  🏆  Longest streak: ${C.yellow}${stats.longestStreak} days${C.reset}`);
console.log('');
console.log(`  Active days: ${C.cyan}${stats.totalActiveDays}${C.reset}  Rest days: ${C.gray}${stats.totalRestDays}${C.reset}`);
if (stats.lastRest) {
  console.log(`  Last rest day: ${C.gray}${stats.lastRest}${C.reset}  (${daysSinceRest} days ago)`);
} else {
  console.log(`  ${C.red}No rest days recorded${C.reset}`);
}
console.log('');

// Streak bar
if (data.byDate) {
  console.log(`  Last 52 days:`);
  console.log(`  ${renderStreakBar(data.byDate, 52)}`);
  console.log(`  ${C.gray}· = no activity  ▪ = active${C.reset}`);
  console.log('');
}

// Burnout warnings
if (burnoutLevel >= 3) {
  console.log(`  ${C.red}${C.bold}⚠ BURNOUT RISK: ${daysSinceRest} days without a break${C.reset}`);
  console.log(`  ${C.red}  Seriously. Take a day off. Your AI will manage.${C.reset}`);
} else if (burnoutLevel >= 2) {
  console.log(`  ${C.orange}${C.bold}⚠ ${daysSinceRest} days without a break.${C.reset}`);
  console.log(`  ${C.orange}  Consider scheduling a rest day.${C.reset}`);
} else if (burnoutLevel >= 1) {
  console.log(`  ${C.yellow}ℹ ${daysSinceRest} days since last rest day.${C.reset}`);
}

console.log('');
