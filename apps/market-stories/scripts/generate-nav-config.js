const fs = require('fs');
const path = require('path');

const EXCLUDED_FOLDERS = ['public'];
const INCLUDE_FILE_TYPE = ['md'];
const targetPath = path.join(__dirname, '../docs/src');
// 输出文件地址
const outputPath = path.join(targetPath, 'nav-config.mts');

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
 * 获取md中title属性
 */
const getTitleOfMarkdown = (file) => {
  try {
    const data = fs.readFileSync(file, 'utf8');
    // 使用正则表达式匹配title的值
    const titleMatch = data.match(/title:\s*(.*)/);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1];
    }
    // 如果没有title属性，匹配一级标题 # Title
    const h1Match = data.match(/^#\s+(.*)/m);
    if (h1Match && h1Match[1]) {
      // 移除可能的 (English Title) 后缀
      return h1Match[1].replace(/\s*\(.*\)$/, '').trim();
    }
    return '';
  } catch (e) {
    console.log('e', e);
    return '';
  }
};

/**
 * 写文件
 */
const writeFile = async (config) => {
  const sortOrder = {
    前端初阶: 1,
    前端中阶: 2,
    前端高阶: 3,
    学习笔记: 4,
    面经: 5,
  };
  const sortedConfig = config.sort((a, b) => sortOrder[a.text] - sortOrder[b.text]);
  let str = JSON.stringify(sortedConfig, null, 2);
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
 * 生成nav config
 */
const getNavConfig = (dirs) => {
  // eslint-disable-next-line no-useless-escape
  const regex = /[\\\/]([^\\\/]+)$/; // 匹配最后一个斜杠后面的内容
  const config = [];
  for (let i = 0; i < dirs.length; i++) { // 遍历一级路径
    const dir = dirs[i];
    const configItem = {};
    const indexPath = `${dir}/index.md`;
    const titleOfMd = getTitleOfMarkdown(indexPath);
    configItem.text = titleOfMd;
    const lastPathOfFistLevel = dir.match(regex)[1]; // 获取最后一级路径作为key

    // 新逻辑：直接在一级目录下查找 .md 文件，而不是进入二级目录
    // 检查是否包含 md 文件（除了 index.md）
    const files = fs.readdirSync(dir);
    const hasMdFiles = files.some((file) => file.endsWith('.md') && file !== 'index.md');

    if (hasMdFiles) {
      configItem.link = `/${lastPathOfFistLevel}/`;
      configItem.activeMatch = `/${lastPathOfFistLevel}/`;
      config.push(configItem);
      continue;
    }

    // 兼容旧逻辑：如果存在二级目录
    const secondLevelDirs = fs.readdirSync(dir);
    let hasSubDirs = false;
    for (let j = 0; j < secondLevelDirs.length; j++) { // 遍历二级路径
      const secondLevelDir = secondLevelDirs[j];
      const secondLevelDirPath = path.join(dir, secondLevelDir);
      const secondLevelDirstat = fs.statSync(secondLevelDirPath);
      if (secondLevelDirstat.isDirectory() && !configItem.link) {
        hasSubDirs = true;
        const subFiles = fs.readdirSync(secondLevelDirPath);
        configItem.link = `/${lastPathOfFistLevel}/${secondLevelDir}/${subFiles.filter((file) => file !== 'index.md')[0]}`;
      }
    }

    configItem.activeMatch = `/${lastPathOfFistLevel}/`;
    config.push(configItem);
  }
  return config;
};

const generateNavConfig = () => {
  const dirs = getDirsPath();
  const navConfig = getNavConfig(dirs);
  writeFile(navConfig);
  console.info('nav-config生成成功！');
};

module.exports = generateNavConfig;
