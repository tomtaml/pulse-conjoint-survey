import { readFileSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function readIdentity(filename) {
  if (!filename) throw new Error('Pass a private JSON identity file with the expected survey target and protected original Worker names.');
  const identity = JSON.parse(readFileSync(filename, 'utf8'));
  const target = identity.target;
  if (!target || !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(target.worker ?? '') || !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(target.database ?? '') || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(target.id ?? '') || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target.binding ?? '')) throw new Error('Invalid or placeholder target identity. Use the existing survey deployment records.');
  if (!Array.isArray(identity.protected_workers) || !identity.protected_workers.length || identity.protected_workers.some(name=>typeof name !== 'string' || !name)) throw new Error('List the original application Worker in protected_workers.');
  if (identity.protected_workers.includes(target.worker)) throw new Error('The target Worker is a protected original application.');
  return identity;
}
export const assets = Object.freeze(['index.html', 'app.mjs', 'engine.mjs', 'styles.css', 'survey.json']);

// Strip JSONC comments and trailing commas only outside JSON strings.
export function parseJSONC(text) {
  let clean = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; clean += c; }
    else if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; clean += '\n'; }
    else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      if (i >= text.length) throw new Error('Unterminated JSONC comment.');
      i++; clean += ' ';
    } else clean += c;
  }
  let result = ''; quoted = false; escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (!quoted && c === ',' && /^\s*[}\]]/.test(clean.slice(i + 1))) continue;
    result += c;
    if (quoted && escaped) escaped = false;
    else if (quoted && c === '\\') escaped = true;
    else if (c === '"') quoted = !quoted;
  }
  return JSON.parse(result);
}

export function inspectProject(directory, identity) {
  const target = identity.target;
  if (!directory) throw new Error('Pass the existing configured survey project directory.');
  const root = realpathSync(directory);
  const candidates = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].filter(name => existsSync(path.join(root, name)));
  if (candidates.length !== 1 || candidates[0] === 'wrangler.toml') throw new Error('Expected exactly one wrangler.jsonc or wrangler.json. No files were changed.');
  const configPath = path.join(root, candidates[0]);
  if (lstatSync(configPath).isSymbolicLink()) throw new Error('Wrangler configuration must not be a symlink.');
  const config = parseJSONC(readFileSync(configPath, 'utf8'));
  if (identity.protected_workers.includes(config.name) || config.name !== target.worker) throw new Error(`Refusing Worker ${config.name ?? '(unnamed)'}. Only ${target.worker} is allowed; the original application is protected.`);
  if (config.env && Object.keys(config.env).length) throw new Error('Named Wrangler environments require a separate explicit review. No files were changed.');
  const databases = config.d1_databases ?? [];
  if (databases.length !== 1 || databases[0].binding !== target.binding || databases[0].database_name !== target.database || databases[0].database_id !== target.id) {
    throw new Error('The D1 binding must match the separate survey database name, UUID and binding from the private identity file. No binding is created or changed.');
  }
  if (!config.main || !existsSync(path.resolve(root, config.main))) throw new Error('The existing Worker entrypoint is missing.');
  const assetPath = path.resolve(root, config.assets?.directory ?? '');
  if (assetPath === root || !assetPath.startsWith(root + path.sep) || !existsSync(assetPath) || realpathSync(assetPath) !== assetPath) throw new Error('The existing asset directory must be a real directory inside the survey project.');
  for (const name of assets) {
    const file = path.join(assetPath, name);
    if (existsSync(file) && (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile())) throw new Error(`Unsafe asset destination: ${name}`);
  }
  return { root, configPath, config, assetPath };
}

export function wranglerExecutable(project) {
  const filename = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
  const executable = path.join(project.root, 'node_modules', '.bin', filename);
  if (!existsSync(executable)) throw new Error('Use the existing survey project with its installed Wrangler dependency. This workflow does not install or update dependencies.');
  return executable;
}
