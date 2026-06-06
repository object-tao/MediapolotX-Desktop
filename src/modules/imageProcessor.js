const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { exiftool } = require('exiftool-vendored');
const config = require('../config/default');

async function resizeImage(inputPath, outputPath, options = {}) {
  await ensureDir(outputPath);
  const { width, height, fit = 'inside', quality = 82, format } = options;
  const pipeline = sharp(inputPath).rotate().resize({ width, height, fit, withoutEnlargement: true });
  return writeImage(pipeline, outputPath, { quality, format });
}

async function compressImage(inputPath, outputPath, options = {}) {
  await ensureDir(outputPath);
  const { quality = 78, format } = options;
  return writeImage(sharp(inputPath).rotate(), outputPath, { quality, format });
}

async function cleanExif(inputPath, outputPath) {
  await ensureDir(outputPath);
  await sharp(inputPath).rotate().toFile(outputPath);
  return { outputPath };
}

async function readMetadata(inputPath) {
  const [sharpMetadata, exif] = await Promise.all([
    sharp(inputPath).metadata(),
    exiftool.read(inputPath).catch(() => ({}))
  ]);
  return { sharp: sharpMetadata, exif };
}

async function renderTemplate(inputPath, outputPath, template = {}) {
  await ensureDir(outputPath);
  const {
    width = 1200,
    height = 1600,
    background = '#f4f7f9',
    padding = 48,
    fit = 'contain'
  } = template;

  const image = await sharp(inputPath)
    .rotate()
    .resize({ width: width - padding * 2, height: height - padding * 2, fit, withoutEnlargement: true })
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background
    }
  })
    .composite([{ input: image, gravity: 'center' }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  return { outputPath, width, height };
}

async function generateThumbnail(inputPath, outputPath, options = {}) {
  const thumbnail = { ...config.thumbnail, ...options };
  await ensureDir(outputPath);
  await sharp(inputPath)
    .rotate()
    .resize({ width: thumbnail.width, height: thumbnail.height, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: thumbnail.quality })
    .toFile(outputPath);
  return { outputPath };
}

async function writeImage(pipeline, outputPath, options) {
  const format = options.format || path.extname(outputPath).slice(1).toLowerCase() || 'jpeg';
  if (format === 'jpg' || format === 'jpeg') {
    await pipeline.jpeg({ quality: options.quality }).toFile(outputPath);
  } else if (format === 'png') {
    await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);
  } else if (format === 'webp') {
    await pipeline.webp({ quality: options.quality }).toFile(outputPath);
  } else if (format === 'avif') {
    await pipeline.avif({ quality: options.quality }).toFile(outputPath);
  } else {
    await pipeline.toFile(outputPath);
  }
  return { outputPath, format };
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

module.exports = {
  resizeImage,
  compressImage,
  cleanExif,
  readMetadata,
  renderTemplate,
  generateThumbnail
};
