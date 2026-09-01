/** CLI 参数解析。未知参数或非法值直接抛错。 */
export function parseArgs(argv) {
  const o = {
    source: '', last: 6, chars: 4000, team: '', role: 'any', id: '',
    cwd: '', list: false, json: false, help: false, listSources: false,
    search: [], context: 2, ctxChars: 300, jobs: 3, limit: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`参数 ${a} 缺少值`);
      return argv[++i];
    };
    switch (a) {
      case '-s': case '--source': (o._sources ||= []).push(next().toLowerCase()); break;
      case '--search': o.search.push(next()); break;
      case '--context': o.context = toInt(next(), a, { min: 0 }); break;
      case '--ctx-chars': o.ctxChars = toInt(next(), a, { min: 20 }); break;
      case '-j': case '--jobs': o.jobs = toInt(next(), a); break;
      case '--limit': o.limit = toInt(next(), a); break;
      case '-n': case '--last': o.last = toInt(next(), a); break;
      case '--chars': o.chars = toInt(next(), a); break;
      case '-t': case '--team': o.team = next(); break;
      case '-r': case '--role': o.role = next().toLowerCase(); break;
      case '-i': case '--id': (o._ids ||= []).push(next()); break;
      case '--cwd': o.cwd = next(); break;
      case '-l': case '--list': o.list = true; break;
      case '--json': o.json = true; break;
      case '--sources': o.listSources = true; break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error(`未知参数: ${a}（用 --help 查看用法）`);
    }
  }
  if (!o.help && !o.listSources) {
    o.source = o._sources?.[0] || '';
    o.sources = o._sources?.length ? o._sources : (o.search.length ? [...SOURCES_ALL] : []);
    o.id = o._ids?.[0] || '';
    if (!o.search.length && !SOURCES_OK.has(o.source)) {
      throw new Error(`需要 --source <codex|pi|zcode|opencode|aionui>（--search 模式可多 -s 或省略扫全部），收到: "${o.source}"`);
    }
    if (o.search.length && o.sources.some((s) => !SOURCES_OK.has(s))) {
      throw new Error(`无效的 --source 值，可用: ${[...SOURCES_ALL].join(', ')}`);
    }
  }
  return o;
}

const SOURCES_OK = new Set(['codex', 'pi', 'zcode', 'opencode', 'aionui']);
const SOURCES_ALL = ['codex', 'pi', 'zcode', 'opencode', 'aionui'];

function toInt(v, flag, { min = 1 } = {}) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < min) throw new Error(`${flag} 需要 ≥ ${min} 的整数，收到: ${v}`);
  return n;
}
