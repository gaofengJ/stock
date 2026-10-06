import { IsIn, IsOptional, Matches } from 'class-validator';

export const RESEARCH_SECTIONS = [
  'funds',
  'margin',
  'holders',
  'business',
  'capital',
  'financial',
  'institutions',
] as const;
export type ResearchSection = (typeof RESEARCH_SECTIONS)[number];

export class ResearchQuery {
  @Matches(/^\d{6}\.(SH|SZ|BJ)$/) code: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;

  @IsIn(RESEARCH_SECTIONS) section: ResearchSection;

  @IsOptional() @IsIn(['P', 'D', 'I']) businessType?: string;

  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}

export class MarketResearchQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;

  @IsOptional() @IsIn(['I', 'N']) kind?: string;

  @IsOptional() @IsIn(['funds', 'margin', 'ranking']) section?: string;
}
