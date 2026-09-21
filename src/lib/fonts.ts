const uiFallback = '"Segoe UI", "Microsoft YaHei", sans-serif';
const logFallback = 'Consolas, "Microsoft YaHei", monospace';

// A family name is a single CSS string, even if it contains quotes or commas.
function quoteFamily(family: string) {
  return '"' + family.replace(/[\0-\x1f\x7f"\\]/g, char => "\\" + char.charCodeAt(0).toString(16) + " ") + '"';
}

export function fontStack(family: string | undefined, log = false) {
  const fallback = log ? logFallback : uiFallback;
  return family ? quoteFamily(family) + ", " + fallback : fallback;
}
