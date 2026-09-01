/** CLI 参数解析。未知参数或非法值直接抛错。 */
export function parseArgs(argv) {
  const o = {
    source: '', last: 6, chars: 4000, team: '', role: 'any', id: '',
    cwd: '', list: false, json: false, help: false, listSources: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`参数 ${a} 缺少值`);
      return argv[++i];
    };
    switch (a) {
      case '-s': case '--source': o.source = next().toLowerCase(); break;
      case '-n': case '--last': o.last = toInt(next(), a); break;
      case '--chars': o.chars = toInt(next(), a); break;
      case '-t': case '--team': o.team = next(); break;
      case '-r': case '--role': o.role = next().toLowerCase(); break;
      case '-i': case '--id': o.id = next(); break;
      case '--cwd': o.cwd = next(); break;
      case '-l': case '--list': o.list = true; break;
      case '--json': o.json = true; break;
      case '--sources': o.listSources = true; break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error(`未知参数: ${a}（用 --help 查看用法）`);
    }
  }
  if (!o.help && !o.listSources && !SOURCES_OK.has(o.source)) {
    throw new Error(`需要 --source <codex|pi|zcode|opencode|aionui>，收到: "${o.source}"`);
  }
  return o;
}

const SOURCES_OK = new Set(['codex', 'pi', 'zcode', 'opencode', 'aionui']);

function toInt(v, flag) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) throw new Error(`${flag} 需要正整数，收到: ${v}`);
  return n;
}
