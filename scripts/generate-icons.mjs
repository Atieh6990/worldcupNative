import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const source = 'C:\\Users\\Sam\\.cursor\\projects\\d-react-react-worldcupNative\\assets\\c__Users_Sam_AppData_Roaming_Cursor_User_workspaceStorage_ca85d2e55656d4c8188d2e69cfdff7f9_images_________________-3a3421ea-f3b3-49bb-90a3-87d53c62ee84.png';

const resDir = join(root, 'android', 'app', 'src', 'main', 'res');
const BG_COLOR = { r: 0, g: 0, b: 77, alpha: 1 };

const densities = {
  'mipmap-mdpi': { launcher: 48, adaptive: 108 },
  'mipmap-hdpi': { launcher: 72, adaptive: 162 },
  'mipmap-xhdpi': { launcher: 96, adaptive: 216 },
  'mipmap-xxhdpi': { launcher: 144, adaptive: 324 },
  'mipmap-xxxhdpi': { launcher: 192, adaptive: 432 },
};

async function makeSquareIcon(size, padding = 0.08) {
  const meta = await sharp(source).metadata();
  const side = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - side) / 2);
  const top = Math.floor((meta.height - side) / 2);

  const cropped = await sharp(source)
    .extract({ left, top, width: side, height: side })
    .resize(size, size, { fit: 'contain', background: BG_COLOR })
    .png()
    .toBuffer();

  return cropped;
}

async function makeForeground(size) {
  const inner = Math.round(size * 0.72);
  const logo = await makeSquareIcon(inner, 0);
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const offset = Math.round((size - inner) / 2);
  return canvas
    .composite([{ input: logo, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function makeBackground(size) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .png()
    .toBuffer();
}

async function makeMonochrome(size) {
  const fg = await makeForeground(size);
  return sharp(fg)
    .greyscale()
    .threshold(30)
    .png()
    .toBuffer();
}

async function writePng(folder, name, buffer) {
  const dir = join(resDir, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buffer);
}

async function main() {
  for (const [folder, sizes] of Object.entries(densities)) {
    const launcher = await makeSquareIcon(sizes.launcher);
    const background = await makeBackground(sizes.adaptive);
    const foreground = await makeForeground(sizes.adaptive);
    const monochrome = await makeMonochrome(sizes.adaptive);

    await writePng(folder, 'ic_launcher.png', launcher);
    await writePng(folder, 'ic_launcher_round.png', launcher);
    await writePng(folder, 'ic_launcher_background.png', background);
    await writePng(folder, 'ic_launcher_foreground.png', foreground);
    await writePng(folder, 'ic_launcher_monochrome.png', monochrome);

    console.log(`Generated ${folder}`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
