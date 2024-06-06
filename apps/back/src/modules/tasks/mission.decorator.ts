import { SetMetadata } from '@nestjs/common';
import { MISSION_DECORATOR_KEY } from '@/constants/global';

/**
 * 定时任务标记，在任务类或者任务处理函数上标记它们是定时任务
 */
export const Mission = () => SetMetadata(MISSION_DECORATOR_KEY, true);
