const fs = require('fs');
const path = require('path');

const EXCLUDED_FOLDERS = ['public'];
const INCLUDE_FILE_TYPE = ['md'];
const targetPath = path.join(__dirname, '../docs/src');
const outputPath = path.join(targetPath, 'sidebar-config.mts');
// These files are dynamically imported by the theme. This gives every year
// its own JS chunk instead of adding all review entries to VitePress site data.
const archiveOutputDir = path.join(__dirname, '../docs/.vitepress/theme/aizaibingchuan-sidebar');
const legacyArchiveOutputDir = path.join(targetPath, 'public/data/aizaibingchuan-sidebar');
const legacyPublicArchiveOutputDir = path.join(__dirname, '../docs/public/data/aizaibingchuan-sidebar');

console.log('Target Path:', targetPath);
console.log('Output Path:', outputPath);

/**
 * @param {string} fileName
 */
const getFileExtension = (fileName) => {
  const match = fileName.match(/\.([^.]+)$/);
  if (match) {
    return match[1];
  }
  return '';
};

const getAizaibingchuanSidebarText = (fileName, fallback) => {
  const titleDate = fallback.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|数据|复盘|$)/);
  if (titleDate) {
    const [, year, month, day] = titleDate;
    return year + '-' + Number(month) + '-' + Number(day);
  }

  const match = fileName.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:-[^.]+)?\.md$/);
  if (!match) {
    return fallback;
  }

  const [, year, month, day] = match;
  return year + '-' + Number(month) + '-' + Number(day);
};

/**
 * @param {string} file
 */
const getInfoOfMarkdown = (file) => {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const titleMatch = data.match(/title:\s*(.*)/);
    const collapsedMatch = data.match(/collapsed:\s*(.*)/);
    const orderMatch = data.match(/order:\s*(.*)/);
    const sourceUrlMatch = data.match(/^source_url:\s*(.*)/m);

    let title = '';
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
      if (title.startsWith('"') && title.endsWith('"')) {
        try {
          title = JSON.parse(title);
        } catch (e) {
          title = title.slice(1, -1);
        }
      }
    } else {
      const h1Match = data.match(/^#\s+(.*)/m);
      if (h1Match && h1Match[1]) {
        title = h1Match[1].replace(/\s*\(.*\)$/, '').trim();
      }
    }

    return {
      title,
      collapsed: collapsedMatch ? !!collapsedMatch[1] : false,
      order: orderMatch ? parseFloat(orderMatch[1]) : 9999,
      hasSourceUrl: !!sourceUrlMatch,
    };
  } catch (e) {
    console.log('Error reading markdown:', file, e);
    return { title: '', collapsed: false, order: 9999, hasSourceUrl: false };
  }
};

/**
 * @param {object} config
 */
const writeFile = async (config) => {
  try {
    let str = JSON.stringify(config, null, 2);
    str = str.replace(/"/g, "'");
    fs.writeFileSync(outputPath, `export default ${str}`);
    console.log('File written successfully.');
  } catch (e) {
    console.error('Error writing file:', e);
  }
};

const writeAizaibingchuanArchive = (years) => {
  fs.mkdirSync(archiveOutputDir, { recursive: true });
  fs.writeFileSync(
    path.join(archiveOutputDir, 'index.json'),
    JSON.stringify({ years }, null, 2),
  );
};

const getDirsPath = () => {
  try {
    const ret = [];
    if (!fs.existsSync(targetPath)) {
      console.error('Target path does not exist:', targetPath);
      return [];
    }
    const dirs = fs.readdirSync(targetPath);
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      if (EXCLUDED_FOLDERS.includes(dir)) continue;
      const tempPath = path.join(targetPath, dir);
      const stat = fs.statSync(tempPath);
      if (stat.isDirectory()) {
        ret.push(tempPath);
      }
    }
    return ret;
  } catch (e) {
    console.log('Error getting dirs:', e);
    return [];
  }
};

/**
 * @param {string[]} dirs
 */
const getSideBarConfig = (dirs) => {
  // eslint-disable-next-line no-useless-escape
  const regex = /[\\\/]([^\\\/]+)$/;
  const config = {};
  const aizaibingchuanYears = [];
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const match = dir.match(regex);
    if (!match) continue;
    const lastPathOfFistLevel = match[1];
    const configValue = [];

    const secondLevelDirs = fs.readdirSync(dir);
    for (let j = 0; j < secondLevelDirs.length; j++) {
      const secondLevelDir = secondLevelDirs[j];
      const secondLevelDirPath = path.join(dir, secondLevelDir);
      const secondLevelDirstat = fs.statSync(secondLevelDirPath);
      if (secondLevelDirstat.isDirectory()) {
        const configValueItem = {
          text: '',
          items: [],
        };
        const indexPath = `${secondLevelDirPath}/index.md`;

        if (fs.existsSync(indexPath)) {
          const { title: titleOfMd, collapsed: collapsedOfMd } = getInfoOfMarkdown(indexPath);
          configValueItem.text = titleOfMd;
          if (collapsedOfMd) configValueItem.collapsed = true;
        } else {
          configValueItem.text = secondLevelDir;
        }

        const entries = fs.readdirSync(secondLevelDirPath).filter((file) => file !== 'index.md');
        const files = [];
        const subDirs = [];

        entries.forEach((entry) => {
          const entryPath = path.join(secondLevelDirPath, entry);
          try {
            const stat = fs.statSync(entryPath);
            if (stat.isFile()) {
              files.push(entry);
            } else if (stat.isDirectory()) {
              subDirs.push(entry);
            }
          } catch (e) {
            // ignore
          }
        });

        files.sort((a, b) => {
          const filePathA = path.join(secondLevelDirPath, a);
          const filePathB = path.join(secondLevelDirPath, b);
          const infoA = getInfoOfMarkdown(filePathA);
          const infoB = getInfoOfMarkdown(filePathB);
          if (infoA.order !== 9999 || infoB.order !== 9999) return infoA.order - infoB.order;
          const numA = parseFloat((a.match(/[\d.]+/) || [])[0]);
          const numB = parseFloat((b.match(/[\d.]+/) || [])[0]);
          if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
          return 0;
        });

        for (let k = 0; k < files.length; k++) {
          const file = files[k];
          const filePath = path.join(secondLevelDirPath, file);
          const fileSuffix = getFileExtension(filePath);
          if (INCLUDE_FILE_TYPE.includes(fileSuffix)) {
            const { title: fileTitleOfMd } = getInfoOfMarkdown(filePath);
            configValueItem.items.push({
              text: fileTitleOfMd,
              link: `/${lastPathOfFistLevel}/${secondLevelDir}/${file}`,
            });
          }
        }

        subDirs.sort((a, b) => {
          const pathA = path.join(secondLevelDirPath, a, 'index.md');
          const pathB = path.join(secondLevelDirPath, b, 'index.md');
          let orderA = 9999;
          let orderB = 9999;
          if (fs.existsSync(pathA)) orderA = getInfoOfMarkdown(pathA).order;
          if (fs.existsSync(pathB)) orderB = getInfoOfMarkdown(pathB).order;
          if (orderA !== 9999 || orderB !== 9999) return orderA - orderB;
          return parseFloat(a) - parseFloat(b);
        });

        subDirs.forEach((subDir) => {
          const subDirPath = path.join(secondLevelDirPath, subDir);
          const subDirFiles = fs.readdirSync(subDirPath)
            .filter((f) => f !== 'index.md' && INCLUDE_FILE_TYPE.includes(getFileExtension(f)));

          subDirFiles.sort((a, b) => {
            if (lastPathOfFistLevel === 'reviews' && secondLevelDir === 'aizaibingchuan') {
              const filePathA = path.join(subDirPath, a);
              const filePathB = path.join(subDirPath, b);
              const infoA = getInfoOfMarkdown(filePathA);
              const infoB = getInfoOfMarkdown(filePathB);
              if (infoA.order !== 9999 || infoB.order !== 9999) {
                const orderDiff = infoA.order - infoB.order;
                if (orderDiff !== 0) return orderDiff;
              }
            }

            const dateA = a.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            const dateB = b.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (dateA && dateB) {
              const timeA = new Date(
                parseInt(dateA[1], 10),
                parseInt(dateA[2], 10) - 1,
                parseInt(dateA[3], 10),
              ).getTime();
              const timeB = new Date(
                parseInt(dateB[1], 10),
                parseInt(dateB[2], 10) - 1,
                parseInt(dateB[3], 10),
              ).getTime();
              return timeA - timeB;
            }
            const numA = parseFloat((a.match(/[\d.]+/) || [])[0]);
            const numB = parseFloat((b.match(/[\d.]+/) || [])[0]);
            if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
            return 0;
          });

          const subGroup = {
            text: subDir,
            collapsed: true,
            items: [],
          };

          const subDirPathIndex = path.join(subDirPath, 'index.md');
          if (fs.existsSync(subDirPathIndex)) {
            const { title: titleOfSubMd } = getInfoOfMarkdown(subDirPathIndex);
            if (titleOfSubMd) {
              subGroup.text = titleOfSubMd;
            }
          }

          const aizaibingchuanItems = new Map();
          subDirFiles.forEach((file) => {
            const filePath = path.join(subDirPath, file);
            const { title, hasSourceUrl, order } = getInfoOfMarkdown(filePath);
            const text = lastPathOfFistLevel === 'reviews'
              && secondLevelDir === 'aizaibingchuan'
              && /^\d{4}$/.test(subDir)
              ? getAizaibingchuanSidebarText(file, title)
              : title;
            const item = {
              text: lastPathOfFistLevel === 'reviews'
                && secondLevelDir === 'aizaibingchuan'
                && /^\d{4}$/.test(subDir)
                ? text
                : title,
              link: `/${lastPathOfFistLevel}/${secondLevelDir}/${subDir}/${file}`,
            };
            const isAizaibingchuanYear = lastPathOfFistLevel === 'reviews'
              && secondLevelDir === 'aizaibingchuan'
              && /^\d{4}$/.test(subDir);
            if (!isAizaibingchuanYear) {
              subGroup.items.push(item);
              return;
            }
            aizaibingchuanItems.set(text, [
              ...(aizaibingchuanItems.get(text) || []),
              { ...item, hasSourceUrl, order },
            ]);
          });

          if (lastPathOfFistLevel === 'reviews'
            && secondLevelDir === 'aizaibingchuan'
            && /^\d{4}$/.test(subDir)) {
            aizaibingchuanItems.forEach((items, text) => {
              items.sort((a, b) => {
                if (a.hasSourceUrl !== b.hasSourceUrl) return a.hasSourceUrl ? -1 : 1;
                return a.order - b.order;
              });
              const usedTexts = new Set([text]);
              items.forEach(({ hasSourceUrl, order, ...item }, index) => {
                if (index > 0) {
                  const time = String(Math.floor(order) % 10_000).padStart(4, '0');
                  let suffix = time === '0000' ? (hasSourceUrl ? 'source' : 'legacy') : time;
                  let candidate = `${text}-${suffix}`;
                  let serial = 2;
                  while (usedTexts.has(candidate)) candidate = `${text}-${suffix}-${serial++}`;
                  usedTexts.add(candidate);
                  item.text = candidate;
                }
                subGroup.items.push(item);
              });
            });

            const archivePath = path.join(archiveOutputDir, `${subDir}.json`);
            fs.mkdirSync(archiveOutputDir, { recursive: true });
            fs.writeFileSync(
              archivePath,
              JSON.stringify({ year: subDir, items: subGroup.items }, null, 2),
            );
            aizaibingchuanYears.push({ year: subDir, text: subGroup.text });
            return;
          }

          configValueItem.items.push(subGroup);
        });

        configValue.push(configValueItem);
      }
    }
    config[`/${lastPathOfFistLevel}/`] = configValue;
  }
  writeAizaibingchuanArchive(aizaibingchuanYears);
  return config;
};

const generateSideBarConfig = () => {
  console.log('Starting generation...');
  fs.rmSync(archiveOutputDir, { recursive: true, force: true });
  fs.rmSync(legacyArchiveOutputDir, { recursive: true, force: true });
  fs.rmSync(legacyPublicArchiveOutputDir, { recursive: true, force: true });
  const dirs = getDirsPath();
  console.log('Dirs found:', dirs.length);
  const sidebarConfig = getSideBarConfig(dirs);
  writeFile(sidebarConfig);
  console.info('sidebar-config生成成功！');
};

module.exports = generateSideBarConfig;
