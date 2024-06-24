import { DynamicModule, Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { SentiModule } from './senti/senti.module';

const modules = [SentiModule];

@Module({})
export class ProcessedModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      imports: [
        ...modules,
        RouterModule.register([
          {
            path: 'processed',
            module: ProcessedModule,
            children: [...modules],
          },
        ]),
      ],
      module: ProcessedModule,
      exports: [...modules],
    };
  }
}
