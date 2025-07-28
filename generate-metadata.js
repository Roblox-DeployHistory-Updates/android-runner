const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('yaml');

const versionCode = process.env.VERSION_CODE;
if (!versionCode) {
  console.error('VERSION_CODE env variable is required');
  process.exit(1);
}

const apkFile = `com.roblox.client-${versionCode}.apk`;
if (!fs.existsSync(apkFile)) {
  console.error(`APK file not found: ${apkFile}`);
  process.exit(1);
}

// Decode APK with apktool
const tmpDir = fs.mkdtempSync('/tmp/apktool-');
try {
  execSync(`apktool d -f -o "${tmpDir}" "${apkFile}"`, { stdio: 'ignore' });

  // Read apktool.yml for metadata using 'yaml' library
  const apktoolYmlPath = path.join(tmpDir, 'apktool.yml');
  const apktoolYmlContent = fs.readFileSync(apktoolYmlPath, 'utf8');
  const apktoolYml = yaml.parse(apktoolYmlContent);

  // Extract values from parsed YAML
  const minSdk = apktoolYml.sdkInfo?.minSdkVersion || '';
  const targetSdk = apktoolYml.sdkInfo?.targetSdkVersion || '';
  const versionName = apktoolYml.versionInfo?.versionName || '';
  const versionCodeAttr = apktoolYml.versionInfo?.versionCode || '';

  // Read AndroidManifest.xml for package name and icon
  const manifestPath = path.join(tmpDir, 'AndroidManifest.xml');
  const manifestXml = fs.readFileSync(manifestPath, 'utf8');
  const getAttr = (attr) => {
    const match = manifestXml.match(new RegExp(`${attr}="([^"]+)"`));
    return match ? match[1] : '';
  };
  const packageName = 'com.roblox.client'; // HACK NEEDED: apktool is partially broken and cannot parse resources properly

  // Find icon file path from manifest
  let iconPath = '';
  const iconMatch = manifestXml.match(/android:icon="(@[a-zA-Z0-9_\/]+)"/);
  if (iconMatch) {
    // Find the actual icon file in the resources
    const resDir = path.join(tmpDir, 'res');
    const iconResource = iconMatch[1].replace('@', '').replace('mipmap/', 'mipmap-').replace('drawable/', 'drawable-');
    // Try to find the icon in common locations
    const iconCandidates = fs.readdirSync(resDir)
      .filter(d => d.startsWith('mipmap') || d.startsWith('drawable'))
      .map(d => path.join(resDir, d, 'ic_launcher.png'))
      .filter(f => fs.existsSync(f));
    iconPath = iconCandidates.length > 0 ? iconCandidates[0] : '';
  }

  iconPath = '/res/mipmap-hdpi/ic_launcher.png'; // HACK NEEDED: apktool is partially broken and cannot parse resources properly

  // Calculate icon md5 if found
  let iconMd5 = '';
  if (iconPath && fs.existsSync(iconPath)) {
    const iconBuf = fs.readFileSync(iconPath);
    iconMd5 = crypto.createHash('md5').update(iconBuf).digest('hex');
  }

  // START HACK: Extract icon from APK directly
  // This is needed because apktool does not always extract the icon correctly
  const iconZipPath = 'res/mipmap-hdpi-v4/ic_launcher.png';
  const iconTmpPath = path.join(tmpDir, 'ic_launcher.png');

  execSync(`unzip -p "${apkFile}" "${iconZipPath}" > "${iconTmpPath}"`);
  const iconBuf = fs.readFileSync(iconTmpPath);
  iconMd5 = crypto.createHash('md5').update(iconBuf).digest('hex');
  // END HACK

  // Find architectures from config APKs in current directory
  function detectArchitectures() {
    const archSet = new Set();
    const files = fs.readdirSync(process.cwd());
    files.forEach(f => {
      // Match: com.roblox.client-config.arm64_v8a-1810.apk or com.roblox.client-arm64_v8a.apk
      const match = f.match(/com\.roblox\.client(?:-config)?[-_\.](arm64_v8a|armeabi_v7a|x86_64|x86|universal)[-_\.]/i);
      if (match) {
        let arch = match[1].replace('_', '-');
        archSet.add(arch);
      }
    });
    return Array.from(archSet);
  }

  // Write manifest.json
  const architectures = detectArchitectures();
  const meta = {
    apk: apkFile,
    package: packageName,
    versionCode: versionCodeAttr,
    versionName,
    minSdk,
    targetSdk,
    icon: iconPath
      ? path.join(
          '/res',
          path.relative(path.join(tmpDir, 'res'), iconPath)
        ).replace(/\\/g, '/')
      : '',
    iconMd5,
    updatedOn: process.env.UPDATED_ON || ''
  };
  if (architectures.length > 0) {
    meta.architectures = architectures;
  }

  fs.writeFileSync('manifest.json', JSON.stringify(meta, null, 2));
  console.log('manifest.json created:', meta);
} catch (e) {
  console.error('Failed to generate metadata:', e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}