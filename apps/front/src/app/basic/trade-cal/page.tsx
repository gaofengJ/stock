'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { debounce } from 'lodash-es';
import dayjs, { Dayjs } from 'dayjs';

import {
  Calendar, CalendarProps, Col, Row, Spin,
} from 'antd';
import { HolidayUtil, Lunar } from 'lunar-typescript';
import classNames from 'classnames';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicTradeCalList } from '@/api/services';
import { NSGetBasicTradeCalList } from '@/api/services.types';

import CSearchForm from '@/components/common/CSearchForm';
import { useTradeCalConfigs } from './form-configs';
import './limits.sass';

function BasicTradeCalPage() {
  // searchParams 的初始值
  const initialSearchParams: NSGetBasicTradeCalList.IParams = {
    year: dayjs().format('YYYY'),
  };
  const [searchParams, setSearchParams] = useState<NSGetBasicTradeCalList.IParams>(initialSearchParams);

  const [loading, setLoading] = useState(false);

  // tradeCalData 的初始值
  const initialTradeCalData: {
    items: NSGetBasicTradeCalList.IRes;
  } = {
    items: [],
  };
  const [tradeCalData, setTradeCalData] = useState(initialTradeCalData);

  const [tradeCalMap, setTradeCalMap] = useState<Record<string, boolean>>({});

  /**
   * 获取 list
   */
  const getTradeCal = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await getBasicTradeCalList(searchParams);
      setTradeCalData((state) => ({
        ...state,
        items: data,
      }));
      console.log(tradeCalData);
    } catch (e) {
      console.error('e', e);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const debounceGetTradeCal = debounce(getTradeCal, 300);
    debounceGetTradeCal();

    // 清理函数以防止在组件卸载时继续调用
    return () => {
      debounceGetTradeCal.cancel();
    };
  }, [getTradeCal]);

  useEffect(() => {
    if (tradeCalData.items?.length) {
      const tempMap: Record<string, boolean> = {};
      for (let i = 0; i < tradeCalData.items.length; i += 1) {
        tempMap[tradeCalData.items[i].calDate] = !!tradeCalData.items[i].isOpen;
      }
      setTradeCalMap(tempMap);
    }
  }, [tradeCalData.items]);

  const tradeCalConfigs = useTradeCalConfigs();

  // 月份 arr
  const monthArr = [];
  for (let i = 0; i < 12; i += 1) {
    monthArr.push(i);
  }

  /**
   * 更新 searchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      year: val.year.format('YYYY'),
    }));
  };

  /**
   * @description 自定义 Ant Design Calendar 组件的单元格渲染函数
   * @param date 当前单元格的日期对象，类型为 Dayjs
   * @param info 当前单元格的额外信息对象，包括单元格类型和原始节点
   * @returns 自定义的单元格内容
   */
  const cellRender: CalendarProps<Dayjs>['fullCellRender'] = (
    date: Dayjs,
    info: any,
  ) => {
    // 将 Dayjs 对象转换为 Lunar 对象以获取农历信息
    const lunarDay = Lunar.fromDate(date.toDate());
    // 获取农历日的中文名称
    const lunar = lunarDay.getDayInChinese();
    // 获取节气信息
    const solarTerm = lunarDay.getJieQi();
    // 判断当前日期是否为周末（星期六或星期日）
    const isWeekend = date.day() === 6 || date.day() === 0;
    // 获取节假日信息
    const h = HolidayUtil.getHoliday(
      date.get('year'),
      date.get('month') + 1,
      date.get('date'),
    );
    // 根据节假日信息判断是否需要显示节假日名称
    const displayHoliday = h?.getTarget() === h?.getDay() ? h?.getName() : undefined;
    // 当单元格类型为日期时执行
    if (info.type === 'date') {
      return React.cloneElement(info.originNode, {
        ...info.originNode.props,
        className: classNames('date-cell', {
          'is-open': tradeCalMap[date.format('YYYY-MM-DD')],
        }),
        children: (
          <div className={classNames('date-cell-text', {
            'date-cell-weekend': isWeekend,
            today: date.format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'),
            'past-date': date.format('YYYY-MM-DD') < dayjs().format('YYYY-MM-DD'),
          })}
          >
            <span
              className="date-cell-text-number"
            >
              {/* 显示日期 */}
              {date.get('date')}
            </span>
            {info.type === 'date' && (
              <div className="date-cell-text-lunar">
                {/* 显示农历、节气或节假日名称 */}
                {displayHoliday || solarTerm || lunar}
              </div>
            )}
          </div>
        ),
      });
    }
    return null;
  };

  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicTradeCal}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <div className="mb-16">
          <CSearchForm
            configs={tradeCalConfigs}
            searchParams={{
              ...searchParams,
              year: dayjs(searchParams.year),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <div className="h-[calc(100vh-176px)] overflow-y-auto overflow-x-hidden">
          {loading ? (
            <Spin className="w-full h-320 !leading-[320px]" size="large" />
          ) : (
            <Row gutter={[16, 16]}>
              {monthArr.map((i) => (
                <Col span={6} key={i}>
                  <div className="relative">
                    <div className="trade-cal-calendar-month">{i + 1}</div>
                    <Calendar
                      fullscreen={false}
                      fullCellRender={cellRender}
                      rootClassName="trade-cal-calendar"
                      defaultValue={dayjs(`${searchParams.year}-${i + 1}-01`)}
                    />
                  </div>
                </Col>
              ))}
            </Row>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default BasicTradeCalPage;
