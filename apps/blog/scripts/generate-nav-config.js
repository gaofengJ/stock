const fs = require('fs');
const path = require('path');

const EXCLUDED_FOLDERS = ['public'];
const INCLUDE_FILE_TYPE = ['md'];
const targetPath = path.join(__dirname, '../docs/src');
// 输出文件地址
const outputPath = path.join(targetPath, 'nav-config.mts');

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
 * 生成nav config
 */
const getNavConfig = (dirs) => {
  // eslint-disable-next-line no-useless-escape
  const regex = /[\\\/]([^\\\/]+)$/; // 匹配最后一个斜杠后面的内容
  
  // 定义固定顺序和对应的显示文本（如果需要覆盖默认title）
  const ORDER_MAP = {
    'trading-rules': { order: 1, text: '交易规则' },
    'technical-game-patterns': { order: 2, text: '技术分析' },
    'thematic-driving-force': { order: 3, text: '题材逻辑' },
    'sentiment-cycle': { order: 4, text: '情绪周期' },
    'risk-management': { order: 5, text: '风险管控' },
    'case-study': { order: 6, text: '复盘文档' }
  };

  const config = [];
  for (let i = 0; i < dirs.length; i++) { // 遍历一级路径
    const dir = dirs[i];
    const configItem = {};
    const indexPath = `${dir}/index.md`;
    const titleOfMd = getTitleOfMarkdown(indexPath);
    
    const lastPathOfFistLevel = dir.match(regex)[1]; // 获取最后一级路径作为key
    
    // 如果在固定顺序映射中，使用映射的文本和顺序，否则使用默认title
    if (ORDER_MAP[lastPathOfFistLevel]) {
      configItem.text = ORDER_MAP[lastPathOfFistLevel].text;
      configItem.order = ORDER_MAP[lastPathOfFistLevel].order;
    } else {
      configItem.text = titleOfMd;
      configItem.order = 999; // 其他项排在最后
    }

    // 优先使用目录下的 index.md 作为导航链接
    configItem.link = `/${lastPathOfFistLevel}/index.md`;

    // 兼容旧逻辑：如果存在二级目录
    const secondLevelDirs = fs.readdirSync(dir);
    // let hasSubDirs = false;
    for (let j = 0; j < secondLevelDirs.length; j++) { // 遍历二级路径
      const secondLevelDir = secondLevelDirs[j];
      const secondLevelDirPath = path.join(dir, secondLevelDir);
      const secondLevelDirstat = fs.statSync(secondLevelDirPath);
      if (secondLevelDirstat.isDirectory() && !configItem.link) {
        // hasSubDirs = true;
        const subFiles = fs.readdirSync(secondLevelDirPath);
        configItem.link = `/${lastPathOfFistLevel}/${secondLevelDir}/${subFiles.filter((file) => file !== 'index.md')[0]}`;
      }
    }

    configItem.activeMatch = `/${lastPathOfFistLevel}/`;
    config.push(configItem);
  }
  
  // 根据order字段排序
  config.sort((a, b) => a.order - b.order);
  
  // 移除临时使用的order字段
  return config.map(({ order, ...item }) => item);
};

const generateNavConfig = () => {
  const dirs = getDirsPath();
  const navConfig = getNavConfig(dirs);
  writeFile(navConfig);
  console.info('nav-config生成成功！');
};

module.exports = generateNavConfig;
