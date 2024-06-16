import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DataSourceService {
  private static dataSource: DataSource;

  constructor(dataSource: DataSource) {
    DataSourceService.dataSource = dataSource;
  }

  static getDataSource(): DataSource {
    return DataSourceService.dataSource;
  }
}
