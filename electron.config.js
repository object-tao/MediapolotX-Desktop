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
    icon: 'assets/icons/app.ico',
    target: ['nsis', 'zip']
  },
  mac: {
    icon: 'assets/icons/app.png',
    target: ['dmg', 'zip'],
    category: 'public.app-category.photography'
  },
  linux: {
    icon: 'assets/icons/app.png',
    target: ['AppImage', 'deb'],
    category: 'Graphics'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
};
