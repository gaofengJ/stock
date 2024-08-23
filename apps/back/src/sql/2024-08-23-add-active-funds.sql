SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for t_source_active_funds
-- ----------------------------
DROP TABLE IF EXISTS `t_source_active_funds`;
CREATE TABLE `t_source_active_funds` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `name` varchar(16) COLLATE utf8mb4_general_ci NOT NULL COMMENT '游资名称',
  `orgs` varchar(1024) COLLATE utf8mb4_general_ci NOT NULL COMMENT '关联机构',
  `desc` varchar(1024) COLLATE utf8mb4_general_ci NOT NULL COMMENT '说明',
  PRIMARY KEY (`id`),
  KEY `index_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=97 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='游资名录表';

SET FOREIGN_KEY_CHECKS = 1;
