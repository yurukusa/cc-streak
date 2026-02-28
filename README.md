# cc-streak

Claude Code activity streak counter. Like GitHub streak, but for your AI sessions.

Shows your current streak, longest streak, and warns when you haven't taken a break in a while.

## Usage

```bash
npx cc-streak
npx cc-streak --json    # raw JSON output
```

## Output

```
  cc-streak
  ────────────────────────────────────────────────

  🔥  Current streak: 36 days
  🏆  Longest streak: 36 days

  Active days: 48  Rest days: 3
  Last rest day: 2026-01-24  (36 days ago)

  Last 52 days:
  ··▪▪▪▪▪▪▪·▪▪▪▪▪··▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪
  · = no activity  ▪ = active

  ⚠ 36 days without a break.
     Consider scheduling a rest day.
```

The streak bar shows the last 52 days of activity with intensity levels (cyan → yellow → orange = light → medium → heavy usage).

## Burnout warnings

| Days without rest | Warning |
|---|---|
| 14+ days | ℹ info notice |
| 30+ days | ⚠ Consider a rest day |
| 60+ days | ⚠ BURNOUT RISK — take a day off |

## Requirements

- Node.js 18+
- [`cc-agent-load`](https://www.npmjs.com/package/cc-agent-load) installed globally or in PATH

## Part of cc-toolkit

This tool is part of the [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) collection of Claude Code utilities.

**Zero dependencies. No data sent anywhere. Runs entirely local.**
