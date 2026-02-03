# Token Usage Monitoring

OpenClaw provides comprehensive token usage monitoring to help you track and analyze AI model consumption across all providers.

## Overview

The token monitoring system automatically tracks:
- Token usage (input, output, cache reads/writes)
- Cost estimates
- Usage by provider and model
- Hourly and daily aggregations
- Request counts

## Automatic Tracking

Token usage is automatically recorded whenever you interact with AI models through OpenClaw. No additional configuration is required.

## CLI Commands

### View Summary

Display a summary of token usage:

```bash
openclaw token-monitor summary
```

Options:
- `-d, --days <number>` - Number of days to include (default: 30)
- `-r, --refresh` - Force refresh summary from raw data
- `--hourly` - Show hourly breakdown
- `-p, --provider <provider>` - Filter by specific provider

Examples:

```bash
# View last 7 days
openclaw token-monitor summary -d 7

# View with hourly breakdown
openclaw token-monitor summary --hourly

# View specific provider
openclaw token-monitor summary -p anthropic
```

### View Detailed Statistics

Show detailed statistics with hourly breakdown:

```bash
openclaw token-monitor stats
```

Options:
- `-d, --days <number>` - Number of days to include (default: 7)
- `-p, --provider <provider>` - Filter by provider
- `-m, --model <model>` - Filter by model

Examples:

```bash
# Last 7 days statistics
openclaw token-monitor stats

# Specific provider and model
openclaw token-monitor stats -p openai -m gpt-4
```

### View Raw Events

Display raw token usage events:

```bash
openclaw token-monitor events
```

Options:
- `-d, --days <number>` - Number of days to include (default: 1)
- `-p, --provider <provider>` - Filter by provider
- `-m, --model <model>` - Filter by model
- `-l, --limit <number>` - Maximum number of events to show (default: 20)

Examples:

```bash
# Last 24 hours events
openclaw token-monitor events

# Last 50 events from Anthropic
openclaw token-monitor events -p anthropic -l 50
```

### Reset Monitor Data

Clear token usage monitoring data:

```bash
openclaw token-monitor reset
```

Options:
- `-k, --keep-days <number>` - Keep data for the last N days
- `-y, --yes` - Skip confirmation

Examples:

```bash
# Clear all data (with confirmation)
openclaw token-monitor reset

# Keep last 30 days
openclaw token-monitor reset -k 30

# Clear without confirmation
openclaw token-monitor reset -y
```

## Summary Report Structure

The summary report includes:

### 📊 Total Usage
- Input tokens
- Output tokens
- Cache read/write tokens
- Total tokens
- Estimated cost
- Request count

### 🔧 Usage by Provider
- Breakdown by AI provider (Anthropic, OpenAI, etc.)
- Percentage of total usage
- Top models per provider

### 🏆 Top Models (Overall)
- Ranked list of most-used models
- Token counts and costs

### 📅 Daily Usage
- Last 7 days of usage
- Tokens, cost, and request counts per day

### ⏰ Hourly Usage (with --hourly flag)
- Recent hourly usage data
- Useful for identifying peak usage times

## Data Storage

Token usage data is stored in:
- `~/.openclaw/data/token-monitor.jsonl` - Raw event data
- `~/.openclaw/data/token-monitor-summary.json` - Cached summary

## Cost Estimation

Costs are estimated based on:
1. Model-specific pricing configurations
2. Token counts (input, output, cache operations)
3. Provider pricing tiers

Cost estimates are approximate and should be verified against actual provider billing.

## Programmatic Access

You can also access token monitoring programmatically:

```typescript
import {
  recordTokenUsage,
  loadTokenUsageSummary,
  generateTokenMonitorSummary,
  readTokenUsageEvents,
} from "openclaw/infra/token-monitor";

// Load cached summary
const summary = await loadTokenUsageSummary();

// Generate fresh summary
const freshSummary = await generateTokenMonitorSummary({
  since: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
});

// Read raw events
for await (const event of readTokenUsageEvents({ provider: "anthropic" })) {
  console.log(event);
}
```

## Best Practices

1. **Regular Monitoring**: Check your usage regularly to avoid surprises
2. **Set Budgets**: Use the data to set realistic AI usage budgets
3. **Optimize Models**: Identify which models are most cost-effective for your use case
4. **Clean Up**: Periodically reset old data to keep storage manageable

## Troubleshooting

### No Data Showing

If no data is displayed:
1. Ensure you've had recent AI interactions
2. Check that the data directory exists: `~/.openclaw/data/`
3. Verify file permissions

### Inaccurate Costs

Cost estimates may differ from actual billing because:
- Pricing may have changed
- Special pricing tiers or discounts not reflected
- Cache usage calculations may vary
- Currency conversion rates

Always verify costs against your provider's billing dashboard.

## Future Enhancements

Planned improvements include:
- Usage alerts and notifications
- Configurable usage limits
- Integration with provider billing APIs
- Export to CSV/JSON
- Visualization charts
- Budget tracking and forecasting

## Related Commands

- `openclaw status` - View overall OpenClaw status
- `openclaw sessions` - View session information
- `openclaw agents list` - List configured AI agents

## See Also

- [Configuration Guide](./configuration.md)
- [Model Setup](./models.md)
- [Usage Costs](./costs.md)
