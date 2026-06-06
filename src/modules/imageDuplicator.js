const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const IGNORED_DIRECTORY_NAMES = new Set([
  '_mediapolotx_backup',
  '_mediapolotx_no_ai'
]);

async function scanFolder(folderPath) {
  const files = [];
  await walk(folderPath, async (filePath, stats) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return;
    if (path.basename(filePath).includes('.mediapolotx-tmp')) return;
    files.push({
      id: filePath,
      absolutePath: filePath,
      relativePath: normalizeRelativePath(path.relative(folderPath, filePath)),
      extension: ext === '.jpeg' ? 'jpg' : ext.slice(1),
      sizeBytes: stats.size
    });
  });
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function duplicateImages(folderPath, options = {}, onProgress = null) {
  const files = options.files?.length ? options.files : await scanFolder(folderPath);
  const selectedPaths = new Set(options.selectedPaths || files.map((file) => file.absolutePath));
  const selectedFiles = files.filter((file) => selectedPaths.has(file.absolutePath));
  const combinations = buildCombinations(options);
  const total = selectedFiles.length * combinations.length;
  const batchStart = Date.now();
  let completed = 0;

  onProgress?.({ phase: 'start', total, completed: 0, percent: 0 });

  for (let comboIndex = 0; comboIndex < combinations.length; comboIndex += 1) {
    const combination = combinations[comboIndex];
    const outputDir = path.join(folderPath, createCombinationDirectoryName(batchStart + comboIndex, combination));

    for (const file of selectedFiles) {
      onProgress?.({
        phase: 'processing',
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
        currentFile: file.relativePath,
        currentCombination: combination
      });

      await processOne(file, folderPath, outputDir, combination, options);
      completed += 1;

      onProgress?.({
        phase: 'processing',
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 100,
        currentFile: file.relativePath,
        currentCombination: combination
      });
    }
  }

  onProgress?.({ phase: 'completed', total, completed, percent: 100 });

  return {
    totalFiles: selectedFiles.length,
    totalCombinations: combinations.length,
    totalOutputs: total,
    outputRoot: folderPath,
    combinations
  };
}

async function processOne(file, folderPath, outputDir, combination, options) {
  const outputPath = path.join(outputDir, file.relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const decoded = await sharp(file.absolutePath, { limitInputPixels: false })
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = Math.max(1, decoded.info.width - combination.widthDelta);
  const height = Math.max(1, decoded.info.height - combination.heightDelta);
  const brightness = 1 + combination.brightness;

  let pipeline = sharp(decoded.data, {
    raw: {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels
    },
    limitInputPixels: false
  })
    .resize({ width, height, fit: 'fill' })
    .modulate({ brightness });

  if (options.watermark?.enabled) {
    pipeline = pipeline.composite([{
      input: createWatermarkSvg(width, height, options.watermark),
      gravity: 'southeast'
    }]);
  }

  const ext = path.extname(outputPath).toLowerCase();
  if (ext === '.png') {
    await pipeline.png({ compressionLevel: 6, adaptiveFiltering: true }).toFile(outputPath);
  } else {
    await pipeline
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: combination.quality, mozjpeg: true })
      .toFile(outputPath);
  }

  return outputPath;
}

function buildCombinations(options = {}) {
  const qualities = parseQualityValues(options.qualities || '99');
  const sizes = parseSizeValues(options.sizes || '10x10');
  const brightnessValues = parseBrightnessValues(options.brightnessValues || '0');
  const combinations = [];

  for (const quality of qualities) {
    for (const size of sizes) {
      for (const brightness of brightnessValues) {
        combinations.push({
          quality,
          widthDelta: size.widthDelta,
          heightDelta: size.heightDelta,
          brightness
        });
      }
    }
  }

  return combinations;
}

function parseQualityValues(value) {
  return uniqueNumbers(parseNumberList(value)
    .map((item) => clamp(Math.round(item), 60, 99)));
}

function parseSizeValues(value) {
  const parts = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  const parsed = parts.map((part) => {
    const match = part.match(/^(\d{1,3})(?:x(\d{1,3}))?$/i);
    if (!match) throw new Error(`Invalid size value: ${part}`);
    const widthDelta = clamp(Number(match[1]), 1, 120);
    const heightDelta = clamp(Number(match[2] || match[1]), 1, 120);
    return { widthDelta, heightDelta };
  });

  return uniqueObjects(parsed, (item) => `${item.widthDelta}x${item.heightDelta}`);
}

function parseBrightnessValues(value) {
  return uniqueNumbers(parseNumberList(value)
    .map((item) => Number(clamp(item, -0.5, 0.5).toFixed(3))));
}

function parseNumberList(value) {
  const items = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  if (items.length === 0) throw new Error('Parameter list cannot be empty.');
  return items.map((item) => {
    const number = Number(item);
    if (Number.isNaN(number)) throw new Error(`Invalid number: ${item}`);
    return number;
  });
}

function createCombinationDirectoryName(timestamp, combination) {
  return [
    timestamp,
    't45',
    `c${combination.widthDelta}x${combination.heightDelta}`,
    `l${combination.brightness.toFixed(3)}`,
    `q${combination.quality}`
  ].join('-');
}

function createWatermarkSvg(width, height, watermark) {
  const text = escapeXml(watermark.text || 'qtddp');
  const fontSize = Number(watermark.fontSize || 54);
  const opacity = Number(watermark.opacity ?? 0.45);
  const color = watermark.color || 'rgb(80,80,80)';
  const padding = Math.max(24, Math.round(Math.min(width, height) * 0.035));

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width - padding}" y="${height - padding}"
        text-anchor="end"
        font-family="Arial, Microsoft YaHei, sans-serif"
        font-size="${fontSize}"
        fill="${escapeXml(color)}"
        fill-opacity="${opacity}">${text}</text>
    </svg>
  `);
}

async function walk(root, onFile) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) continue;
      await walk(fullPath, onFile);
    } else if (entry.isFile()) {
      await onFile(fullPath, await fs.stat(fullPath));
    }
  }
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function uniqueNumbers(values) {
  return [...new Set(values)];
}

function uniqueObjects(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

module.exports = {
  scanFolder,
  duplicateImages,
  buildCombinations,
  parseQualityValues,
  parseSizeValues,
  parseBrightnessValues
};
