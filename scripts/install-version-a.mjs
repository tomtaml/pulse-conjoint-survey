import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectProject, readIdentity, assets } from './cloudflare-project.mjs';

function protectedFiles(root, prefix = '') {
  const output = {};
  for (const item of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (!prefix && ['public', 'node_modules', '.git', '.wrangler', '.review-backups'].includes(item.name)) continue;
    if (item.isDirectory()) Object.assign(output, protectedFiles(root, relative));
    else if (item.isFile()) output[relative] = createHash('sha256').update(readFileSync(path.join(root, relative))).digest('hex');
  }
  return output;
}

try {
  const [destination, identityFile, flag, ...extra] = process.argv.slice(2);
  if (extra.length || (flag && flag !== '--apply')) throw new Error('Usage: node scripts/install-version-a.mjs /path/to/existing/survey-project /path/to/private-identity.json [--apply]');
  const identity = readIdentity(identityFile), target = identity.target;
  const project = inspectProject(destination, identity);
  if (project.assetPath !== path.join(project.root, 'public')) throw new Error('This installer supports the existing public/ asset directory only.');
  const legacy = fileURLToPath(new URL('../public/v1/', import.meta.url));
  const source = existsSync(legacy) ? legacy : fileURLToPath(new URL('../public/', import.meta.url));
  if (path.resolve(source) === project.assetPath) throw new Error('Choose the separate, already configured Cloudflare project as the destination.');
  const content = Object.fromEntries(assets.map(name => [name, readFileSync(path.join(source, name))]));
  const changed = assets.filter(name => !existsSync(path.join(project.assetPath, name)) || !content[name].equals(readFileSync(path.join(project.assetPath, name))));
  console.log(JSON.stringify({ worker: target.worker, database: target.database, database_id: target.id, mode: flag === '--apply' ? 'apply' : 'dry-run', changed_frontend_files: changed, collection_settings: 'preserved; this frontend makes no submissions' }, null, 2));
  if (flag === '--apply' && changed.length) {
    const backupRoot = path.join(project.root, '.review-backups');
    if (existsSync(backupRoot) && (lstatSync(backupRoot).isSymbolicLink() || !lstatSync(backupRoot).isDirectory())) throw new Error('Unsafe backup directory.');
    const before = protectedFiles(project.root);
    const backup = path.join(backupRoot, `version-a-${Date.now()}`);
    mkdirSync(backup, { recursive: true });
    const manifest = [];
    for (const name of changed) {
      const existed = existsSync(path.join(project.assetPath, name));
      if (existed) copyFileSync(path.join(project.assetPath, name), path.join(backup, name));
      manifest.push({ file: name, previously_existed: existed });
    }
    writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    for (const name of changed) writeFileSync(path.join(project.assetPath, name), content[name]);
    if (JSON.stringify(before) !== JSON.stringify(protectedFiles(project.root))) throw new Error('A protected file changed during installation. Stop before deploying and review the diff.');
    for (const name of assets) if (!readFileSync(path.join(project.assetPath, name)).equals(content[name])) throw new Error(`Asset verification failed: ${name}`);
    console.log(`Installed and verified five frontend assets. Backup: ${backup}`);
  }
  console.log('No Cloudflare operation was performed. Worker source, Wrangler configuration, scripts, migrations, credentials and existing collection controls are unchanged.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
