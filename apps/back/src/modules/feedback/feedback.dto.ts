import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Length, Min } from 'class-validator';

export class FeedbackMessageDto {
  @Transform(({ obj, key }) =>
    typeof obj[key] === 'string' ? obj[key].trim() : obj[key],
  )
  @IsString()
  @Length(1, 2000, { message: '反馈内容为1至2000个字符' })
  content: string;
}

export class FeedbackPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}
