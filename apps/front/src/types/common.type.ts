import { FormItemProps } from 'antd';

/**
 * Ant Design 组件的名称类型
 */
export type AntdComponentName =
  | 'a-input'
  | 'a-switch'
  | 'a-select'
  | 'a-textarea'
  | 'a-checkbox'
  | 'a-checkbox-group'
  | 'a-date-picker'
  | 'a-range-picker'
  | 'a-time-picker'
  | 'a-auto-complete'
  | 'a-cascader'
  | 'a-input-number'
  | 'a-radio-group'
  | 'a-tree-select';

/**
 * 自定义组件的名称类型
 */
export type CustomComponentName =
  | 'c-search'
  | 'c-range';

/**
 * Ant Design 组件的属性类型
 */
export type AntdComponentProps = any;

/**
 * 定义组件属性
 */
export interface IComponentAttrs {
  style?: React.CSSProperties;
  readonly?: boolean;
  options?: [];
}

/**
 * 扩展 Ant Design 的 FormItemProps 类型
 */
export interface IFormItemProps extends FormItemProps {
  type?: AntdComponentName | CustomComponentName;
  title?: string;
  name: string;
  optionKey?: string;
  attrs?: IComponentAttrs & {
    [key: string]: string | number | boolean;
  };
  span?: number;
}

/**
 * 表示可选项列表中的单个选项
 */
export interface IOption {
  /**
   * 选项的显示标签
   */
  label: string;

  /**
   * 选项的值
   */
  value: string | number;
}
