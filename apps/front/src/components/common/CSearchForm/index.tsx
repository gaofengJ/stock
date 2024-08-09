import React, { FC, useEffect } from 'react';
import { Form } from 'antd';
import { IFormItemProps } from '@/types/common.type';

interface IProps {
  configs: IFormItemProps[];
  searchParams: { [key: string]: any };
  setSearchParams: (params: { [key: string]: any }) => void;
}

const CSearchForm: FC<IProps> = ({
  configs,
  searchParams,
  setSearchParams,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(searchParams);
  }, [searchParams, form]);

  const handleValuesChange = (
    _: unknown,
    allValues: { [key: string]: any },
  ) => {
    setSearchParams(allValues);
  };

  /**
   * 渲染 Label
   */
  const renderLabell = (config: IFormItemProps) => {
    if (!searchParams[config.name]) {
      // 筛选值为空
      return null;
    }
    return <span className="c-search-form-label">{config.label}</span>;
  };
  /**
   * 渲染 Content
   */
  const renderContent = (config: IFormItemProps) => (config.component
    ? React.cloneElement(config.component, config.attrs)
    : null);
  return (
    <Form
      form={form}
      initialValues={searchParams}
      onValuesChange={handleValuesChange}
      variant="filled"
      layout="inline"
      rootClassName="c-search-form"
    >
      {configs.map((config) => (
        <Form.Item
          key={config.name}
          name={config.name}
          label={renderLabell(config)}
          rules={config.rules}
          colon={false}
        >
          {renderContent(config)}
        </Form.Item>
      ))}
    </Form>
  );
};

export default CSearchForm;
