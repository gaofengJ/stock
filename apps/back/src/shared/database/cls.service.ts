import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ClsServiceStatic {
  private static clsService: ClsService;

  constructor(clsService: ClsService) {
    ClsServiceStatic.clsService = clsService;
  }

  static getClsService(): ClsService {
    return ClsServiceStatic.clsService;
  }
}
