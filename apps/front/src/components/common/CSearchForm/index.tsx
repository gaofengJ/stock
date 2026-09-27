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
          label={config.label}
          rules={config.rules}
          colon={false}
        >
          {config.component ? React.cloneElement(config.component, config.attrs) : null}
        </Form.Item>
      ))}
    </Form>
  );
};

export default CSearchForm;
