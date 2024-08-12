import { Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { LimitsModule } from './limits/limits.module';
import { SentiModule } from './senti/senti.module';

const modules = [LimitsModule, SentiModule];

@Module({
  imports: [
    ...modules,
    RouterModule.register([
      {
        path: 'analysis',
        // eslint-disable-next-line no-use-before-define
        module: AnalysisModule,
        children: [...modules],
      },
    ]),
  ],
  exports: [...modules],
})
export class AnalysisModule {}
