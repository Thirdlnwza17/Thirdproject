export function parseDurationToMinutes(input: string): string {
  if (!input) return '';
  let str = input.trim().toLowerCase();

  // Normalize Thai/English hour indicators
  str = str.replace(/ชั่วโมง|ช.ม.|ชม.|hrs?|hours?|h/g, 'hr');
  str = str.replace(/นาที|mins?|minutes?|m/g, 'min');

  // Handle range e.g. '8-12 hr', '8-12 ชม.'
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?:\s*hr)?/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    if (str.includes('hr')) {
      return `${Math.round(min * 60)}-${Math.round(max * 60)}`;
    }
    // If no unit, assume minutes
    return `${Math.round(min)}-${Math.round(max)}`;
  }

  // Single value with unit
  const singleHr = str.match(/^(\d+(?:\.\d+)?)(?:\s*hr)$/);
  if (singleHr) {
    return `${Math.round(parseFloat(singleHr[1]) * 60)}`;
  }
  const singleMin = str.match(/^(\d+(?:\.\d+)?)(?:\s*min)$/);
  if (singleMin) {
    return `${Math.round(parseFloat(singleMin[1]))}`;
  }

  // Time format (e.g., 1:15 or 01:15:00)
  const timeParts = str.split(':');
  if (timeParts.length === 2 || timeParts.length === 3) {
    // HH:MM or HH:MM:SS
    const h = parseInt(timeParts[0], 10) || 0;
    const m = parseInt(timeParts[1], 10) || 0;
    return `${h * 60 + m}`;
  }

  // Just a number (assume minutes)
  const num = str.match(/^(\d+(?:\.\d+)?)/);
  if (num) {
    return `${Math.round(parseFloat(num[1]))}`;
  }

  // Fallback: return original input
  return input;
}
