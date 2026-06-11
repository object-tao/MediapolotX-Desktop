# AI Prompt Library Assets

提示词库图片建议按分类存放，文件名使用序号和简短英文标识，避免中文路径在跨平台打包后出现兼容问题。

推荐目录：

```text
assets/prompt-library/
  images/
    article-rewrite/
      001-customs-notice.png
    image-process/
      001-cover-title.png
    ai-marker/
      001-publish-check.png
```

第一版页面使用内联 SVG 作为默认封面，后续新增“上传图片”功能时，可将用户图片复制到 Electron `app.getPath('userData')/prompt-library/images/` 下，再把相对路径保存到提示词记录。
