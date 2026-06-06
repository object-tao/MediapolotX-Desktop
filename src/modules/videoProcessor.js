const fs = require('node:fs/promises');
const path = require('node:path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobe = require('@ffprobe-installer/ffprobe');
const sharp = require('sharp');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobe.path);

async function captureFrame(inputPath, outputPath, options = {}) {
  await ensureDir(outputPath);
  const timestamp = options.timestamp || '00:00:01';
  const folder = path.dirname(outputPath);
  const filename = path.basename(outputPath);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename,
        folder,
        size: options.size || '1280x?'
      })
      .on('end', resolve)
      .on('error', reject);
  });

  return { outputPath, timestamp };
}

async function adaptCover(inputPath, outputPath, options = {}) {
  await ensureDir(outputPath);
  const { width = 1280, height = 720, mode = 'blur-background' } = options;
  const foreground = await sharp(inputPath)
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  if (mode === 'crop') {
    await sharp(inputPath).resize({ width, height, fit: 'cover' }).jpeg({ quality: 88 }).toFile(outputPath);
    return { outputPath, width, height, mode };
  }

  const background = await sharp(inputPath)
    .resize({ width, height, fit: 'cover' })
    .blur(24)
    .modulate({ brightness: 0.78 })
    .toBuffer();

  await sharp(background)
    .composite([{ input: foreground, gravity: 'center' }])
    .jpeg({ quality: 88 })
    .toFile(outputPath);

  return { outputPath, width, height, mode };
}

async function createVideoCover(inputPath, outputPath, options = {}) {
  const tempFrame = path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}.frame.jpg`);
  await captureFrame(inputPath, tempFrame, options);
  const result = await adaptCover(tempFrame, outputPath, options);
  await fs.rm(tempFrame, { force: true });
  return result;
}

async function probeVideo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) reject(error);
      else resolve(metadata);
    });
  });
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

module.exports = {
  captureFrame,
  adaptCover,
  createVideoCover,
  probeVideo
};
