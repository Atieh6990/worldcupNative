import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const source = join(root, 'assets', 'app-icon-source.png');

const resDir = join(root, 'android', 'app', 'src', 'main', 'res');
const BG = { r: 0, g: 0, b: 77, alpha: 1 };

// Filimo mipmap sizes (mdpi..xxxhdpi)
const mipmapDensities = {
  'mipmap-mdpi': { launcher: 48, adaptive: 108 },
  'mipmap-hdpi': { launcher: 72, adaptive: 162 },
  'mipmap-xhdpi': { launcher: 96, adaptive: 216 },
  'mipmap-xxhdpi': { launcher: 144, adaptive: 324 },
  'mipmap-xxxhdpi': { launcher: 192, adaptive: 432 },
};

// Filimo banner: single drawable, 1280x720 (ix.png)
const BANNER = { width: 1280, height: 720 };

async function makeLegacyLauncher(size) {
  const meta = await sharp(source).metadata();
  const ratio = meta.width / meta.height;
  const inner = Math.round(size * 0.72);
  let bannerWidth = inner;
  let bannerHeight = Math.round(inner / ratio);
  if (bannerHeight > inner) {
    bannerHeight = inner;
    bannerWidth = Math.round(inner * ratio);
  }

  const banner = await sharp(source)
    .resize(bannerWidth, bannerHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([
      {
        input: banner,
        left: Math.round((size - bannerWidth) / 2),
        top: Math.round((size - bannerHeight) / 2),
      },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}

async function makeAdaptiveForeground(size) {
  const meta = await sharp(source).metadata();
  const ratio = meta.width / meta.height;
  const inner = Math.round(size * 0.66);
  let bannerWidth = inner;
  let bannerHeight = Math.round(inner / ratio);
  if (bannerHeight > inner) {
    bannerHeight = inner;
    bannerWidth = Math.round(inner * ratio);
  }

  const banner = await sharp(source)
    .resize(bannerWidth, bannerHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: banner,
        left: Math.round((size - bannerWidth) / 2),
        top: Math.round((size - bannerHeight) / 2),
      },
    ])
    .webp({ quality: 90 })
    .toBuffer();
}

async function makeBanner() {
  return sharp(source)
    .resize(BANNER.width, BANNER.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

async function writeAsset(folder, name, buffer) {
  const dir = join(resDir, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buffer);
}

async function main() {
  for (const folder of [
    'drawable-mdpi',
    'drawable-hdpi',
    'drawable-xhdpi',
    'drawable-xxhdpi',
    'drawable-xxxhdpi',
  ]) {
    await rm(join(resDir, folder), { recursive: true, force: true });
  }

  for (const [folder, sizes] of Object.entries(mipmapDensities)) {
    await rm(join(resDir, folder, 'ic_launcher.png'), { force: true });
    await rm(join(resDir, folder, 'ic_launcher_foreground.png'), { force: true });

    const launcher = await makeLegacyLauncher(sizes.launcher);
    const foreground = await makeAdaptiveForeground(sizes.adaptive);

    await writeAsset(folder, 'ic_launcher.webp', launcher);
    await writeAsset(folder, 'ic_launcher_foreground.webp', foreground);
    console.log(`Generated ${folder}`);
  }

  const banner = await makeBanner();
  await writeAsset('drawable', 'ic_banner.png', banner);
  console.log('Generated drawable/ic_banner.png (1280x720)');

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
