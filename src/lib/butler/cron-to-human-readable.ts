/**
 * Convert cron expressions to human-readable descriptions.
 * Also extracts meaningful descriptions from scheduler action payloads.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pad number to 2 digits */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Describe a day-of-week field */
function describeDow(field: string): string {
  if (field === '*') return '';
  if (field === '1-5') return 'weekdays';
  if (field === '0,6') return 'weekends';
  // Range: e.g., 1-3 → Mon-Wed
  if (field.includes('-')) {
    const [s, e] = field.split('-').map(Number);
    return `${DAY_NAMES_SHORT[s]}-${DAY_NAMES_SHORT[e]}`;
  }
  // List: e.g., 1,3,5 → Mon, Wed, Fri
  if (field.includes(',')) {
    return field.split(',').map(n => DAY_NAMES_SHORT[parseInt(n, 10)]).join(', ');
  }
  // Single day
  const day = parseInt(field, 10);
  return DAY_NAMES[day] ?? field;
}

/** Describe hour/minute list: e.g., "9,14" → "9:00 and 14:00" */
function describeTimeList(hourField: string, minuteField: string): string {
  const minute = minuteField === '*' ? 0 : parseInt(minuteField, 10);
  const hours = hourField.split(',').map(Number);
  return hours.map(h => `${pad(h)}:${pad(minute)}`).join(' and ');
}

/** Convert a cron expression to a human-readable description. */
export function cronToHumanReadable(expr: string): string {
  const trimmed = expr.trim();

  // Legacy: */N → every N minutes
  const intervalMatch = trimmed.match(/^\*\/(\d+)$/);
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1], 10);
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }

  // Legacy: HH:MM → daily at HH:MM
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    return `Daily at ${pad(parseInt(timeMatch[1], 10))}:${timeMatch[2]}`;
  }

  // 5-field cron
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return trimmed;

  const [min, hour, dom, month, dow] = fields;

  // Every minute: * * * * *
  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Every minute';
  }

  // Every N minutes: */N * * * *
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(minStep[1], 10);
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }

  // Every N hours: 0 */N * * *
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (min === '0' && hourStep && dom === '*' && month === '*' && dow === '*') {
    const n = parseInt(hourStep[1], 10);
    return n === 1 ? 'Every hour' : `Every ${n} hours`;
  }

  // Specific minute every hour: N * * * *
  if (min !== '*' && !min.includes('/') && !min.includes(',') && !min.includes('-')
    && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every hour at :${pad(parseInt(min, 10))}`;
  }

  // Hour range with step: 0 9-17/1 * * * → Every hour from 9:00 to 17:00
  const hourRangeStep = hour.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
  if (min !== '*' && hourRangeStep && dom === '*' && month === '*') {
    const m = parseInt(min, 10);
    const [, startH, endH, step] = hourRangeStep;
    const s = parseInt(step || '1', 10);
    const dowDesc = describeDow(dow);
    const range = `${pad(parseInt(startH, 10))}:${pad(m)} to ${pad(parseInt(endH, 10))}:${pad(m)}`;
    const every = s === 1 ? 'Every hour' : `Every ${s} hours`;
    return `${every} from ${range}${dowDesc ? ` on ${dowDesc}` : ''}`;
  }

  // Fixed time: specific min + specific hour(s)
  if (min !== '*' && !min.includes('/') && hour !== '*' && !hour.includes('/') && dom === '*' && month === '*') {
    const timeDesc = hour.includes(',') ? describeTimeList(hour, min) : `${pad(parseInt(hour, 10))}:${pad(parseInt(min, 10))}`;
    const dowDesc = describeDow(dow);

    if (dowDesc) return `${dowDesc} at ${timeDesc}`;
    return `Daily at ${timeDesc}`;
  }

  // Monthly: specific day of month
  if (min !== '*' && hour !== '*' && dom !== '*' && !dom.includes('/') && month === '*' && dow === '*') {
    const time = `${pad(parseInt(hour, 10))}:${pad(parseInt(min, 10))}`;
    return `Monthly on day ${dom} at ${time}`;
  }

  // Fallback: return raw expression
  return trimmed;
}

/**
 * Extract a meaningful description from a scheduler's action type and payload.
 * Shows what the scheduler actually does (script path, notification text, etc.)
 */
export function getSchedulerDescription(
  actionType: string,
  payload: Record<string, unknown>,
): string {
  switch (actionType) {
    case 'run_script': {
      const script = payload.script || payload.command || payload.path || payload.scriptPath;
      return script ? String(script) : '';
    }
    case 'send_notification': {
      const title = payload.title || payload.message || payload.body;
      return title ? String(title) : '';
    }
    case 'create_task': {
      const title = payload.title || payload.name;
      return title ? String(title) : '';
    }
    case 'create_communication_task': {
      const msg = payload.message || payload.title || payload.body;
      return msg ? String(msg) : '';
    }
    case 'update_task': {
      const id = payload.taskId || payload.id;
      const status = payload.status;
      return id ? `Task ${id}${status ? ` → ${status}` : ''}` : '';
    }
    case 'write_file': {
      const path = payload.path || payload.filePath;
      return path ? String(path) : '';
    }
    case 'create_project': {
      const name = payload.name || payload.projectName;
      return name ? String(name) : '';
    }
    default:
      return '';
  }
}
