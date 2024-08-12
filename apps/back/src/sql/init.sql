SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for t_processed_senti
-- ----------------------------
DROP TABLE IF EXISTS `t_processed_senti`;
CREATE TABLE `t_processed_senti` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `trade_date` date NOT NULL COMMENT '交易日期',
  `a` int NOT NULL COMMENT '当日涨停，非一字涨停，非ST',
  `b` int NOT NULL COMMENT '前一日涨停，非一字涨停，非ST',
  `c` int NOT NULL COMMENT '前一日涨停，非一字涨停，非ST，当日高开',
  `d` int NOT NULL COMMENT '前一日涨停，非一字涨停，非ST，当日上涨',
  `e` int NOT NULL COMMENT '当日曾涨停，非ST',
  `senti_a` decimal(16,2) NOT NULL COMMENT '非一字涨停',
  `senti_b` decimal(16,2) NOT NULL COMMENT '打板高开率',
  `senti_c` decimal(16,2) NOT NULL COMMENT '打板成功率',
  `senti_d` decimal(16,2) NOT NULL COMMENT '打板被砸率',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='赚钱效应表';

-- ----------------------------
-- Table structure for t_source_daily
-- ----------------------------
DROP TABLE IF EXISTS `t_source_daily`;
CREATE TABLE `t_source_daily` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `ts_code` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票代码（包含交易所）',
  `name` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票名称',
  `trade_date` date NOT NULL COMMENT '交易日期',
  `up_limit` decimal(16,2) NOT NULL COMMENT '涨停价',
  `down_limit` decimal(16,2) NOT NULL COMMENT '跌停价',
  `open` decimal(16,2) NOT NULL COMMENT '开盘价',
  `high` decimal(16,2) NOT NULL COMMENT '最高价',
  `low` decimal(16,2) NOT NULL COMMENT '最低价',
  `close` decimal(16,2) NOT NULL COMMENT '收盘价',
  `pre_close` decimal(16,2) NOT NULL COMMENT '昨收价',
  `change` decimal(16,2) NOT NULL COMMENT '涨跌额',
  `pct_chg` decimal(16,2) NOT NULL COMMENT '涨跌幅',
  `vol` decimal(16,2) NOT NULL COMMENT '成交量（手）',
  `amount` decimal(16,2) NOT NULL COMMENT '成交额（千元）',
  `turnover_rate` decimal(16,2) DEFAULT NULL COMMENT '换手率',
  `turnover_rate_f` decimal(16,2) DEFAULT NULL COMMENT '换手率（自由流通股）',
  `volume_ratio` decimal(16,2) DEFAULT NULL COMMENT '量比',
  `pe` decimal(16,2) DEFAULT NULL COMMENT '市盈率（总市值/总利润）',
  `pe_ttm` decimal(16,2) DEFAULT NULL COMMENT '市盈率（TTM）',
  `pb` decimal(16,2) DEFAULT NULL COMMENT '市净率（总市值/净资产）',
  `ps` decimal(16,2) DEFAULT NULL COMMENT '市销率',
  `ps_ttm` decimal(16,2) DEFAULT NULL COMMENT '市销率（TTM）',
  `dv_ratio` decimal(16,2) DEFAULT NULL COMMENT '股息率（%）',
  `dv_ttm` decimal(16,2) DEFAULT NULL COMMENT '股息率（TTM）（%）',
  `total_share` decimal(16,2) DEFAULT NULL COMMENT '总股本（万股）',
  `float_share` decimal(16,2) DEFAULT NULL COMMENT '流通股本（万股）',
  `free_share` decimal(16,2) DEFAULT NULL COMMENT '自由流通股本（万股）',
  `total_mv` decimal(16,2) DEFAULT NULL COMMENT '总市值（万元）',
  `circ_mv` decimal(16,2) DEFAULT NULL COMMENT '流通市值（万元）',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='每日交易数据表';

-- ----------------------------
-- Table structure for t_source_limit
-- ----------------------------
DROP TABLE IF EXISTS `t_source_limit`;
CREATE TABLE `t_source_limit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `ts_code` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票代码（包含交易所）',
  `trade_date` date NOT NULL COMMENT '交易日期',
  `name` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票名称',
  `industry` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '所属行业',
  `close` decimal(16,2) NOT NULL COMMENT '收盘价',
  `pct_chg` decimal(16,2) NOT NULL COMMENT '涨跌幅',
  `amount` decimal(16,2) DEFAULT NULL COMMENT '成交额（千元）',
  `limit_amount` decimal(16,2) DEFAULT NULL COMMENT '板上成交额（千元）',
  `float_mv` decimal(16,2) DEFAULT NULL COMMENT '流通市值',
  `total_mv` decimal(16,2) DEFAULT NULL COMMENT '总市值',
  `turnover_ratio` decimal(16,2) DEFAULT NULL COMMENT '换手率',
  `fd_amount` decimal(16,2) DEFAULT NULL COMMENT '封单金额',
  `first_time` time DEFAULT NULL COMMENT '首次封板时间',
  `last_time` time DEFAULT NULL COMMENT '最后封板时间',
  `open_times` int DEFAULT NULL COMMENT '打开次数',
  `up_stat` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '涨停统计（N/T T天有N次涨停）',
  `limit_times` int DEFAULT NULL COMMENT '连板数',
  `limit` varchar(1) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'D跌停，U涨停，Z炸板',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='每日涨跌停个股统计表';

-- ----------------------------
-- Table structure for t_source_stock
-- ----------------------------
DROP TABLE IF EXISTS `t_source_stock`;
CREATE TABLE `t_source_stock` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `ts_code` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票代码（包含交易所）',
  `symbol` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票代码',
  `name` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '股票名称',
  `area` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '所在区域',
  `industry` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '所在行业',
  `fullname` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '股票全称',
  `enname` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '英文全称',
  `cnspell` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '拼音缩写',
  `market` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '市场类型（主板/创业板/科创板/北交所）',
  `exchange` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '交易所代码',
  `curr_type` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '交易货币',
  `list_status` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '上市状态（L上市中 D已退市 P暂停上市）',
  `list_date` date NOT NULL COMMENT '上市日期',
  `delist_date` date DEFAULT NULL COMMENT '退市日期',
  `is_hs` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '是否沪深港通标的，N否 H沪股通 S深股通',
  `act_name` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '实控人名称',
  `act_ent_type` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '实控人企业性质',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='股票基本信息表';

-- ----------------------------
-- Table structure for t_source_trade_cal
-- ----------------------------
DROP TABLE IF EXISTS `t_source_trade_cal`;
CREATE TABLE `t_source_trade_cal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `cal_date` date NOT NULL COMMENT '日期',
  `is_open` tinyint NOT NULL COMMENT '是否为交易日期 0: 否 1: 是',
  `pre_trade_date` date NOT NULL COMMENT '上一个交易日期',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='交易日期表';

SET FOREIGN_KEY_CHECKS = 1;
