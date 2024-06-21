import { Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { SentiModule } from './senti/senti.module';

const modules = [SentiModule];

@Module({
  imports: [
    ...modules,
    RouterModule.register([
      {
        path: 'processed',
        // eslint-disable-next-line no-use-before-define
        module: ProcessedModule,
        children: [...modules],
      },
    ]),
  ],
  exports: [...modules],
})
export class ProcessedModule {}
