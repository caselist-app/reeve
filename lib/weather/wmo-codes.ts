// Open-Meteo's WMO weather interpretation codes, bucketed into six conditions
// plus a fallback. This is the one place the mapping lives: fix it here, not
// per call site. https://open-meteo.com/en/docs

interface WmoBucket {
  codes: readonly number[]
  icon: string
  label: string
}

const CLEAR: WmoBucket = {
  codes: [0],
  icon: 'Sun',
  label: 'Clear',
}

const PARTLY_CLOUDY: WmoBucket = {
  codes: [1, 2, 3],
  icon: 'CloudSun',
  label: 'Partly cloudy',
}

const FOG: WmoBucket = {
  codes: [45, 48],
  icon: 'CloudFog',
  label: 'Fog',
}

const RAIN: WmoBucket = {
  codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
  icon: 'CloudRain',
  label: 'Rain',
}

const SNOW: WmoBucket = {
  codes: [71, 73, 75, 77, 85, 86],
  icon: 'Snowflake',
  label: 'Snow',
}

const THUNDERSTORM: WmoBucket = {
  codes: [95, 96, 99],
  icon: 'CloudLightning',
  label: 'Thunderstorm',
}

const FALLBACK: WmoBucket = {
  codes: [],
  icon: 'Cloud',
  label: 'Unknown',
}

const BUCKETS: readonly WmoBucket[] = [CLEAR, PARTLY_CLOUDY, FOG, RAIN, SNOW, THUNDERSTORM]

const BY_CODE = new Map<number, WmoBucket>(
  BUCKETS.flatMap((bucket) => bucket.codes.map((code) => [code, bucket] as const))
)

function bucketFor(code: number): WmoBucket {
  return BY_CODE.get(code) ?? FALLBACK
}

export function wmoToIcon(code: number): string {
  return bucketFor(code).icon
}

export function wmoToLabel(code: number): string {
  return bucketFor(code).label
}
