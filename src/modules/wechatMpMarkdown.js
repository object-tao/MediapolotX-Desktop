const fs = require('node:fs/promises');
const path = require('node:path');
const axios = require('axios');
const cheerio = require('cheerio');
const TurndownService = require('turndown');

async function downloadArticle(url, options = {}) {
  const outputDir = options.outputDir || process.cwd();
  const imageMode = options.imageMode || 'save';
  await fs.mkdir(outputDir, { recursive: true });

  const html = await fetchArticleHtml(url);
  const article = parseArticle(html, url);
  const safeTitle = sanitizeFilename(article.title || 'wechat-article');
  const imageDir = path.join(outputDir, `${safeTitle}_images`);
  const markdown = await convertToMarkdown(article, { imageMode, imageDir });
  const mdPath = path.join(outputDir, `${safeTitle}.md`);

  await fs.writeFile(mdPath, markdown, 'utf8');

  return {
    title: article.title,
    author: article.author,
    publishTime: article.publishTime,
    mdPath,
    imageDir: imageMode === 'save' ? imageDir : null
  };
}

async function fetchArticleHtml(url) {
  const response = await axios.get(url, {
    timeout: 30000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Referer: 'https://mp.weixin.qq.com/'
    },
    transformResponse: [(data) => data]
  });
  return response.data;
}

function parseArticle(html, url) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const title = cleanText($('#activity-name').text()) || extractJsString(html, 'msg_title') || $('title').text();
  const author = cleanText($('#js_name').text()) || extractJsString(html, 'nickname');
  const publishTime = cleanText($('#publish_time').text()) || extractJsString(html, 'publish_time');
  const content = $('#js_content').length ? $('#js_content') : $('body');

  content.find('script, style, iframe, svg, wx-open-launch-app, wx-open-launch-weapp').remove();
  content.find('[style]').removeAttr('style');
  content.find('[class]').removeAttr('class');
  content.find('[id]').removeAttr('id');
  content.find('img').each((_index, element) => {
    const img = $(element);
    const src = img.attr('data-src') || img.attr('src') || img.attr('data-backsrc');
    if (src) img.attr('src', normalizeImageUrl(src));
  });

  return {
    url,
    title: cleanText(title),
    author,
    publishTime,
    contentHtml: content.html() || ''
  };
}

async function convertToMarkdown(article, options) {
  const $ = cheerio.load(article.contentHtml, { decodeEntities: false });
  const imageTasks = [];

  $('img').each((index, element) => {
    const img = $(element);
    const src = img.attr('src');
    if (!src) return;

    if (options.imageMode === 'url') {
      img.attr('src', src);
      return;
    }

    if (options.imageMode === 'base64') {
      imageTasks.push(replaceImageWithBase64(img, src));
      return;
    }

    imageTasks.push(saveImageAndReplace(img, src, options.imageDir, index));
  });

  await Promise.all(imageTasks);

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-'
  });

  const body = turndown.turndown($.html());
  return [
    `# ${article.title || '微信公众号文章'}`,
    '',
    article.author ? `> 作者：${article.author}` : null,
    article.publishTime ? `> 发布时间：${article.publishTime}` : null,
    `> 原文：${article.url}`,
    '',
    body.trim(),
    ''
  ].filter((line) => line !== null).join('\n');
}

async function saveImageAndReplace(img, src, imageDir, index) {
  await fs.mkdir(imageDir, { recursive: true });
  const response = await axios.get(src, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Referer: 'https://mp.weixin.qq.com/'
    }
  });
  const extension = inferImageExtension(response.headers['content-type'], src);
  const filename = `image_${String(index + 1).padStart(3, '0')}${extension}`;
  await fs.writeFile(path.join(imageDir, filename), Buffer.from(response.data));
  img.attr('src', `${path.basename(imageDir)}/${filename}`);
}

async function replaceImageWithBase64(img, src) {
  const response = await axios.get(src, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Referer: 'https://mp.weixin.qq.com/'
    }
  });
  const contentType = response.headers['content-type'] || 'image/jpeg';
  const base64 = Buffer.from(response.data).toString('base64');
  img.attr('src', `data:${contentType};base64,${base64}`);
}

function normalizeImageUrl(src) {
  if (src.startsWith('//')) return `https:${src}`;
  return src.replaceAll('&amp;', '&');
}

function inferImageExtension(contentType = '', src = '') {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  const ext = path.extname(new URL(src).pathname);
  return ext || '.jpg';
}

function extractJsString(html, key) {
  const match = html.match(new RegExp(`var\\s+${key}\\s*=\\s*['"]([^'"]*)['"]`));
  return match ? cleanText(match[1].replaceAll('\\x26', '&')) : '';
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function sanitizeFilename(value) {
  return cleanText(value)
    .replace(/[<>:"/\\|?*]/g, '_')
    .slice(0, 120) || 'wechat-article';
}

module.exports = {
  downloadArticle,
  parseArticle,
  sanitizeFilename
};
