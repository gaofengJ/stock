-- ----------------------------
-- Index for t_source_trade_cal
-- ----------------------------
CREATE INDEX index_cal_date ON t_source_trade_cal (cal_date);

-- ----------------------------
-- Index for t_source_stock
-- ----------------------------
CREATE INDEX index_ts_code ON t_source_stock (ts_code);
CREATE INDEX index_name ON t_source_stock (name);

-- ----------------------------
-- Index for t_source_daily
-- ----------------------------
CREATE INDEX index_ts_code ON t_source_daily (ts_code);
CREATE INDEX index_trade_date ON t_source_daily (trade_date);

-- ----------------------------
-- Index for t_source_limit
-- ----------------------------
CREATE INDEX index_ts_code ON t_source_limit (ts_code);
CREATE INDEX index_trade_date ON t_source_limit (trade_date);

-- ----------------------------
-- Index for t_processed_senti
-- ----------------------------
CREATE INDEX index_trade_date ON t_processed_senti (trade_date);