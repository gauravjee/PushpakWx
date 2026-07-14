// Aviation weather utility helpers

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNK';

// Estimate ceiling AGL (in feet) from Open-Meteo cloud cover layers.
// Open-Meteo doesn't provide direct cloud base, so we approximate:
//  - low clouds (>=50%) → ceiling ~1500ft
//  - mid clouds (>=50%) → ceiling ~8000ft
//  - high clouds → not a ceiling (limits us to unlimited)
// This is a heuristic since exact ceiling requires METAR.
export function estimateCeilingFt(low: number, mid: number, high: number): number | null {
  if (low >= 60) return 1200;
  if (low >= 40) return 2500;
  if (mid >= 60) return 6500;
  if (mid >= 40) return 10000;
  if (high >= 50) return 20000;
  return null; // unlimited-ish
}

// FAA flight category based on visibility (in meters from Open-Meteo) and ceiling AGL (ft).
export function computeFlightCategory(visibility_m: number | null, ceiling_ft: number | null): FlightCategory {
  const visSM = visibility_m == null ? 99 : visibility_m / 1609.344; // statute miles
  const c = ceiling_ft == null ? 100000 : ceiling_ft;
  if (visSM < 1 || c < 500) return 'LIFR';
  if (visSM < 3 || c < 1000) return 'IFR';
  if (visSM <= 5 || c <= 3000) return 'MVFR';
  return 'VFR';
}

export function categoryColor(cat: FlightCategory): string {
  switch (cat) {
    case 'VFR': return '#32D74B';
    case 'MVFR': return '#0A84FF';
    case 'IFR': return '#FF453A';
    case 'LIFR': return '#BF5AF2';
    default: return '#8A9198';
  }
}

export function categoryLabel(cat: FlightCategory): string {
  switch (cat) {
    case 'VFR': return 'Visual Flight Rules';
    case 'MVFR': return 'Marginal VFR';
    case 'IFR': return 'Instrument Flight Rules';
    case 'LIFR': return 'Low IFR';
    default: return 'Unknown';
  }
}

export function convertWind(kt: number, unit: 'kt' | 'kmh' | 'mph'): number {
  if (unit === 'kmh') return kt * 1.852;
  if (unit === 'mph') return kt * 1.15078;
  return kt;
}
export function windUnitLabel(unit: 'kt' | 'kmh' | 'mph') {
  return unit === 'kt' ? 'kt' : unit === 'kmh' ? 'km/h' : 'mph';
}
export function convertAlt(ft: number, unit: 'ft' | 'm'): number {
  return unit === 'ft' ? ft : ft * 0.3048;
}
export function altUnitLabel(unit: 'ft' | 'm') { return unit; }
export function convertTemp(c: number, unit: 'C' | 'F'): number {
  return unit === 'C' ? c : c * 9 / 5 + 32;
}
export function tempUnitLabel(unit: 'C' | 'F') { return `°${unit}`; }

export function windDirLabel(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Open-Meteo weather code -> human label & icon name (ionicons)
export function weatherCodeInfo(code: number): { label: string; icon: string; isStorm: boolean } {
  const map: Record<number, { label: string; icon: string; isStorm?: boolean }> = {
    0: { label: 'Clear', icon: 'sunny-outline' },
    1: { label: 'Mainly Clear', icon: 'partly-sunny-outline' },
    2: { label: 'Partly Cloudy', icon: 'partly-sunny-outline' },
    3: { label: 'Overcast', icon: 'cloud-outline' },
    45: { label: 'Fog', icon: 'cloudy-outline' },
    48: { label: 'Rime Fog', icon: 'cloudy-outline' },
    51: { label: 'Light Drizzle', icon: 'rainy-outline' },
    53: { label: 'Drizzle', icon: 'rainy-outline' },
    55: { label: 'Heavy Drizzle', icon: 'rainy-outline' },
    61: { label: 'Light Rain', icon: 'rainy-outline' },
    63: { label: 'Rain', icon: 'rainy-outline' },
    65: { label: 'Heavy Rain', icon: 'rainy-outline' },
    71: { label: 'Light Snow', icon: 'snow-outline' },
    73: { label: 'Snow', icon: 'snow-outline' },
    75: { label: 'Heavy Snow', icon: 'snow-outline' },
    77: { label: 'Snow Grains', icon: 'snow-outline' },
    80: { label: 'Rain Showers', icon: 'rainy-outline' },
    81: { label: 'Heavy Showers', icon: 'rainy-outline' },
    82: { label: 'Violent Showers', icon: 'thunderstorm-outline' },
    85: { label: 'Snow Showers', icon: 'snow-outline' },
    86: { label: 'Heavy Snow Showers', icon: 'snow-outline' },
    95: { label: 'Thunderstorm', icon: 'thunderstorm-outline', isStorm: true },
    96: { label: 'T-Storm w/ Hail', icon: 'thunderstorm-outline', isStorm: true },
    99: { label: 'Severe T-Storm', icon: 'thunderstorm-outline', isStorm: true },
  };
  const info = map[code] || { label: 'Unknown', icon: 'help-circle-outline' };
  return { label: info.label, icon: info.icon, isStorm: !!info.isStorm };
}
