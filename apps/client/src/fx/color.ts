/**
 * Returns `color` with the given alpha when it is a hex color (#rgb or #rrggbb);
 * any other CSS color is returned unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  let r: number;
  let g: number;
  let b: number;
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    r = Number.parseInt(hex.slice(1, 3), 16);
    g = Number.parseInt(hex.slice(3, 5), 16);
    b = Number.parseInt(hex.slice(5, 7), 16);
  } else if (/^#[0-9a-f]{3}$/i.test(hex)) {
    r = Number.parseInt(hex.charAt(1).repeat(2), 16);
    g = Number.parseInt(hex.charAt(2).repeat(2), 16);
    b = Number.parseInt(hex.charAt(3).repeat(2), 16);
  } else {
    return color;
  }
  const a = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
