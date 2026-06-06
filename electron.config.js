module.exports = {
  appId: 'com.objecttao.mediapolotx.desktop',
  productName: 'MediapolotX Desktop',
  directories: {
    output: 'release'
  },
  files: [
    'dist/**/*',
    'src/main/**/*',
    'src/modules/**/*',
    'src/utils/**/*',
    'src/config/**/*',
    'assets/**/*',
    'package.json'
  ],
  extraMetadata: {
    main: 'src/main/main.js'
  },
  win: {
    target: ['nsis', 'zip']
  },
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.photography'
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Graphics'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
};
