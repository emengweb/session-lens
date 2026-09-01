import fs from 'node:fs';
import path from 'node:path';

/** 递归列出目录下的文件（有深度上限），目录不可读时返回空。 */
export function walkFiles(root, { maxDepth = 4 } = {}) {
  const out = [];
  const visit = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth) visit(p, depth + 1);
      } else if (e.isFile()) {
        out.push(p);
      }
    }
  };
  visit(root, 0);
  return out;
}

/** 列出目录的一级子目录名。 */
export function listDirs(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { return []; }
}

/** 安全读文本文件，失败返回 null。 */
export function readFileSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

/** 毫秒时间戳 → ISO；已是 ISO/undefined 原样（规整）返回。 */
export function toIso(ts) {
  if (ts == null || ts === '') return '';
  if (typeof ts === 'number') {
    try { return new Date(ts).toISOString(); } catch { return ''; }
  }
  return String(ts);
}

/** 用户主目录（正斜杠风格）。SESSION_LENS_HOME 可覆盖（测试/便携场景）。 */
export function home() {
  if (process.env.SESSION_LENS_HOME) return process.env.SESSION_LENS_HOME.replace(/\\/g, '/');
  return process.env.HOME?.replace(/\\/g, '/') || process.env.USERPROFILE?.replace(/\\/g, '/') || '';
}
