import React, { FC, useEffect } from 'react';
import { Form } from 'antd';
import { IFormItemProps } from '@/types/common.type';

interface IProps {
  configs: IFormItemProps[];
  editable?: boolean;
  searchParams: { [key: string]: any };
  setSearchParams: (params: { [key: string]: any }) => void;
}

const CSearchForm: FC<IProps> = ({
  configs,
  editable = true,
  searchParams,
  setSearchParams,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(searchParams);
  }, [searchParams, form]);

  const handleValuesChange = (changedValues: any, allValues: any) => {
    console.log(changedValues, allValues);
    setSearchParams(allValues);
  };

  /**
   * 渲染 Label
   */
  const renderLabell = (config: IFormItemProps, editable?: boolean) => {
    if (!editable) { // 不可编辑态
      return (<span>{config.label}</span>);
    }
    if (!searchParams[config.name]) { // 筛选值为空
      return null;
    }
    return (<span>{config.label}</span>);
  };
  /**
   * 渲染 Content
   */
  const renderContent = (config: IFormItemProps, editable?: boolean) => {
    if (editable) {
      return config.component
        ? React.cloneElement(config.component, config.attrs)
        : null;
    }
    // 查看态
    return <span>{config.render?.(config) ?? '-'}</span>;
  };
  return (
    <Form
      form={form}
      initialValues={searchParams}
      onValuesChange={handleValuesChange}
      variant="filled"
      layout="inline"
    >
      {configs.map((config) => (
        <Form.Item
          key={config.name}
          name={config.name}
          label={renderLabell(config, editable)}
          rules={config.rules}
          colon={false}
        >
          {renderContent(config, editable)}
        </Form.Item>
      ))}
    </Form>
  );
};

export default CSearchForm;
