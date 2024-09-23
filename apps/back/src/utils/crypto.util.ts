import CryptoJS from 'crypto-js';

// 定义AES加密的密钥，将字符串转为UTF-8编码格式
const key = CryptoJS.enc.Utf8.parse('MUFENGTONGXUEjgf'); // 128位密钥
// 定义AES加密的初始向量（IV），同样转为UTF-8编码格式
const iv = CryptoJS.enc.Utf8.parse('JGFmufengtongxue'); // 128位初始向量

/**
 * @description AES加密函数
 */
export function aesEncrypt(data: string) {
  if (!data) return data;

  // 使用AES算法进行加密，模式为CBC（需要初始向量），填充方式为Pkcs7
  const enc = CryptoJS.AES.encrypt(data, key, {
    iv, // 初始向量
    mode: CryptoJS.mode.CBC, // 加密模式：CBC
    padding: CryptoJS.pad.Pkcs7, // 填充方式：Pkcs7
  });

  // 将加密后的内容转为字符串并返回
  return enc.toString();
}

/**
 * @description AES解密函数
 */
export function aesDecrypt(data: string) {
  if (!data) return null;

  try {
    // 使用AES算法进行解密，参数与加密时一致
    const dec = CryptoJS.AES.decrypt(data, key, {
      iv, // 初始向量
      mode: CryptoJS.mode.CBC, // 解密模式：CBC
      padding: CryptoJS.pad.Pkcs7, // 填充方式：Pkcs7
    });

    // 将解密结果转换为UTF-8字符串
    return dec.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

/**
 * MD5哈希函数
 */
export function md5(str: string) {
  // 使用MD5算法对字符串进行哈希，并转为字符串
  return CryptoJS.MD5(str).toString();
}
