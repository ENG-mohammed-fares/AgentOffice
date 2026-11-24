// Automatically resolves github OWNER/REPO in GitHub Actions.
// For local distributable builds with auto-update, set AGENTOFFICE_REPO=owner/repo.
// An unconfigured local installer runs normally but cannot auto-update.
const repository = process.env.AGENTOFFICE_REPO || process.env.GITHUB_REPOSITORY || 'ENG-mohammed-fares/AgentOffice';
const parts = repository.split('/');
const validRepo = parts.length === 2 && parts.every((s) => /^[a-zA-Z0-9_.-]+$/.test(s));

if (process.argv.some((a) => a.includes('publish') && a.includes('always')) && !validRepo) {
  throw new Error('Missing GitHub repository: set AGENTOFFICE_REPO=owner/repo or build on GitHub Actions.');
}

module.exports = {
  appId: 'com.agentoffice.desktop',
  productName: 'AgentOffice',
  directories: { output: 'release', buildResources: 'build' },
  files: [
    'dist/**/*',
    'electron/**/*',
    'build/icon.png',
    'package.json',
    'node_modules/electron-updater/**/*'
  ],
  asar: true,
  compression: 'normal',
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
    artifactName: 'AgentOffice-Setup-${version}-${arch}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'AgentOffice'
  },
  publish: validRepo ? [{
    provider: 'github', owner: parts[0], repo: parts[1], releaseType: 'release'
  }] : []
};
