import { Injectable } from '@nestjs/common';

@Injectable()
export class CaptchaService {
  constructor() {}

  /**
   * 校验图片验证码
   */
  async checkImgCaptcha(id: string, code: string): Promise<void> {
    // const result = await this.redis.get(genCaptchaImgKey(id));
    // if (isEmpty(result) || code.toLowerCase() !== result.toLowerCase())
    //   throw new BusinessException(ErrorEnum.INVALID_VERIFICATION_CODE);
    // // 校验成功后移除验证码
    // await this.redis.del(genCaptchaImgKey(id));
    console.info(id, code);
  }

  // async log(
  //   account: string,
  //   code: string,
  //   provider: 'sms' | 'email',
  //   uid?: number,
  // ): Promise<void> {
  //   // await this.captchaLogService.create(account, code, provider, uid);
  // }
}
