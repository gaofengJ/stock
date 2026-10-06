/** 同花顺分类：行业和概念属于板块，上市板块是独立的市场分类。 */
export const sectorKindLabel = (kind: string) => (kind === 'I' ? '行业' : '概念');

export const sectorDefinition = '板块是行业与概念的统称。行业按主营业务分类；概念按共同主题或关联特征归类，一只股票可属于多个概念。';
