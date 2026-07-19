/**
 * Web Mercator projection helpers for aligning OSM raster tiles with our
 * own flight-track overlay. Standard "slippy map" tile math — see
 * https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */

export const TILE_SIZE = 256;

/** World pixel coordinate of a lat/lon at a given zoom level. */
export function latLonToWorldPixel(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = (lon + 180) / 360;
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return { x: x * scale, y: y * scale };
}

/**
 * Finds the highest zoom level (most detail) at which the given bounding
 * box still fits within the viewport, so a tight 4nm circuit zooms in
 * close and a 250nm cross-country zooms out to fit — same "fit bounds"
 * approach real map SDKs use, just computed manually.
 */
export function computeFitZoom(
  minLat: number, minLon: number, maxLat: number, maxLon: number,
  viewportW: number, viewportH: number,
  minZoom = 4, maxZoom = 15,
): number {
  for (let z = maxZoom; z >= minZoom; z--) {
    const p1 = latLonToWorldPixel(maxLat, minLon, z);
    const p2 = latLonToWorldPixel(minLat, maxLon, z);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    if (w <= viewportW && h <= viewportH) return z;
  }
  return minZoom;
}

/** Which tile (x,y) a world pixel falls into at a given zoom. */
export function worldPixelToTile(px: number, py: number): { tx: number; ty: number } {
  return { tx: Math.floor(px / TILE_SIZE), ty: Math.floor(py / TILE_SIZE) };
}
