const path = require('node:path');
const os = require('node:os');

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];

module.exports = {
  appName: 'MediapolotX Desktop',
  defaultApiBaseUrl: process.env.MEDIAPOLOTX_API_BASE_URL || 'http://127.0.0.1:3000/api',
  userDataFallback: path.join(os.homedir(), '.mediapolotx-desktop'),
  supportedImageExtensions: SUPPORTED_IMAGE_EXTENSIONS,
  supportedVideoExtensions: SUPPORTED_VIDEO_EXTENSIONS,
  thumbnail: {
    width: 512,
    height: 512,
    quality: 78
  }
};
