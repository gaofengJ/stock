const fs = require('fs');
const path = require('path');

const EXCLUDED_FOLDERS = ['public'];
const INCLUDE_FILE_TYPE = ['md'];
const targetPath = path.join(__dirname, '../docs/src');
// 输出文件地址
const outputPath = path.join(targetPath, 'sidebar-config.mts');

/**
 * 获取文件名后缀
 */
const getFileExtension = (fileName) => {
  const match = fileName.match(/\.([^.]+)$/);
  if (match) {
    return match[1];
  }
  return ''; // 如果没有匹配到点，返回空字符串或其他默认值
};

/**
 * 获取md中属性
 */
const getInfoOfMarkdown = (file) => {
  try {
    const data = fs.readFileSync(file, 'utf8');
    // 使用正则表达式匹配title的值
    const titleMatch = data.match(/title:\s*(.*)/);
    // 使用正则表达式匹配collapsed的值
    const collapsedMatch = data.match(/collapsed:\s*(.*)/);

    let title = '';
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1];
    } else {
      // 尝试匹配一级标题 # Title
      const h1Match = data.match(/^#\s+(.*)/m);
      if (h1Match && h1Match[1]) {
        // 移除可能的 (English Title) 后缀
        title = h1Match[1].replace(/\s*\(.*\)$/, '').trim();
      }
    }

    return {
      title,
      collapsed: collapsedMatch ? !!collapsedMatch[1] : false,
    };
  } catch (e) {
    console.log('e', e);
    return { title: '', collapsed: false };
  }
};

/**
 * 写文件
 */
const writeFile = async (config) => {
  let str = JSON.stringify(config, null, 2);
  str = str.replace(/"/g, "'");
  await fs.writeFileSync(outputPath, `export default ${str}`);
};

/**
 * 获取存放源md文件的目录
 */
const getDirsPath = () => {
  try {
    const ret = [];
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
    console.log('e', e);
  }
};

/**
 * 生成sidebar config
 */
const getSideBarConfig = (dirs) => {
  // eslint-disable-next-line no-useless-escape
  const regex = /[\\\/]([^\\\/]+)$/; // 匹配最后一个斜杠后面的内容
  const config = {};
  for (let i = 0; i < dirs.length; i++) { // 遍历一级路径
    const dir = dirs[i];
    const lastPathOfFistLevel = dir.match(regex)[1]; // 获取最后一级路径作为key
    const configValue = [];

    // 新逻辑：处理一级目录下的直接文件（扁平结构）
    // 检查是否是一级目录下的文件
    const files = fs.readdirSync(dir);
    // 过滤出 .md 文件，且不是 index.md
    const mdFiles = files.filter((file) => {
      const filePath = path.join(dir, file);
      const fileStat = fs.statSync(filePath);
      return fileStat.isFile() && file.endsWith('.md') && file !== 'index.md';
    });

    if (mdFiles.length > 0) {
      // 获取当前目录的 title
      const indexPath = `${dir}/index.md`;
      const { title: dirTitle } = getInfoOfMarkdown(indexPath);

      const configValueItem = {
        text: dirTitle,
        items: [
          // 添加导读
          { text: '导读', link: `/${lastPathOfFistLevel}/` },
        ],
      };

      mdFiles.sort((a, b) => {
        // 提取文件名中的数字部分
        const numA = parseInt((a.match(/^\d+/) || [])[0], 10);
        const numB = parseInt((b.match(/^\d+/) || [])[0], 10);
        // 比较数字部分的大小
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b);
      });

      for (const file of mdFiles) {
        const filePath = path.join(dir, file);
        const { title: fileTitle } = getInfoOfMarkdown(filePath);
        configValueItem.items.push({
          text: fileTitle,
          link: `/${lastPathOfFistLevel}/${file.replace(/\.md$/, '')}`,
        });
      }

      configValue.push(configValueItem);
      config[`/${lastPathOfFistLevel}/`] = configValue;
      continue;
    }

    // 旧逻辑：处理二级目录
    const secondLevelDirs = fs.readdirSync(dir);
    for (let j = 0; j < secondLevelDirs.length; j++) { // 遍历二级路径
      const secondLevelDir = secondLevelDirs[j];
      const secondLevelDirPath = path.join(dir, secondLevelDir);
      const secondLevelDirstat = fs.statSync(secondLevelDirPath);
      if (secondLevelDirstat.isDirectory()) {
        const configValueItem = {
          text: '',
          // collapsed: false,
          items: [],
        };
        const indexPath = `${secondLevelDirPath}/index.md`;
        const {
          title: titleOfMd,
          collapsed: collapsedOfMd,
        } = getInfoOfMarkdown(indexPath);
        configValueItem.text = titleOfMd;
        if (collapsedOfMd) {
          configValueItem.collapsed = true;
        }
        let files = fs.readdirSync(secondLevelDirPath);
        files = files.sort((a, b) => {
          // 提取文件名中的数字部分
          const numA = parseInt((a.match(/^\d+/) || [])[0], 10);
          const numB = parseInt((b.match(/^\d+/) || [])[0], 10);
          // 比较数字部分的大小
          return numA - numB;
        });
        for (let k = 0; k < files.length; k++) { // 遍历文件
          const file = files[k];
          const filePath = path.join(secondLevelDirPath, file);
          const fileStat = fs.statSync(filePath);
          const fileSuffix = getFileExtension(filePath);
          if (fileStat.isFile() && INCLUDE_FILE_TYPE.includes(fileSuffix) && file !== 'index.md') {
            const {
              title: fileTitleOfMd,
            } = getInfoOfMarkdown(filePath);
            configValueItem.items.push({
              text: fileTitleOfMd,
              link: `/${lastPathOfFistLevel}/${secondLevelDir}/${file}`,
            });
          }
        }
        configValue.push(configValueItem);
      }
    }
    config[`/${lastPathOfFistLevel}/`] = configValue;
  }
  return config;
};

const generateSideBarConfig = () => {
  const dirs = getDirsPath();
  const sidebarConfig = getSideBarConfig(dirs);
  writeFile(sidebarConfig);
  console.info('sidebar-config生成成功！');
};

module.exports = generateSideBarConfig;
