import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const manifest = readFileSync('site.webmanifest', 'utf8');
const pkg = readFileSync('package.json', 'utf8');

const checks = {
  title: html.includes('<title>THE MAGNIFICENT SEVEN</title>'),
  meta: html.includes('og:title') && html.includes('twitter:card') && html.includes("manifestLink.href = 'site.webmanifest'"),
  heroImage: html.includes('id="heroSceneImage"') && html.includes('assignImageWithFallback'),
  journeyAsset: html.includes('assets/endless-road-cowboy.png') && existsSync('assets/endless-road-cowboy.png'),
  journeyMotion: html.includes('journey-bg') && html.includes('--journey-progress') && html.includes('journeyScenes'),
  noHeroSymbols: /\.hero-silhouettes[\s\S]*?display:\s*none/.test(html),
  operators: (html.match(/data-profile-id=/g) || []).length === 7,
  noDeploy: !html.includes('>Deploy</button>'),
  profile: html.includes('id="profileTakeover"') && html.includes('role="dialog"') && html.includes('aria-modal="true"'),
  profileNav: html.includes('id="profilePrev"') && html.includes('id="profileNext"') && html.includes('switchProfile'),
  sound: html.includes('id="soundStart"') && html.includes('playEmberCrackle') && html.includes('playMetalHit'),
  motion: html.includes('document.startViewTransition') && html.includes('prefers-reduced-motion'),
  manifest: JSON.parse(manifest).name === 'THE MAGNIFICENT SEVEN',
  packageScripts: JSON.parse(pkg).scripts.dev && JSON.parse(pkg).scripts.check
};

const failed = Object.entries(checks).filter(([, value]) => !value);

console.log(JSON.stringify(checks, null, 2));

if (failed.length) {
  console.error(`Failed checks: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log('All project checks passed.');
