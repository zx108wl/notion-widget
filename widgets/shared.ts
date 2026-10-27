export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] as string);
}

/**
 * 度分秒（DMS）转十进制度数。也接受纯十进制字符串（向后兼容）。
 *
 * 支持格式（大小写和空格均可）：
 *   十进制:  31.2304  /  -121.4737
 *   度分秒:  31°13'48"N  /  31°13'48"  /  31d13m48sN  /  31 13 48 N
 *   度分:    31°13'N  /  31°13'
 * 南北半球 / 东西方向可由字母（N/S/E/W）或负号指示。
 *
 * @returns 十进制度数；无法解析时返回 null。
 */
export function parseCoordinate(input: string): number | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // 1) 先尝试纯十进制（向后兼容）
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber;

  // 2) DMS 正则：度、分、秒都是可选的（只要有度就行）
  //    度允许负号（如 -31°13'48"），或用 N/S/E/W 后缀表示方向
  const dmsRegex =
    /^\s*(-?\d+(?:\.\d+)?)\s*[°d\s]\s*(?:(\d+(?:\.\d+)?)\s*['ʼm\s]\s*(?:(\d+(?:\.\d+)?)\s*["”ʼʼs]?)?)?\s*([NSEWnsew])?\s*$/;

  const match = raw.match(dmsRegex);
  if (!match) return null;

  const degrees = parseFloat(match[1]);
  const minutes = match[2] ? parseFloat(match[2]) : 0;
  const seconds = match[3] ? parseFloat(match[3]) : 0;
  const hemisphere = match[4]?.toUpperCase();

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || minutes >= 60) return null;
  if (seconds < 0 || seconds >= 60) return null;

  let decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600;

  // 方向判定：负号 或 S/W 均取反
  if (degrees < 0) decimal = -decimal;
  if (hemisphere === "S" || hemisphere === "W") decimal = -decimal;

  return decimal;
}
