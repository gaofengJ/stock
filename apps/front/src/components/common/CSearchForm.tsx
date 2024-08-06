import { FC } from 'react';
import { Form } from 'antd';
import { IFormItemProps } from '@/types/common.type';
import CFormItem from './CFormItem';

interface IProps {
  configs: IFormItemProps[];
  editable?: boolean;
}

const CSearchForm: FC<IProps> = ({ configs, editable = true }) => (
  <Form variant="filled" layout="inline">
    {configs.map((config) => (
      <CFormItem key={config.name} editable={editable} config={config} />
    ))}
  </Form>
);

export default CSearchForm;
