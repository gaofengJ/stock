import { FC } from 'react';
import { Form } from 'antd';
import { IFormItemProps } from '@/types/common.type';

interface IProps {
  config: IFormItemProps;
  editable: boolean;
}

const CFormItem: FC<IProps> = ({
  config,
  editable,
}) => {
  const renderContent = (config: IFormItemProps, editable?: boolean) => {
    if (editable) {
      if (config?.readonly) { // 只读态
        return (
          <span className="text-symbol-black text-13 font-normal">
            {config.render?.(config) ?? '-'}
          </span>
        );
      }
      return config.component;
    }
    // 查看态
    return (
      <span>{config.render?.(config) ?? '-'}</span>
    );
  };
  return (
    <Form.Item
      name={config.name}
      label={config.label}
      noStyle={config.noStyle}
      rules={config.rules}
    >
      {renderContent(config, editable)}
    </Form.Item>
  );
};

export default CFormItem;
