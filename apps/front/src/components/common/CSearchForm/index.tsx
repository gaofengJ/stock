import React, { FC, useEffect } from 'react';
import { Form } from 'antd';
import { IFormItemProps } from '@/types/common.type';

import './index.sass';

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
  const renderContent = (config: IFormItemProps) => {
    // 搜索内容存在时，将左侧 border-radius 设置为 0
    if (searchParams[config.name]) {
      config.attrs!.style = {
        ...(config.attrs?.style || {}),
        borderRadius: '0 6px 6px 0',
      };
    } else {
      config.attrs!.style = {
        ...(config.attrs?.style || {}),
        borderRadius: '6px',
      };
    }
    return (config.component
      ? React.cloneElement(config.component, config.attrs)
      : null);
  };
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
