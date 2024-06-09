/*
 Navicat Premium Data Transfer

 Source Server         : stock
 Source Server Type    : MySQL
 Source Server Version : 50732
 Source Host           : 47.99.111.167:3306
 Source Schema         : mufeng

 Target Server Type    : MySQL
 Target Server Version : 50732
 File Encoding         : 65001

 Date: 09/06/2024 00:18:21
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for t_c_gap
-- ----------------------------
DROP TABLE IF EXISTS `t_c_gap`;
CREATE TABLE `t_c_gap`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `ts_code` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票代码',
  `gap_low` float(16, 2) NOT NULL COMMENT '缺口下限',
  `status` int(11) NOT NULL COMMENT '缺口状态(0: 封闭，1：打开)',
  `created_at` bigint(20) NOT NULL COMMENT '创建时间',
  `updated_at` bigint(20) NOT NULL COMMENT '更新时间',
  `version` bigint(20) NOT NULL COMMENT '版本号',
  `add_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '添加日期',
  `gap_high` float(16, 2) NOT NULL COMMENT '缺口上限',
  `gap_volume_ratio` float(16, 2) NULL DEFAULT NULL COMMENT '缺口当天量比',
  `gap_turnover_rate` float(16, 2) NULL DEFAULT NULL COMMENT '缺口当日换手率',
  `gap_turnover_rate_f` float(16, 2) NULL DEFAULT NULL COMMENT '缺口当天实际换手率',
  `gap_days` int(11) NOT NULL COMMENT '缺口添加天数',
  `gap_pct_chg` float(16, 2) NOT NULL COMMENT '缺口后累计涨幅（10日内）',
  `close_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '移除日期',
  `gap_close` float(16, 2) NOT NULL COMMENT '缺口当日收盘价',
  `gap_pct_chg1` float(16, 2) NULL DEFAULT NULL COMMENT '1日涨幅',
  `gap_pct_chg2` float(16, 2) NULL DEFAULT NULL COMMENT '2日涨幅',
  `gap_pct_chg3` float(16, 2) NULL DEFAULT NULL COMMENT '3日涨幅',
  `gap_pct_chg4` float(16, 2) NULL DEFAULT NULL COMMENT '4日涨幅',
  `gap_pct_chg5` float(16, 2) NULL DEFAULT NULL COMMENT '5日涨幅',
  `gap_pct_chg0` float(16, 2) NULL DEFAULT NULL COMMENT '0日涨幅',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 32552 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for t_daily
-- ----------------------------
DROP TABLE IF EXISTS `t_daily`;
CREATE TABLE `t_daily`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `ts_code` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票代码',
  `trade_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '交易日期',
  `up_limit` float(16, 2) NOT NULL COMMENT '涨停价',
  `down_limit` float(16, 2) NOT NULL COMMENT '跌停价',
  `open` float(16, 2) NOT NULL COMMENT '开盘价',
  `high` float(16, 2) NOT NULL COMMENT '最高价',
  `low` float(16, 2) NOT NULL COMMENT '最低价',
  `close` float(16, 2) NOT NULL COMMENT '收盘价',
  `pre_close` float(16, 2) NOT NULL COMMENT '昨收价',
  `change` float(16, 2) NOT NULL COMMENT '涨跌额',
  `pct_chg` float(16, 2) NOT NULL COMMENT '涨跌幅',
  `vol` float(16, 2) NOT NULL COMMENT '成交量（手）',
  `amount` float(16, 2) NOT NULL COMMENT '成交额（千元）',
  `turnover_rate` float(16, 2) NULL DEFAULT NULL COMMENT '换手率',
  `turnover_rate_f` float(16, 2) NULL DEFAULT NULL COMMENT '换手率（自由流通股）',
  `volume_ratio` float(16, 2) NULL DEFAULT NULL COMMENT '量比',
  `pe` float(16, 2) NULL DEFAULT NULL COMMENT '市盈率（总市值/总利润）',
  `pe_ttm` float(16, 2) NULL DEFAULT NULL COMMENT '市盈率（TTM）',
  `pb` float(16, 2) NULL DEFAULT NULL COMMENT '市净率（总市值/净资产）',
  `ps` float(16, 2) NULL DEFAULT NULL COMMENT '市销率',
  `ps_ttm` float(16, 2) NULL DEFAULT NULL COMMENT '市销率（TTM）',
  `dv_ratio` float(16, 2) NULL DEFAULT NULL COMMENT '股息率（%）',
  `dv_ttm` float(16, 2) NULL DEFAULT NULL COMMENT '股息率（TTM）（%）',
  `total_share` float(16, 2) NULL DEFAULT NULL COMMENT '总股本',
  `float_share` float(16, 2) NULL DEFAULT NULL COMMENT '流通股本',
  `free_share` float(16, 2) NULL DEFAULT NULL COMMENT '自由流通股本',
  `total_mv` float(16, 2) NULL DEFAULT NULL COMMENT '总市值',
  `circ_mv` float(16, 2) NULL DEFAULT NULL COMMENT '流通市值',
  `created_at` bigint(20) NOT NULL COMMENT '创建时间',
  `updated_at` bigint(20) NOT NULL COMMENT '更新时间',
  `version` bigint(20) NOT NULL COMMENT '版本号',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 3927983 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for t_limit_list
-- ----------------------------
DROP TABLE IF EXISTS `t_limit_list`;
CREATE TABLE `t_limit_list`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `ts_code` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票代码',
  `trade_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '交易日期',
  `name` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票名称',
  `close` float(16, 2) NOT NULL COMMENT '收盘价',
  `pct_chg` float(16, 2) NOT NULL COMMENT '涨跌幅',
  `fd_amount` float(16, 2) NULL DEFAULT NULL COMMENT '封单金额',
  `first_time` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '首次封板时间',
  `last_time` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '最后封板时间',
  `open_times` int(11) NULL DEFAULT NULL COMMENT '打开次数',
  `limit` varchar(1) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT 'D跌停，U涨停，Z炸板',
  `created_at` bigint(20) NOT NULL COMMENT '创建时间',
  `updated_at` bigint(20) NOT NULL COMMENT '更新时间',
  `version` bigint(20) NOT NULL COMMENT '版本号',
  `industry` varchar(64) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '所属行业',
  `amount` float(16, 2) NULL DEFAULT NULL COMMENT '成交额（千元）',
  `limit_amount` float(16, 2) NULL DEFAULT NULL COMMENT '板上成交额（千元）',
  `float_mv` float(16, 2) NULL DEFAULT NULL COMMENT '流通市值',
  `total_mv` float(16, 2) NULL DEFAULT NULL COMMENT '总市值',
  `turnover_ratio` float(16, 2) NULL DEFAULT NULL COMMENT '换手率',
  `up_stat` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '涨停统计（N/T T天有N次涨停）',
  `limit_times` int(11) NULL DEFAULT NULL COMMENT '连板数',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 68159 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for t_market_mood
-- ----------------------------
DROP TABLE IF EXISTS `t_market_mood`;
CREATE TABLE `t_market_mood`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `trade_date` varchar(32) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '日期',
  `a` int(11) NOT NULL COMMENT '2020年7月7日涨停，非一字涨停，非ST',
  `b` int(11) NOT NULL COMMENT '2020年7月6日涨停，非一字涨停，非ST',
  `c` int(11) NOT NULL COMMENT '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日高开',
  `d` int(11) NOT NULL COMMENT '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日上涨',
  `e` int(11) NOT NULL COMMENT '2020年7月7日曾涨停，非ST',
  `sentiment_a` float(16, 0) NOT NULL COMMENT '非一字涨停',
  `sentiment_b` float(16, 0) NOT NULL COMMENT '打板高开率',
  `sentiment_c` float(16, 0) NOT NULL COMMENT '打板成功率',
  `sentiment_d` float(16, 0) NOT NULL COMMENT '打板被砸率',
  `created_at` bigint(20) NOT NULL COMMENT '创建时间',
  `updated_at` bigint(20) NOT NULL COMMENT '更新时间',
  `version` bigint(20) NOT NULL COMMENT '版本号',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 590 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for t_stock_basic
-- ----------------------------
DROP TABLE IF EXISTS `t_stock_basic`;
CREATE TABLE `t_stock_basic`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `ts_code` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票代码（包含交易所）',
  `symbol` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票代码',
  `name` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票名称',
  `area` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '所在区域',
  `industry` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '所在行业',
  `fullname` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '股票全称',
  `enname` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '英文全称',
  `cnspell` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '拼音缩写',
  `market` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '市场类型（主板/中小板/创业板/科创板/CDR）',
  `exchange` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '交易所代码',
  `curr_type` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '交易货币',
  `list_status` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '上市状态（L上市 D退市 P暂停上市）',
  `list_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '上市日期',
  `delist_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '退市日期',
  `is_hs` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '是否沪深港通标的，N否 H沪股通 S深股通',
  `created_at` bigint(20) NOT NULL COMMENT '创建时间',
  `updated_at` bigint(20) NOT NULL COMMENT '更新时间',
  `version` bigint(20) NOT NULL COMMENT '版本号',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `t_stock_basic_ts_code`(`ts_code`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2269 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for t_trade_cal
-- ----------------------------
DROP TABLE IF EXISTS `t_trade_cal`;
CREATE TABLE `t_trade_cal`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `cal_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '日期',
  `is_open` int(11) NOT NULL COMMENT '是否为交易日期',
  `pre_trade_date` varchar(16) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '日期',
  `created_at` bigint(20) NOT NULL COMMENT '创建时间',
  `updated_at` bigint(20) NOT NULL COMMENT '更新时间',
  `version` bigint(20) NOT NULL COMMENT '版本号',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4018 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
