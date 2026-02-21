const fs = require('fs');
const path = require('path');

const EXCLUDED_FOLDERS = ['public'];
const INCLUDE_FILE_TYPE = ['md'];
const targetPath = path.join(__dirname, '../docs/src');
const outputPath = path.join(targetPath, 'sidebar-config.mts');

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

/**
 * @param {string} file
 */
const getInfoOfMarkdown = (file) => {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const titleMatch = data.match(/title:\s*(.*)/);
    const collapsedMatch = data.match(/collapsed:\s*(.*)/);
    const orderMatch = data.match(/order:\s*(.*)/);

    let title = '';
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1];
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
    };
  } catch (e) {
    console.log('Error reading markdown:', file, e);
    return { title: '', collapsed: false, order: 9999 };
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

        subDirs.sort((a, b) => parseFloat(a) - parseFloat(b));

        subDirs.forEach((subDir) => {
          const subDirPath = path.join(secondLevelDirPath, subDir);
          const subDirFiles = fs.readdirSync(subDirPath)
            .filter((f) => f !== 'index.md' && INCLUDE_FILE_TYPE.includes(getFileExtension(f)));

          subDirFiles.sort((a, b) => {
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

          subDirFiles.forEach((file) => {
            const filePath = path.join(subDirPath, file);
            const { title } = getInfoOfMarkdown(filePath);
            subGroup.items.push({
              text: title,
              link: `/${lastPathOfFistLevel}/${secondLevelDir}/${subDir}/${file}`,
            });
          });

          configValueItem.items.push(subGroup);
        });

        configValue.push(configValueItem);
      }
    }
    config[`/${lastPathOfFistLevel}/`] = configValue;
  }
  return config;
};

const generateSideBarConfig = () => {
  console.log('Starting generation...');
  const dirs = getDirsPath();
  console.log('Dirs found:', dirs.length);
  const sidebarConfig = getSideBarConfig(dirs);
  writeFile(sidebarConfig);
  console.info('sidebar-config生成成功！');
};

module.exports = generateSideBarConfig;
