import { FormItemProps } from 'antd';
import { CSSProperties, ReactElement, ReactNode } from 'react';

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

/**
 * 定义组件属性
 */
export interface IComponentAttrs {
  style?: React.CSSProperties;
  placeholder?: string;
  options?: IOption[];
}

/**
 * 扩展 Ant Design 的 FormItemProps 类型
 */
export interface IFormItemProps extends FormItemProps {
  component?: ReactElement;
  name: string;
  readonly?: boolean;
  attrs?: IComponentAttrs & {
    [key: string]: string | number | boolean | CSSProperties | IOption[] | any;
  };
  render?: (record: IFormItemProps) => ReactNode;
}
