'use client';

import React, { useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
  Calendar, CalendarProps, Col, Row,
} from 'antd';
import { HolidayUtil, Lunar } from 'lunar-typescript';
import classNames from 'classnames';
import { NSGetBasicTradeCalList } from '@/api/services.types';

interface IProps {
  items: NSGetBasicTradeCalList.IRes;
  year: string;
}

const monthArr = Array.from({ length: 12 }, (_, index) => index);

const TradeCalendarGrid = ({ items, year }: IProps) => {
  const tradeCalMap = useMemo(() => {
    const result: Record<string, boolean> = {};
    items.forEach((item) => {
      result[item.calDate] = Number(item.isOpen) === 1;
    });
    return result;
  }, [items]);

  const cellRender: CalendarProps<Dayjs>['fullCellRender'] = (
    date: Dayjs,
    info: any,
  ) => {
    const lunarDay = Lunar.fromDate(date.toDate());
    const lunar = lunarDay.getDayInChinese();
    const solarTerm = lunarDay.getJieQi();
    const isWeekend = date.day() === 6 || date.day() === 0;
    const holiday = HolidayUtil.getHoliday(
      date.get('year'),
      date.get('month') + 1,
      date.get('date'),
    );
    const displayHoliday = holiday?.getTarget() === holiday?.getDay()
      ? holiday?.getName()
      : undefined;

    if (info.type !== 'date') return null;
    return React.cloneElement(info.originNode, {
      ...info.originNode.props,
      className: classNames('date-cell', {
        'is-open': tradeCalMap[date.format('YYYY-MM-DD')],
      }),
      children: (
        <div
          className={classNames('date-cell-text', {
            'date-cell-weekend': isWeekend,
            today: date.format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'),
            'past-date':
              date.format('YYYY-MM-DD') < dayjs().format('YYYY-MM-DD'),
          })}
        >
          <span className="date-cell-text-number">{date.get('date')}</span>
          <div className="date-cell-text-lunar">
            {displayHoliday || solarTerm || lunar}
          </div>
        </div>
      ),
    });
  };

  return (
    <Row gutter={[16, 16]}>
      {monthArr.map((month) => (
        <Col span={6} key={month}>
          <div className="relative">
            <div className="trade-cal-calendar-month">{month + 1}</div>
            <Calendar
              fullscreen={false}
              fullCellRender={cellRender}
              rootClassName="trade-cal-calendar"
              value={dayjs(`${year}-${month + 1}-01`)}
            />
          </div>
        </Col>
      ))}
    </Row>
  );
};

export default TradeCalendarGrid;
