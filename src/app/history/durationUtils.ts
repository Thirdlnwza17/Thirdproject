export function parseDurationToMinutes(input: string): string {
  if (!input) return '';
  let str = input.trim().toLowerCase();

 
  str = str.replace(/ชั่วโมง|ช.ม.|ชม.|hrs?|hours?|h/g, 'hr');
  str = str.replace(/นาที|mins?|minutes?|m/g, 'min');


  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(?:\s*hr)?/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    if (str.includes('hr')) {
      return `${Math.round(min * 60)}-${Math.round(max * 60)}`;
    }
 
    return `${Math.round(min)}-${Math.round(max)}`;
  }


  const singleHr = str.match(/^(\d+(?:\.\d+)?)(?:\s*hr)$/);
  if (singleHr) {
    return `${Math.round(parseFloat(singleHr[1]) * 60)}`;
  }
  const singleMin = str.match(/^(\d+(?:\.\d+)?)(?:\s*min)$/);
  if (singleMin) {
    return `${Math.round(parseFloat(singleMin[1]))}`;
  }


  const timeParts = str.split(':');
  if (timeParts.length === 2 || timeParts.length === 3) {

    const h = parseInt(timeParts[0], 10) || 0;
    const m = parseInt(timeParts[1], 10) || 0;
    return `${h * 60 + m}`;
  }


  const num = str.match(/^(\d+(?:\.\d+)?)/);
  if (num) {
    return `${Math.round(parseFloat(num[1]))}`;
  }


  return input;
}
