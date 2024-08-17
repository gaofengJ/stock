/**
 * 生成制定长度的随机字符串
 * @param len 生成字符串的长度，默认32
 * @returns 随机字符串
 */
export const genRandomString = (len = 32) => {
  // 字符集，去掉了容易混淆的字符，如 '0', 'O', 'I', 'l'
  const char = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
  const charLength = char.length;
  let randomString = '';
  for (let i = 0; i < len; i += 1) {
    // // 从字符集中随机选取一个字符并拼接到随机字符串中
    randomString += char.charAt(Math.floor(Math.random() * charLength));
  }
  return randomString;
};

/**
 * 读取 Blob 数据并解析为 JSON 对象
 * @param blobData 要读取的 Blob 数据
 * @returns 解析后的 JSON 对象的 Promise
 */
export function parseJSON<T = any>(blobData: Blob): Promise<T> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    // 读取 Blob 数据为文本
    fileReader.readAsText(blobData, 'utf-8');

    // 成功读取数据
    fileReader.onload = () => {
      try {
        // 尝试解析 JSON 数据
        const ret = JSON.parse(fileReader.result as string);
        resolve(ret);
      } catch (error) {
        // 解析失败，抛出错误
        reject(error);
      }
    };

    // 读取数据出错
    fileReader.onerror = () => {
      reject();
    };
  });
}

// 获取尾数为 0 或 5 的最大值
export const getRoundedMax = (arr: number[]) => {
  const maxVal = Math.max(...arr);
  // 计算初始的最大值，增加 10% 以确保最大值大一点
  const roundedMaxVal = Math.ceil(maxVal * 1.1 * 0.2) * 5;
  // 如果最大值的尾数为 0，则返回该值
  // 如果尾数为 5，则返回该值
  return roundedMaxVal;
};

// 获取尾数为 0 或 5 的最小值
export const getRoundedMin = (arr: number[]) => {
  const minVal = Math.min(...arr);
  // 计算初始的最小值，减少 10% 以确保最小值小一点
  const roundedMinVal = Math.floor(minVal * 0.9 * 0.2) * 5;
  // 如果最小值的尾数为 0 或 5，则返回该值
  return roundedMinVal;
};
